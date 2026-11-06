---
title: Let the model suggest, let code decide
description: In ScenePilot, Gemini proposes new shoot schedules and plain Python checks whether they're allowed. The Python had its own bugs.
date: 2026-11-06
tags:
  - scenepilot
  - llm
  - agents
  - python
---

ScenePilot is an AI assistant director I built for Google Cloud's Agentic Cinema hackathon, in the Parallel partner track. When something goes wrong on a shoot day, say rain is forecast for the afternoon of day 4, it helps the producer work out a new schedule.

The easy way to build this is to give the model the schedule and the forecast and ask for a new plan. You'd get one, and it would probably look fine. But nothing in that setup checks whether the plan runs a rooftop scene past a noise curfew, or starts a daylight exterior after sunset. Those aren't small mistakes on a film set, since a permit window or a curfew is enforced by someone other than you.

So the whole project runs on one rule: the model can suggest whatever it wants, but it never decides whether a schedule is allowed.

## Who does what

When a disruption comes in, the rescue runs as a short sequence of steps:

1. Check the disruption against live web sources.
2. Work out which scenes it affects. If nothing is affected, stop there.
3. Generate candidate schedules in code, and check each one.
4. Let Gemini propose up to two more, checked the same way.
5. Rank them, and let Gemini explain the options.
6. Stop and wait for the producer.

The candidates in step 3 are plain enumeration: orderings of the day's scenes, with up to two affected scenes deferred and cover scenes pulled in. Any set bigger than six scenes is skipped, so a set has at most 720 orderings, which is cheap to brute-force. Every one goes through the checker: cast and location availability, the disruption window, usable daylight, golden hour, permit windows and curfews, meal breaks and turnaround before the next call. Each gets a score and a list of violations.

Gemini's proposals go through the exact same function.

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

A proposal that names a scene which doesn't exist gets dropped. And if Gemini comes up with an option that's already on the list, the existing one is marked as Gemini's too.

The screen shows at most three feasible and two rejected options, but Gemini's proposals are always shown, pass or fail. I wanted the producer to see when the model got overruled, which only works if its rejected options stay on screen.

The one place the model does get the last word is the explanation, where it writes up the trade-offs in plain English. If that call fails, a fallback rationale gets built from the checker's own scores, so the producer still sees a reason. After that the run ends at "awaiting approval", and the schedule stays as it was until a person says yes.

## Facts from the web get graded

This part came from the track. The Parallel track was built around their web research APIs, so ScenePilot looks up things like noise curfews and permit authorities for each location. The catch with web facts is that a curfew found on some random page shouldn't be able to reject a schedule by itself.

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

A fact can only be HARD if it's high confidence and has a citation. Anything below that is shown for someone to check, but it never reaches the scheduler.

Even a high-confidence fact has to be in a shape the checker can test, and there are only two: a ban on working at a location during a time window, like a noise curfew, or a ban on an activity there, like drones or pyrotechnics. Anything else gets downgraded to SOFT, since I didn't want to pretend I could parse prose into rules. And even a HARD fact does nothing until the producer accepts it.

## The model overwrote the record

An earlier bug had the same problem outside scheduling. ScenePilot uses Gemini to break a scene down into duration, interior or exterior, and time of day. For scenes already on the schedule, that breakdown was overwriting what the production had entered.

So a scene planned at one length could quietly become another, just because the model estimated differently. Now production data is the source of truth for anything already scheduled. Gemini's estimate is still kept in its own field, and the UI shows it when the two disagree.

## The checker had bugs too

None of this helps much if the checker is wrong, and in places it was. I'd spent all this effort keeping the model away from decisions, and the code making the decisions had bugs of its own.

The worst one came out of a pre-submission audit in the last week before the deadline. A curfew like 22:00 to 06:00 wraps past midnight, and the checker split it into pieces that left a gap between them. Shoot days are measured from their own midnight, so a night unit can legitimately run to 28:00, which is 4 am the next morning. Against the seed data with the curfew accepted:

- A 150-minute scene from 22:00 to 24:30 scored 120 minutes in breach, which is right.
- From 23:30 to 26:00 it scored 30, also right.
- From 24:00 to 26:30 it scored zero, even though that's 2:30 am and right inside the ban.

Moving the scene an hour later was enough to get it past the curfew, and the curfew was the rule the whole demo was built around. The fix tiles the window at plus and minus 24 hours, so each banned period is one continuous interval.

The audit caught a second one too. Two tests checked that a 19:00 slot loses part of golden hour, but dusk shifts through the year. It was 19:02 on 8 September and would be 19:00 by the 10th, so those tests would have started failing on 10 September, the day after the deadline. That's during judging, on a test suite the README told judges to run. I confirmed it by pinning the clock to different dates.

The last one was a state bug. Two buttons, each fine on its own, could put the same scene on two shoot days if a producer pressed them in a pretty natural order. Now both refuse, and the refusal says which day to undo first. I chose refusing over auto-fixing on purpose, because un-committing another day's schedule is a second decision and the producer should be the one making it.

## Where the model actually helps

The model still does a lot of the work. It plans the research for a scene and grades the search results that come back. It can propose schedules the enumeration wouldn't produce, like deferring a scene the disruption didn't touch. It also writes the explanations, which a producer can actually read.

What I didn't want was the model's confidence standing in for a check, since it sounds just as sure when it's wrong. The rule checker is boring, but when it rejects a plan you can see which rule and which source.

It also helps when model calls fail, which they do. A Gemini call that makes more than six tool calls gets cut off and retried without tools. A billing error from Gemini used to be retried with a sleep on every call; now it opens a breaker, and calls fall back to recorded answers labelled as replayed. Since the checker doesn't depend on the model, a rescue still comes back with checked options when Gemini is down. It won't have Gemini's proposals, and it uses the fallback rationale.

## If I did it again

The curfew gap and the golden-hour tests were both time bugs, one across midnight and one across dates. Next time I'd test both of those from the first day I write any time-window logic.

The boundary between the model and the checker is also weaker than it looks. Right now it holds only because `build_option` is the only place an option gets made. Nothing in the types stops someone adding a second path, so it's a convention I have to keep in mind. I'd rather the types enforced it.

The code is public at [github.com/jagritvats/scenepilot-public](https://github.com/jagritvats/scenepilot-public), with more than 600 tests.
