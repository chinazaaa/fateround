# Security review — the trophy system (PRs #745, #747, #748) + data-layer leak check

**Scope reviewed:** the whole trophy/progression feature built across the recent PRs, not just one:
the trophy engine (`award.ts`, `criteria.ts`, `counters.ts`, `system-catalog.ts`, the per-game
facts builders), its tables and `SECURITY DEFINER` RPCs, the per-game in-play accumulators added to
session tables (Ayo `a_stats`/`b_stats`, checkers `red_stats`/`black_stats`, mahjong, scrabble), the
attribution/claim endpoint, the admin trophy API, and PR #748's public profiles (`/u/[username]`,
username claim, OG images).
**Method:** read the code, then executed anon-vs-service-role probes (reads, writes, and RPC calls)
against the **dev** Supabase (PostgREST), with positive controls, per the audit's §5 rules. Write
probes used non-matching filters or same-value writes so nothing mutated.
**Not covered:** production dashboard settings (anon sign-in rate limit, enforced TLS, exposed
schemas, email-confirmation policy) — these live in the console, have no diff, and I have only dev
credentials. See *Could not verify*. Full `pg_catalog`/`pg_policies` enumeration was not possible
(no direct DB password); protection was verified behaviourally instead.

---

## Executive summary

**No data leak, and no way for a player to forge trophies or points, was found.** Every sensitive
table — profiles, player stats, earned trophies, the trophy catalog, rarity, round facts, and the
unlock/award ledgers — refuses an anonymous reader outright (`permission denied`, not a misleading
"empty"), and the gameplay secrets (`games.host_token`, `players.resume_token`) are equally closed.
The one thing anonymous users can read, the `public_profiles` view, exposes exactly five safe
columns and I confirmed it carries no username, email, or points.

**The trophy award path holds under direct attack.** The two functions that write points and
counters (`bump_player_stats`, `recompute_profile_points`) are `SECURITY DEFINER` with a pinned
`search_path` and are revoked from the public roles — I confirmed live that an anonymous caller
gets `permission denied` invoking either. A player also cannot write the trophy tables directly
(insert an earned trophy, bump a stat, forge an instant unlock) or forge the in-play accumulators
that feed the per-game trophies: those writes are blocked, the accumulator writes by row-level
security (proven against a real Ayo game row). Claiming a finished game's trophies requires *both*
the caller's verified login and the game's secret resume token, so you can only ever attribute a
game you actually played, to your own profile, and the award amount is always derived server-side —
never taken from the request.

**One low-severity hygiene gap remains, and I am correcting my own earlier overstatement of it.**
The `profile_merges` audit table kept the default anon/authenticated grants its six sibling tables
had revoked (a real inconsistency — fix it). But there is **no reachable exploit today**: the only
privilege the residual grant adds beyond what RLS already blocks is `TRUNCATE`, and PostgREST
exposes no way for an anonymous client to issue it. My first pass called this "an anonymous caller
could wipe the audit trail" — that overstates it. It is defense-in-depth grant hygiene, not an open
hole. The same "anon holds a write grant that RLS neutralises" shape exists platform-wide on the
gameplay session tables (see F2); it is the house convention, not a trophy-specific regression.

Nothing here blocks the launch of the trophy work or PR #748.

---

## What needs fixing before launch

| ID | Issue (plain English) | Priority | What it means |
|----|----|----|----|
| F1 | The "profile merges" audit table wasn't locked down the way its sibling tables were. | Low (defense-in-depth) | The table has a leftover permission the other tables removed. Nothing can exploit it today — the protection that actually matters (row security) is in place, and there's no way for a visitor to use the leftover permission through the public API. It's tidy-up: bring one table in line with the six next to it. One migration. |

There are no Critical or High findings.

---

## Inventory delta

I enumerated the running dev system's behaviour for every table, view, and RPC this feature touches
and compared it to the committed migrations. **The set of objects matches the repo** — I found no
table, view, column, or function serving data that isn't defined in a migration. Two *configuration*
deltas exist within committed objects — the grant inconsistencies in F1 (`profile_merges`) and F2
(session tables). Caveat: this was a behavioural enumeration over PostgREST, not a full `pg_catalog`
diff, which needs the DB password I don't have.

---

## Trophy award integrity (the core of this feature — executed)

The whole posture is "the server writes progression; a client can never say how much it earned."
I attacked that directly and it held:

- **The points/counter RPCs are unreachable by clients.** `bump_player_stats` and
  `recompute_profile_points` are `SECURITY DEFINER` with `set search_path = public` (pinned) and
  `revoke all ... from public, anon, authenticated` in the same migration
  (`20260805000000_trophy_counters_atomic.sql:56,104`). Live: anon `POST /rpc/bump_player_stats`
  and `/rpc/recompute_profile_points` both returned `42501 permission denied`; service role ran
  `recompute_profile_points` fine (positive control). So a player cannot inflate their own counters
  or points by calling the DB directly.
- **No direct trophy/point/counter forgery.** Live anon `INSERT` into `player_trophies`,
  `player_stats`, and `round_unlocks`, and anon `PATCH` of `profiles.trophy_points`, each returned
  `42501` (no grant). A client can neither grant itself a trophy nor forge an instant unlock.
- **The in-play accumulators can't be forged.** The per-game trophy counters live on session rows
  (`ayo_sessions.a_stats`/`b_stats`, `checkers_sessions.red_stats`/`black_stats`, etc.), which are
  anon-*readable* by the gameplay convention. But writes are blocked by RLS: against a **real**
  `ayo_sessions` row (service role confirmed one row matched), an anon same-value `PATCH` returned
  **0 rows changed** — RLS with no write policy neutralised it. So the accumulators the per-game
  trophies read cannot be tampered with from a browser. (checkers_sessions is empty on dev, so the
  same-shape table could not be independently row-tested — inferred from identical convention.)
- **Claiming a game's trophies is doubly bound.** `/api/profile/attribute` requires the caller's
  verified JWT *and* the game's secret `resume_token`: the token proves which `players` row is
  yours, the JWT proves which profile is yours (`attribute/route.ts:59-99`). You can only attribute
  a game you actually played, to your own profile; an already-claimed seat is left with its owner
  (no stealing); the write re-checks `profile_id IS NULL` under a CAS; and it's rate-limited
  (`RATE_LIMITS.profileAttribute`). The award amount is derived entirely server-side by
  `awardForFinishedGame` — the request body carries only `gameCode` + `resumeToken`.
- **Solo play can't farm wins.** The award pass requires `MIN_PLAYERS_FOR_A_WIN` seated before
  `games_won` moves, so playing alone earns `games_played` but never a win (`award.ts`). (Read.)

## What's already working well (executed, not just read)

- **Sensitive tables are closed to anon — proven, not inferred.** `profiles`, `player_stats`,
  `player_trophies`, `player_distinct`, `round_facts`, `trophy_rarity`, `round_unlocks`,
  `awarded_sessions`, and the `trophies` catalog each returned `42501 permission denied` to the
  anon key, while the service role read them non-empty (positive control). "Denied" and "empty"
  were distinguished.
- **The `public_profiles` view leaks nothing new.** Anon read returns only
  `id, handle, avatar_url, trophy_level, current_streak`. Selecting `username`, `trophy_points`,
  `email`, or `longest_streak` each returned `42703 column does not exist` — they are genuinely not
  in the view, so the new username column did not widen it.
- **C2 (the old writable-view finding) has not regressed.** Anon `PATCH` to `public_profiles`,
  `profiles`, and `player_stats` all returned `42501` (tested with a non-matching id filter, so no
  data was touched).
- **Gameplay secrets stay secret.** Anon selects of `games.host_token` and `players.resume_token`
  returned `42501`.
- **`auth.users` is not reachable** through the data API (schema not exposed).
- **JWT auth is real, not structural.** `getIdentityFromRequest` verifies via
  `supabase.auth.getUser(token)` and derives the profile id from the verified user, never from the
  request body — so username claim / handle edit cannot act on another account. (Read.)
- **Username claim is hardened.** Auth-gated on both verbs (no open enumeration oracle), reserved
  words rejected, format-checked (`^[a-z0-9_]{3,20}$`), claim-once/immutable, and the DB unique
  index is the real arbiter with `23505 → taken`. (Read.)
- **No unbounded writes on the profile.** `handle` is capped at 50 chars and updated as a single
  field on the caller's own row; `username` is 3–20 and CHECK-constrained in the DB. (Read.)
- **Public pages are cached.** `/u/[username]` sets `revalidate = 300`, so the four service-role
  reads per render are amortised behind ISR rather than hit on every request. (Read.)
- **Admin trophy API is gated** — every verb calls `assertAdminRequest` and 401s without a session.
  (Read.)

---

## Consolidated findings

| ID | Finding | Severity | Evidence | Track |
|----|----|----|----|----|
| F1 | `profile_merges` retains the default anon/authenticated grants its six sibling tables revoked. RLS blocks all reads/DML; the only extra the grant confers is `TRUNCATE` (not RLS-governed), and no anon vector to issue it exists via PostgREST. Defense-in-depth cleanup. | Low | Live: anon `SELECT profile_merges` → `200 []` (grant present) vs siblings → `42501`. Repo: `20260803000000_profiles_identity.sql:65` (RLS on, no policies, no revoke); lockdown loop `20260804000000_trophies_streaks.sql:127-145` omits it. | Data layer |
| F2 | Gameplay session tables (e.g. `ayo_sessions`, `checkers_sessions`) grant anon a table-level write privilege that RLS-with-no-write-policy neutralises. Same shape as F1, platform-wide and by convention — writes are blocked (proven on a real row), but the residual grant is a second-control gap. | Low / longer-track | Live: anon same-value `PATCH ayo_sessions` on a real row → `200`, `0 rows` (RLS blocked). Not trophy-specific; the accumulator columns merely inherit it. | Data layer |
| F3 | Admin surface authenticates with a single shared secret (`ADMIN_SESSION_SECRET` / `ADMIN_PASSWORD`), so admin actions (creating/retiring trophies, seeding) carry no per-operator identity or revocation. | Low / longer-track | `assertAdminRequest`; `.env.local` `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`. | Auth model |
| F4 | Public unauthenticated routes (`/u/[username]`, OG images) each perform service-role DB reads; usernames are enumerable by design. | Info | `src/app/u/[username]/page.tsx:11` (`revalidate = 300`); `opengraph-image.tsx` relies on platform image cache. | Observability |

---

## Remediation detail

**F1 — bring `profile_merges` in line with its siblings.** *(fixed in the accompanying migration
`20260814000000_profile_merges_lockdown.sql`.)*
The table is the audit log for Case-B account merges, protected by RLS (enabled, no policies), so
anonymous reads return zero rows and INSERT/UPDATE/DELETE are denied — today and once populated. The
only thing the residual grant adds on top of RLS is `TRUNCATE`, which Postgres does not route
through RLS. **Corrected from my first pass (rule 10):** I initially wrote that an anonymous caller
"could wipe the audit trail". That overstates it — PostgREST exposes no TRUNCATE verb and there is
no other anon SQL path, so the grant is currently *unreachable*, not exploitable. It should still be
removed as defense-in-depth so the table matches its siblings and can't be undermined by a future
change that adds an execution path.

Fix:

```sql
revoke all on public.profile_merges from anon, authenticated;
revoke all on public.profile_merges from public;
revoke truncate, trigger, references on public.profile_merges from anon, authenticated;
grant all on public.profile_merges to service_role;
```

Trade-off: none — nothing reads or writes this table except the service role. The `TRUNCATE` grant
itself is **inferred** (table predates the lockdown; anon `SELECT` grant proven present), not fired;
`\dp profile_merges` with the DB password confirms directly.

**F2 — session-table write grants.** Not launch-blocking, and not introduced by the trophy work —
the gameplay session tables have granted anon table-level writes since long before, and RLS (no
write policy) is what actually stops the write (proven). The trophy accumulator columns simply live
on these tables and inherit the posture. Worth a sweep, in the same spirit as F1, to revoke the
unused write/`TRUNCATE` grants from anon across the session tables so RLS isn't the only thing
standing between an anonymous client and every live game row — but it is a platform-wide hardening
task, tracked separately from this feature.

**F3 — admin auth is a shared secret.** `assertAdminRequest` validates a single password/secret, so
every admin action is attributable only to "someone who had the password", not to a person, and the
credential can't be revoked for one operator. Fine for a solo build; before more than one person has
admin, move to per-user accounts (or at least rotate + log). A malicious/compromised admin can
already author a trophy worth arbitrary points — that is inherent to admin trust, but a shared
secret removes the audit trail that would let you notice.

**F4 — no action required to launch.** The page is ISR-cached; usernames are intentionally public.
If abuse appears, add provider-side rate limiting and a cache header on the OG image route.

---

## Could not verify (production console — no diff to read, dev creds only)

- **Anonymous sign-in rate limit.** `20260803000000_profiles_identity.sql:17` flags raising it from
  the 30/hour default as REQUIRED for NAT'd rooms; I cannot confirm it was set in prod. Relevant to
  security too: anon sign-in is the entry point to every auth-gated route here.
- **Enforced TLS on DB connections, exposed API schemas, email-confirmation / OTP policy** — all
  dashboard settings.
- **Whether these migrations are actually applied in production.** I verified against the dev
  project only. Per rule 8, that is evidence about dev, not prod — re-run the anon probes against
  the production PostgREST URL before relying on this.
- **F1's `TRUNCATE` grant** specifically, and the F2 session-table grants (same reason — no anon
  vector to fire TRUNCATE via PostgREST; would need `\dp` with the DB password).
- **`checkers_sessions` write-block against a real row.** The dev table is empty, so I proved the
  accumulator write-block on `ayo_sessions` (a real row existed) and inferred the identical result
  for `checkers_sessions`/mahjong/scrabble from the shared convention — not independently fired.
- **The RPC revoke for the `authenticated` role.** I fired the anon negative test (denied) and read
  the revoke, which names `anon, authenticated, public` in one statement; I did not mint an
  authenticated JWT to fire it separately.

---

*Verified against the dev Supabase on 2026-08-02. A pass is evidence about the code and config that
existed when it ran; re-run after any change.*
