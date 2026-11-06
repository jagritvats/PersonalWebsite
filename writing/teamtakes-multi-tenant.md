---
title: Making TeamTakes multi-tenant while people were using it
description: How I moved TeamTakes from one team to many on a single Postgres database with row-level security. I wrote the leak test first and rehearsed on a copy of production, and it still broke once someone was in a second team.
date: 2026-11-06T18:00:00+05:30
tags:
  - teamtakes
  - postgres
  - supabase
  - multi-tenancy
---

TeamTakes is opinionated polls and play-money prediction games for engineering teams. It started out as an app for one team. There was no `team_id` column anywhere, and every approved user could see everything.

To make it multi-tenant I went with one Postgres database, a `team_id` on every row, and row-level security (RLS) deciding who sees what. Each team also gets its own subdomain.

The tricky part was that people were already using it. The production dump I rehearsed on had 16 profiles and 63 votes (a vote is what the app calls a poll). That's small, but it's real people's data, and I really didn't want any of it showing up on another team's screen.

## The leak test came first

I wrote the leak test before I touched any policy. It seeds two teams, A and B, each with an owner and a member, and one row of each kind of team data: a vote, a comment, a notification, a DM thread. Then it signs in as team A's owner through the normal RLS-constrained client and tries to get at team B's data.

The commit that added it says "Expected RED until Phase 2". At that point any approved user could read everything, so each failing probe was an item on the to-do list.

Each surface it probes also has a positive control. Team A not seeing team B's votes only means something if team A can still see its own.

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

Otherwise a broken query that returns nothing would look the same as perfect isolation. The suite has about sixty checks now, and some of them are RPCs that have to refuse to work across teams, like starting a DM with someone who isn't in your team.

## Isolation as restrictive policies

The app already had around 150 permissive RLS policies for the in-team rules: who can vote, who can comment, admin stuff. Rewriting all of them would have been an easy way to break something without noticing.

So I put isolation in as a separate layer. Postgres has `AS RESTRICTIVE` policies, which get ANDed with the permissive ones, so a row has to pass the existing rules *and* the team check. There's one restrictive policy each for select, update and delete on 42 tables, and I left the existing logic alone. Inserts are handled by a trigger that stamps the right team on new rows.

A row with no `team_id` is invisible. `is_team_member(NULL)` is false, so if a row never got stamped, nobody sees it. I wanted it to fail closed like that.

The migration also checks its own work. If any table that should have the restrictive policy doesn't have it, the migration raises an error instead of finishing. The catch is that this only proves anything on the day the migration runs, which bit me later.

Along the way I hit a latent "infinite recursion detected in policy" bug. The policy on `team_members` read from `team_members`, which triggered the same policy again. I fixed it by routing every membership check through a `SECURITY DEFINER` function, and that function is now the one predicate everything else uses.

## Rehearsing on a copy of production

I didn't want the first run of 18 migrations against real data to be the production run. So I wrote scripts to back up production, restore the dump into a scratch database, apply every migration in order and compare row counts. The rehearsal ran on a local Postgres 17 container.

It found three bugs, none of which would have shown up on an empty database:

- One of my migrations had the same version number as a migration already applied on production. The runner would have skipped mine without any error.
- Backfilling `team_id` on vote responses tripped an existing trigger that refuses changes once a poll is closed or about to close. There are no closed polls in an empty database, but production has them.
- I used `max(team_id)` on a uuid column, and Postgres doesn't have `max(uuid)`.

A second rehearsal on a fresh dump went through clean. After that I checked the actual isolation: I created a team B with one vote and queried as a user who was only in team A, through the `authenticated` role and not as the superuser, which skips RLS. That user saw 0 team-B votes and 63 from their own team.

## What broke after the cutover

Then the migrations went to production, and things broke as soon as a second team was created.

Creating a team makes its creator an active owner straight away, so the creator was now in two teams. On the original team, their daily bits claims started returning 400. Reactions, comments and votes broke too. The fix commit says: "The single-team dry run never hit it."

When a row is inserted without a team, a trigger works out which team it belongs to. With one membership that's easy. With two, the trigger couldn't tell which team was meant, so it failed closed, which is what I'd designed it to do. The economy functions had the same rule and failed the same way.

So the active team had to come along with the request. The frontend works out the team from the subdomain and sends it as an `x-team-id` header. The database reads it, but only trusts it if you're an active member of that team, so a forged header just gets ignored.

The leak test and the rehearsal both only used people who were in exactly one team. In a multi-tenant app someone in two teams is normal, and I hadn't tested with one even once.

## Two leaks from the active-team header

For a user in several teams, the header also narrows reads to the active team, through one more restrictive policy. If there's no header, that policy does nothing, so single-team users and server-side code keep working.

I added the policy with a one-time sweep that finds every table with the isolation policy and gives it the active-team one too.

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

The problem is it only ran once. Tables created after it, like the ones behind Daily Docket, got the isolation policy but not the active-team one. So a person in two teams could see the other team's dockets in this team's feed, and the same thing happened on every tenant table added after the sweep.

This never showed data to someone outside the team. Membership isolation still held, so what leaked was always the union of that person's own teams. It was still wrong though, and the same drift on a different policy could have been a real leak. The fix re-ran the sweep. I also added a check to the tenancy verifier, a script that reads the migration files without needing a database. It fails if any migration that creates an isolation policy runs after the last sweep. Nothing in the deploy pipeline runs that script yet, so it only runs when I run it or as part of the rehearsal.

The second leak was harder to spot. On someone's first visit to a newly joined team's subdomain, a cached profile let the app render before the active team was known. The first queries went out with no header, the narrowing policy did nothing, and the union of all their teams got cached under this team's keys. After a refresh everything looked right, so it was easy to miss. The fix makes the app wait for the team on a subdomain, skips prefetching until the team is known, and drops the cache if the team changes under it.

Both of these trace back to treating a missing header as a no-op. I did that so everything else kept working during the migration, but it means that's the one place in the design that doesn't fail closed.

## The app_settings rename

Later I split the single-row `app_settings` table into one row per team. I renamed the old table and put a view in its place under the old name. Chat and DM sends then started failing for multi-team users with "more than one row returned by a subquery used as an expression".

RLS policies reference tables by OID, so when I renamed the table, three policies followed it, and that table now had a row per team. Function bodies are stored as text, so they kept pointing at the name, and the name was now the view. The fix scoped each lookup to the row's own team, and a smoke test checks that no policy still uses the old pattern.

## Looking back

I'd have put a user who's in two teams into the leak suite right at the start. Every bug after the cutover in this post needed one. I still haven't done it, actually. The leak suite only seeds single-team users, and the multi-team cases are separate SQL smoke tests that came in with the fixes.

The sweep check has the same problem. It exists, but nothing in the deploy pipeline runs it, so it only catches drift when I run it by hand. That should run on every change.

The missing header is the other one. I made unstamped rows fail closed on purpose, but let a missing header do nothing because it was convenient, and both leaks came out of that.

Most of the code in this post was written with Claude Code.
