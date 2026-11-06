---
title: Let the model suggest, let code decide
description: In ScenePilot, Gemini proposes new shoot schedules and plain Python decides whether they're allowed. That Python had bugs of its own.
date: 2026-11-06
tags:
  - scenepilot
  - llm
  - agents
  - python
---

ScenePilot is an AI assistant director I built for Google Cloud's Agentic Cinema hackathon, in the Parallel partner track. Something goes wrong on a shoot day, say rain forecast for the afternoon of day 4, and it helps the producer work out a new schedule.

The tempting version is to hand the model the schedule and the forecast and ask for a new plan. It would give you one, and it would look reasonable. But nothing in that setup checks whether the plan runs a rooftop scene past a noise curfew, or starts a daylight exterior after sunset. On a film set those aren't small mistakes. A permit window or a curfew is a rule someone else enforces on you.

So the whole project follows one rule: the model can suggest anything, but it never decides whether a schedule is allowed.

## Who does what

When a disruption comes in, the rescue runs as a short sequence of steps:

1. Check the disruption against live web sources.
2. Work out which scenes it affects. If nothing is affected, stop there.
3. Generate candidate schedules in code, and check each one.
4. Let Gemini propose up to two more, checked the same way.
5. Rank them, and let Gemini explain the options.
6. Stop and wait for the producer.

The candidates in step 3 are plain enumeration: orderings of the day's scenes, with up to two affected scenes deferred and cover scenes pulled in. Any set bigger than six scenes is skipped, so each set is at most 720 orderings, which is nothing for a computer. Every one goes through the checker: cast and location availability, the disruption window, usable daylight, golden hour, permit windows and curfews, meal breaks and turnaround before the next call. Each gets a score and a list of violations.

Gemini's proposals don't get a shortcut. They go through the same function.

<!-- adapted from services/agent/scenepilot/services/recovery.py -->
```python
def add_proposed_option(project, day, disruption, existing, order_numbers, deferred_numbers, title, strategy, ...):
    """Validate a Gemini-proposed ordering through the same deterministic pipeline."""
    baseline = sorted(day.items, key=lambda i: to_minutes(i.start))
    try:
        order = [project.scene_by_number(n).id for n in order_numbers]
        deferred = [project.scene_by_number(n).id for n in deferred_numbers]
    except KeyError:
        return None
    if not order:
        return None
    opt = build_option(project, day, disruption, baseline, order, deferred, origin="gemini", ...)
```

If the model names a scene that doesn't exist, the proposal is dropped. If it proposes something already on the list, the existing option gets marked as Gemini's too.

One detail is deliberate. The screen shows at most three feasible and two rejected options, but Gemini's proposals are always shown, whether they pass or not. The point of the design is that you can see the model being overruled. Hiding the rejected ones would hide exactly that.

The model does get the last word on the explanation. It writes the trade-offs in plain English. If that call fails, there's a fallback rationale built from the checker's own scores, so the producer still gets a reason. Then the run ends at "awaiting approval". Nothing changes on the schedule until a person says yes.

## Facts from the web get graded

This part came from the track itself. The Parallel track was built around their web research APIs, so ScenePilot looks up things like noise curfews and permit authorities for each location. That's where web facts start to matter. A curfew found on some random page shouldn't be able to reject a schedule on its own.

So every fact gets graded by how well it's backed:

<!-- adapted from services/agent/scenepilot/services/dossier.py -->
```python
def _binding(basis):
    """The confidence gate. No basis at all is treated as unverified, never as fact."""
    if basis is None:
        return FactBinding.ADVISORY, None
    confidence = (basis.confidence or "").lower()
    if confidence == "high":
        return (FactBinding.HARD if basis.citations else FactBinding.SOFT), confidence
    if confidence == "medium":
        return FactBinding.SOFT, confidence
    return FactBinding.ADVISORY, confidence or None
```

Only a high-confidence fact with a citation can be HARD. Everything below that is shown for someone to check, but it never reaches the scheduler.

There are two more gates after that. Only two shapes of fact can be checked mechanically: a ban on working at a location during a time window, like a noise curfew, and a ban on an activity there, like drones or pyrotechnics. A high-confidence fact in any other shape gets downgraded to SOFT. I didn't want to pretend to parse prose into rules. And even a HARD fact does nothing until the producer accepts it. The model and the web can suggest that a rule exists. A person decides that it applies.

## The model overwrote the record

An earlier bug showed why this split matters outside scheduling too. ScenePilot uses Gemini to break a scene down: duration, interior or exterior, time of day. For scenes already on the schedule, that breakdown was overwriting what the production had entered.

So a scene the production had planned at one length could quietly become another, just because the model estimated differently. The fix makes production data the source of truth for anything already scheduled. Gemini's estimate is still kept in its own field, and the UI shows it when the two disagree.

## Deterministic is not the same as correct

Then the checker itself turned out to have bugs. I'd put all this effort into keeping the model away from decisions, and the code making the decisions was wrong in places.

In the last week before the deadline, a pre-submission audit found the worst one. A curfew like 22:00 to 06:00 wraps past midnight. The checker split it into pieces, and the pieces left a gap. Shoot days are measured from their own midnight, so a night unit can legitimately run to 28:00, which means 4 am the next morning. Measured against the seed data with the curfew accepted:

- A 150-minute scene from 22:00 to 24:30 scored 120 minutes in breach. Correct.
- From 23:30 to 26:00 it scored 30. Also correct.
- From 24:00 to 26:30 it scored zero. That's 2:30 am, right inside the ban.

Moving the scene an hour later got it past the one rule the whole demo was built around. The fix tiles the window at plus and minus 24 hours, so each banned period is one continuous interval.

Same audit, different bug. Two tests checked that a 19:00 slot gives up part of golden hour. But dusk moves. It was 19:02 on 8 September and would be 19:00 by the 10th, so those tests would have started failing on 10 September. That was the day after the deadline, during judging, on a test suite the README told judges to run. Pinning the clock to different dates confirmed it.

And one more, which is less about rules and more about state. Two buttons, each correct on its own, could put the same scene on two shoot days if a producer pressed them in a natural order. Now both refuse, and the refusal names the day to undo first. I went with refusing over auto-fixing on purpose. Un-committing another day's schedule is a second decision, and it's the producer's to make, not the function's.

## Where the model actually helps

The model still does a lot of the work. It plans the research for a scene and grades the search results that come back. It can propose schedules the enumeration wouldn't produce, like deferring a scene the disruption didn't touch. And it writes explanations a producer can actually read. Those are the things LLMs are good at.

What I didn't want was the model's confidence standing in for a check. When it's wrong, it sounds just as sure as when it's right. A rule checker is boring, but when it rejects a plan it can tell you which rule and which source.

There's a practical side too. Model calls fail. A Gemini call that makes more than six tool calls gets cut off and retried without tools. A billing error from Gemini used to be retried with a sleep on every call. Now it opens a breaker, and calls fall back to recorded answers, labelled as replayed. And because the checker doesn't depend on the model, a rescue still comes back with checked options when Gemini is down. At worst it's missing Gemini's proposals and uses the fallback rationale.

## What I'd do differently

I'd write the time-window logic with tests across midnight and across dates from the very first day. The curfew gap and the golden-hour tests were both about time, and time is where I should have assumed I'd get it wrong.

I'd also make the "model proposes, code decides" boundary something the types enforce. Right now it holds because `build_option` is the only place an option gets made, and that's a convention I have to keep remembering.

The code is public at [github.com/jagritvats/scenepilot-public](https://github.com/jagritvats/scenepilot-public), with more than 600 tests.
