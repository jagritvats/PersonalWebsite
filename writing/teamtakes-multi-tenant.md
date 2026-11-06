---
title: Making TeamTakes multi-tenant while people were using it
description: How I moved TeamTakes from one team to many on a single Postgres database with row-level security. I wrote the leak test first and rehearsed on a copy of production, and it still broke once a second team existed.
date: 2026-11-06T18:00:00+05:30
tags:
  - teamtakes
  - postgres
  - supabase
  - multi-tenancy
---

TeamTakes is opinionated polls and play-money prediction games for engineering teams. It started out as an app for one team. There was no `team_id` column anywhere, and every approved user could see everything.

Making it multi-tenant meant one Postgres database, a `team_id` on every row, and row-level security (RLS) deciding who sees what. Each team gets its own subdomain on top of that.

What made it interesting was that people were already using it. The production dump I rehearsed on had 16 profiles and 63 votes (a vote is what the app calls a poll). Small, but it's real people's data, and you really don't want it showing up on another team's screen.

## Write the test first, and let it be red

Before touching a single policy, I had the leak test written. It seeds two teams, A and B, each with an owner and a member, and one row of each kind of team data: a vote, a comment, a notification, a DM thread. Then it signs in as team A's owner through the normal, RLS-constrained client and tries to reach team B's data.

The commit that added it says "Expected RED until Phase 2". At that point any approved user could read everything, so the list of failing probes was the to-do list.

Each surface it probes also gets a positive control. If team A can't see team B's votes, that's only good news if team A can still see its own.

<!-- adapted from tests/leak/harness.ts in team-takes -->
```ts
expectVisible(name: string, count: number) {
  if (count > 0) {
    this.results.push({ name, status: "pass" });
  } else {
    this.results.push({
      name,
      status: "error",
      detail:
        "control failed: user could not see their OWN team's row (query/seed bug, not isolation)",
    });
  }
}
```

Without that, a broken query that returns nothing looks exactly like perfect isolation. The suite has about sixty checks now. Some of them are RPCs that must refuse to work across teams, like starting a DM with someone outside yours.

## Restrictive policies on top, not a rewrite

The app already had around 150 permissive RLS policies for the in-team rules: who can vote, who can comment, admin stuff. Rewriting all of them would have been an easy way to break something quietly.

So isolation went in as a separate layer. Postgres has `AS RESTRICTIVE` policies, which are ANDed with the permissive ones, so a row has to pass the existing rules *and* the team check. There's one restrictive policy each for select, update and delete on 42 tables, and the existing logic stayed untouched. Inserts were left to a trigger that stamps the right team on new rows.

Two details are worth calling out.

First, a missing `team_id` means invisible. `is_team_member(NULL)` is false, so a row that never got stamped can't show up for anyone. Failing closed is the right default here.

Second, the migration checks itself. If any table that should have the restrictive policy doesn't, the migration raises an error instead of finishing. A check like that only proves things on the day it runs, and that comes back later.

On the way I also found a latent "infinite recursion detected in policy" bug. The policy on `team_members` read from `team_members`, which triggered the same policy again. The fix was to route every membership check through a `SECURITY DEFINER` function, which became the one predicate everything else uses.

## Rehearse on a real copy

I didn't want the first run of 18 migrations against real data to be the production run. So there are scripts to back up production, restore the dump into a scratch database, apply every migration in order and compare row counts. The rehearsal ran on a local Postgres 17 container.

It found three bugs, and none of them would have shown up on an empty database:

- One of my migrations shared a version number with a migration already applied on production. The runner would have skipped mine. Silently.
- Backfilling `team_id` on vote responses tripped an existing trigger that refuses changes once a poll is closed or about to close. An empty database has no closed polls. Production does.
- I used `max(team_id)` on a uuid column. Postgres doesn't have `max(uuid)`.

A second rehearsal, on a fresh dump, went clean. Then came the check that mattered: a team B with one vote, queried as a team-A-only user through the `authenticated` role, not the superuser that skips RLS. Visible team-B votes: 0. Own votes: 63.

## What the dry run never hit

Then the migrations went to production, and the break came when a second team was created.

Creating a team makes its creator an active owner straight away, so the creator was now in two teams. On the original team, their daily bits claims started returning 400. Reactions, comments and votes broke too. The fix commit says it plainly: "The single-team dry run never hit it."

The cause: when a row is inserted without a team, a trigger works out which team it belongs to. With one membership that's easy. With two, the trigger couldn't tell which team was meant, so it failed closed, exactly as designed. The economy functions had the same rule and failed the same way.

So the active team had to travel with the request. The frontend works out the team from the subdomain and sends it as an `x-team-id` header. The database reads it, but only trusts it if you're an active member of that team. A forged header just gets ignored.

The leak test and the rehearsal both used people who belonged to exactly one team. In a multi-tenant app, someone in two teams is normal, and I hadn't tested with one even once.

## Two leaks after that, same root

For a user in several teams, the header also narrows reads to the active team, through one more restrictive policy. If there's no header, that policy does nothing, so single-team users and server-side code keep working.

I added the policy with a one-time sweep: find every table that has the isolation policy and give it the active-team one too.

<!-- adapted from supabase/migrations/20260628140000000_active_team_request_context.sql -->
```sql
FOR r IN
  SELECT DISTINCT tablename
    FROM pg_policies
   WHERE schemaname = 'public' AND policyname = 'tenant_isolation_select'
LOOP
  EXECUTE format(
    'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT '
    'USING (public._req_team_id() IS NULL OR team_id = public._req_team_id())',
    'tenant_active_team_select', r.tablename
  );
END LOOP;
```

But it ran once. Tables created later, like the ones behind Daily Docket, got the isolation policy and not the active-team one. So a person in two teams could see the other team's dockets in this team's feed. The same drift hit every tenant table added after the sweep.

This never showed data to someone outside the team. Membership isolation still held, so what leaked was always the union of that person's own teams. It was still wrong, though, and the same drift on a different policy could have been a real leak. The fix re-ran the sweep. I also added a check to the tenancy verifier, a script that reads the migration files without needing a database. It fails if any migration that creates an isolation policy runs after the last sweep. Honestly, nothing in the deploy pipeline runs that script yet. It runs when I run it, and inside the rehearsal script.

The second leak was sneakier. On someone's first visit to a newly joined team's subdomain, a cached profile let the app render before the active team was known. So the first queries went out with no header, the narrowing policy did nothing, and the union of all their teams got cached under this team's keys. It looked fine after a refresh, which is the worst kind of bug. The fix makes the app wait for the team on a subdomain, skips prefetching until the team is known, and drops the cache if the team changes under it.

Both leaks come from the same choice: no header means no-op. That kept everything else working during the migration. In hindsight, it's also the one place in the design that doesn't fail closed.

## A rename that policies followed and functions didn't

Later I split the single-row `app_settings` table into one row per team. The old table was renamed, and a view took its name. Chat and DM sends started failing for multi-team users with "more than one row returned by a subquery used as an expression".

Turns out RLS policies point at tables by OID, not by name. When the table was renamed, three policies followed it, so they were now reading a table with a row per team. Function bodies are stored as text, so they kept pointing at the name, which was now the view. Same rename, two different behaviours. The fix scoped each lookup to the row's own team, and a smoke test checks that no policy still uses the old pattern.

## What I'd do differently

I'd have a multi-team user in the leak suite from day one. Every post-cutover bug in this post needed one. Even now the leak suite only seeds single-team users. The multi-team cases live in separate SQL smoke tests that came in with the fixes.

I'd treat any "apply this to every table" migration as a rule that has to keep holding, and check it on every change, in the pipeline that deploys. A sweep that runs once is only true on the day it runs, and a check that nothing runs automatically isn't much better.

And I'd think harder about the "missing context" case. Failing closed on unstamped rows was right. Doing nothing when the header was missing was convenient, and that's where both later leaks came from.

Claude Code wrote most of the commits behind this post, and the history says so.
