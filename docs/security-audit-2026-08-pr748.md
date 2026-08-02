# Security review — PR #748 (public profiles) + data-layer leak check

**Scope reviewed:** PR #748 `feat/public-profiles` (`/u/[username]` public pages, username claim,
OG unfurl images, `profiles.username` migration) and the surrounding identity / trophy data layer
that these public pages read through.
**Method:** read the code, then executed anon-vs-service-role probes against the **dev** Supabase
(PostgREST), with positive controls, per the audit's §5 verification rules.
**Not covered:** production dashboard settings (anon sign-in rate limit, enforced TLS, exposed
schemas, email-confirmation policy) — these live in the console, have no diff, and I have only dev
credentials. See *Could not verify*. Full `pg_catalog`/`pg_policies` enumeration was not possible
(no direct DB password); table protection was verified behaviourally instead.

---

## Executive summary

**No data leak was found.** Every sensitive table — profiles, player stats, earned trophies, the
trophy catalog, rarity, round facts, unlock/award ledgers — refuses an anonymous reader outright
(`permission denied`, not "empty"), and the gameplay secrets (`games.host_token`,
`players.resume_token`) are equally closed. The one thing anonymous users *can* read, the
`public_profiles` view, exposes exactly five safe columns (name, avatar, level, streak, id) and I
confirmed it does **not** carry username, email, or trophy points. The new public-profile pages
read everything through the service role and ship a narrow, explicit column set, so making a
profile public does not open the underlying tables. Username claiming is sound: it verifies the
caller's real login, only lets you claim for yourself, is one-time and permanent, and the database
unique index is the final arbiter. This is a careful, security-aware change.

**One low-severity hygiene gap is worth closing before the account-merge feature ships.** The
`profile_merges` audit table was created before the identity feature's lockdown migration and never
had its default grants revoked, unlike its six sibling tables. Today this is harmless — the table
is empty, row-level security blocks all reads and writes, and merges are still a no-op — but
`TRUNCATE` is *not* subject to row-level security, and the residual grant almost certainly still
carries it. The moment merges start being logged, an anonymous caller could wipe that audit trail.
It's a one-line migration to bring it in line with its siblings.

Nothing here blocks the launch of PR #748.

---

## What needs fixing before launch

| ID | Issue (plain English) | Priority | What it means |
|----|----|----|----|
| F1 | The "profile merges" audit table wasn't locked down the way its sibling tables were. | Low (latent Medium) | Right now nothing leaks — the table is empty and protected. But once merges are recorded there, an anonymous user could likely erase that log, because the delete-everything command isn't covered by the protection the other tables added for exactly this reason. Add one migration. |

There are no Critical or High findings.

---

## Inventory delta

I enumerated the running dev system's behaviour for every table this feature touches and compared
it to the committed migrations. **The set of objects matches the repo** — I found no table, view,
or column serving data that isn't defined in a migration. One *configuration* delta exists within a
committed object (F1: `profile_merges` grants differ from its siblings). Caveat: this was a
behavioural enumeration over PostgREST, not a full `pg_catalog` diff, which needs the DB password I
don't have.

---

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
| F1 | `profile_merges` retains the default anon/authenticated grants that its six sibling tables had explicitly revoked; `TRUNCATE` (not subject to RLS) is the exposed operation once the table is populated. | Low (latent Medium) | Live: anon `SELECT profile_merges` → `200 []` (grant present) vs siblings → `42501`. Repo: table created in `20260803000000_profiles_identity.sql:65` with RLS enabled + no policies + no revoke; the lockdown loop in `20260804000000_trophies_streaks.sql:127-145` lists only `trophies, trophy_rarity, player_stats, player_distinct, player_trophies, awarded_sessions`. | Data layer |
| F2 | Public unauthenticated routes (`/u/[username]`, OG images) each perform service-role DB reads; usernames are enumerable by design. | Info / longer-track | `src/app/u/[username]/page.tsx:11` (`revalidate = 300`), `opengraph-image.tsx` (no explicit revalidate; relies on platform image cache). | Observability |

---

## Remediation detail

**F1 — bring `profile_merges` in line with its siblings.**
The table is the audit log for Case-B account merges. It is protected by RLS (enabled, no
policies), so anonymous reads return zero rows and anonymous INSERT/UPDATE/DELETE are denied —
both today and after it is populated. The gap is `TRUNCATE`, which Postgres does **not** route
through RLS; the sibling lockdown revokes it precisely for this reason, and `profile_merges` was
omitted from that loop. Today the table is empty and Case-B merges are a no-op, so the blast radius
is nil — but when the trophies/account-merge batch starts writing merge history, an anonymous
caller holding the residual grant could truncate the audit trail (integrity loss, not disclosure).

Fix — new forward migration (do not edit the shipped one):

```sql
alter table public.profile_merges enable row level security; -- already on; harmless to assert
revoke all on public.profile_merges from anon, authenticated;
revoke all on public.profile_merges from public;
revoke truncate, trigger, references on public.profile_merges from anon, authenticated;
grant all on public.profile_merges to service_role;
```

Trade-off: none — nothing reads or writes this table except the service role.

*Verification note (rule 9):* the `TRUNCATE` grant is **inferred**, not executed. PostgREST has no
TRUNCATE verb, so I could not fire it. The inference rests on two facts I did verify: the table
predates the default-privileges lockdown, and anon still holds a `SELECT` grant on it (proven), so
its default `ALL` grant was never revoked. A `\dp profile_merges` in a psql session with the DB
password would confirm it directly.

**F2 — no action required to launch.** The page is already ISR-cached; usernames are intentionally
public. If abuse appears, add provider-side rate limiting and a short `revalidate`/cache header on
the OG image route. Flagged only so it is a deliberate choice.

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
- **F1's `TRUNCATE` grant** specifically (see note above).

---

*Verified against the dev Supabase on 2026-08-02. A pass is evidence about the code and config that
existed when it ran; re-run after any change.*
