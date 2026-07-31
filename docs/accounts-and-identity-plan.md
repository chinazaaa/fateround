# Accounts & the Anonymous Bridge — Implementation Plan

**Status:** written 2026-07-31. **All four slices are written.** Slice 1 is built *and verified*;
Slices 2–4 are code-complete but **not deployed** — the migration is unapplied and the Supabase
dashboard config is outstanding (checklist in Slice 2), so nothing below Slice 1 has yet run
against a real Supabase.
**Blocks:** everything in [`pricing-implementation-plan.md`](./pricing-implementation-plan.md), Batch 1 of [`platform-features-master-plan.md`](./platform-features-master-plan.md), all of [`trophies-and-streaks.md`](./trophies-and-streaks.md), [`high-scores-leaderboards-plan.md`](./high-scores-leaderboards-plan.md), [`clubs-spec.md`](./clubs-spec.md).

This doc is the **build plan** for the identity foundation. The *design* was already settled
across seven docs (see §1); this one says what to actually write, in what order, against the
code that exists today.

---

## 0. The governing principle

> **This is a party-game app, not a bank. Almost nobody wants an account.**
> The people who do are the ones who care about streaks/trophies, and schools/companies —
> a minority, and a *self-selecting, motivated* minority. So identity must cost the
> majority nothing and must never stand between a person and a game.

That leads to **three layers, each of which must earn its own cost.** Only layer 3 is an
"account" in the normal sense.

| Layer | Who gets it | Created when | Costs | Buys you |
|---|---|---|---|---|
| **1. Local profile** | Everyone, silently | First time you type your name | Nothing (localStorage / SecureStore) | **The app stops asking your name every single game.** Sound/theme prefs persist. |
| **2. Anonymous server identity** | Anyone who finishes a game | First **game finish** | 1 `auth.users` row | Streaks, trophies, personal bests — on this device |
| **3. Email account** | Opt-in only | User taps "save my trophies" | An email on file | The same identity survives a new phone; unlocks clubs, Pro, orgs |

**Layer 1 is the one that matters most for adoption and nobody has planned it yet.** Today a
player retypes their name in *every single game they ever join*
([`useJoinFlow.ts:73`](../src/hooks/useJoinFlow.ts#L73), [`JoinScreen.tsx:54-63`](../apps/mobile/components/JoinScreen.tsx#L54-L63)) — the
only per-game state is `kmk_player_<CODE>` ([`utils.ts:341-357`](../src/lib/utils.ts#L341-L357)), keyed
by game code, so nothing carries over. Fixing that is a few hours of work, ships with zero
backend, and is the single most-felt quality-of-life win in this whole plan. It also makes
the profile chip feel earned before we ever ask for an email.

---

## 1. What is already decided (do not re-litigate)

Canonical source: [`trophies-and-streaks.md`](./trophies-and-streaks.md) §2 and §5. Reaffirmed in the master plan,
high-scores plan, clubs spec, account tiers, revenue model. Settled:

1. **Anonymous-first Supabase Auth** (`signInAnonymously()`), *not* a client-generated device
   UUID — so the later account upgrade is native and RLS can key on `auth.uid()`.
2. **`profiles.id == auth.users.id`**, with `is_anonymous`, `handle` (non-unique display name),
   `avatar_url`. Every downstream table FKs `profile_id → profiles(id)`.
3. **Email + 6-digit OTP, one door.** "Login == signup" — the user never picks. Magic links
   explicitly rejected as the primary path (they open a different browser/webview and log you
   in *there*, not in the tab you're playing in).
4. **Never gate play behind login.** Two prompt surfaces only: the passive profile chip, and
   the post-win / post-Daily "save this" prompt. Never at lobby join.
5. **Case A** (guest → brand-new account) = upgrade in place, same `auth.uid()`, no merge code.
   **Case B** (guest device → existing account) = `mergeProfiles`, merge-never-overwrite, audited
   in `profile_merges`.
6. **RLS:** owner-read on own rows via `auth.uid()`; public boards read a **narrow view** (handle +
   level + streak, never email); **all writes server-side** via `getSupabaseAdmin()`.
7. **90-day anonymous retention / guest-history claim window.**

---

## 2. What this plan changes or resolves

### 2.1 Email OTP only for v1 — drop the OAuth line ✅ DONE

[`pricing-implementation-plan.md`](./pricing-implementation-plan.md) used to say "email + OAuth: Google/Apple at minimum for
mobile" — the only place in the docs asking for OAuth. Every other doc says email-OTP-only.
**Resolved in favour of OTP-only and that line is now patched** (2026-07-31). Reasons specific
to us:

- Email OTP needs **zero native configuration** and behaves identically on web and in Expo. Google/Apple
  OAuth needs redirect schemes, native SDK config, and a rebuilt dev client on mobile.
- **App Store rule 4.8**: offering Google sign-in *obliges* us to also offer Sign in with Apple.
  Offering neither obliges us to nothing. First-party email is the cheapest compliant door.
- We are not a productivity tool people log into daily; the sign-in rate will be low by design.
  Optimising the door before we know the conversion rate is premature.

Revisit only if measured signup conversion is bad.

### 2.2 Create the server identity at **first game finish**, not first page load ✅ recommendation

The docs say "on first play," which is ambiguous. Read literally as *page load* or *join*, a
20-person party creates 20 `auth.users` rows for one session, most of whom never return.

**Checked against real Supabase pricing and limits (2026-07-31) — and the billing worry was
overstated. The rate limit is the actual problem.**

**Billing: a non-issue.** Anonymous users *do* count toward MAU, but each unique user counts
**once per billing cycle**, and the allowances are large:

| Plan | Base | Included MAU | Overage |
|---|---|---|---|
| Free | $0 | 50,000 | — (no overage; hard cap) |
| Pro | $25/mo | 100,000 | $0.00325 / MAU |
| Team | $599/mo | 100,000 | $0.00325 / MAU |

For us MAU ≈ *unique people who finish a game this month*, since a party game is mostly one-off
joiners and each new person is a new anonymous user. 50,000 of those a month on the **free** tier
is far past where we are, and past 100k the overage is $3.25 per extra 1,000 players — trivial
next to what a userbase that size should be earning. **Do not shape the design around this cost.**

**The real constraint: anonymous sign-ins are rate-limited to 30 per hour per IP by default.**
That lands directly on our two most important rooms:

- A **classroom of 40 students** is one NAT'd school IP → sign-ins 31–40 get rejected.
- Two 20-person **parties on the same home/office WiFi** in an hour → the second one breaks.

Mitigations, in order:

1. **Raise the limit in the Supabase dashboard** — it's configurable, not fixed. Do this in Slice 2
   and size it against the biggest room we support.
2. **Lazy creation still helps**: creating the row at *finish* rather than at page load removes
   spectators, abandoned lobbies and link-clickers from the count entirely.
3. **Not yet real: "students never get identities".** §6 argues classroom play *should* stay
   pure-guest, and that remains the right end state — but **nothing implements it today.**
   `useProfileAttribution` fires for any player who finishes with a resume token, and nothing
   distinguishes a student from anyone else. Treat this as future work, not protection you
   currently have. Until an account-type or org flag exists to suppress identity creation for
   classroom play, **mitigation 1 is the only one actually defending a 40-student room.**
4. Supabase recommends invisible CAPTCHA / Turnstile on anonymous sign-in to stop database
   bloat from abuse. Weigh it against the zero-friction promise; prefer 1–3 first, and if it's
   ever needed, put it on the *sign-in* only, never in front of joining a game.

So create the identity at **the first finished game**:

- Nothing exists worth persisting until a game completes — trophies and streak days are both
  awarded at finish ([`trophies-and-streaks.md`](./trophies-and-streaks.md) §3.8 puts the award engine in the finish path).
- Pure link-clickers, spectators, and abandoned lobbies cost zero rows and zero rate-limit budget.
- Layer 1 already gives everyone remembered-name before any row exists, so nothing user-visible
  regresses.

**One more confirmed fact:** there is **no automatic cleanup** of anonymous users — pruning is a
SQL job we schedule ourselves. That makes the 90-day prune in §4A our responsibility, not
something the platform does for us.

**Dropped:** the "local-only until the player's second distinct day" lever. It was proposed to
contain MAU cost, that cost turned out not to matter, and it would have bought a one-way
local→server backfill for nothing.

### 2.3 Build accounts **before** trophies/streaks — it makes Case B free ✅ sequencing

Case B (the merge) is the hairiest logic in the whole identity design. But **if identity ships
before any progression data exists, there is nothing to merge.** During that window Case B is a
no-op: sign in, adopt the account's identity, tombstone the anon row, log to `profile_merges`.
The real merge algorithm can land alongside the first system that actually accumulates state.

Concretely: ship Slices 1–4 below, *then* trophies. Do not build them together.

### 2.4 Guest progression is server-side, not "on-device" ✅ DONE (wording fixed 2026-07-31)

[`account-tiers.md:36,68`](./account-tiers.md#L36) says guests earn trophies "🔸 local / on-device." Under the
agreed design an anonymous user has a real `profiles` row, so their progression is server-side —
it's just **not portable to another device**, because the only key is the anon session in local
storage. Fix that wording; the mechanism is fine, the description is misleading.

---

## 3. The load-bearing architectural rule: two identity worlds, never coupled

This is the rule that keeps the app safe to ship.

| | **Gameplay world** (exists today) | **Progression world** (new) |
|---|---|---|
| Identity | `games.host_token`, `players.resume_token`, `room_members.member_code` | `profiles.id` = `auth.uid()` |
| Authorized by | the secret token **in the request** | the JWT in the `Authorization` header |
| Scope | one game / one room | the person, across games |
| Owns | joining, playing, hosting, resuming, kicking | streaks, trophies, bests, clubs, entitlements |
| If it breaks | games break | **games keep working**; only progression stops |

**Rules:**

1. **No gameplay path may ever require a profile.** Every route that plays a game keeps
   authorizing on tokens exactly as it does now. Auth is strictly additive.
2. The join between worlds is **one nullable column**: `players.profile_id`. Null means an
   un-attributed guest, which must remain a fully supported, permanent state.
3. `docs/rls-hardening.md:25-29` is a hard constraint — *"Authorization is by the token in the
   request, never by device/cookie/IP."* Cross-device resume-by-code must not regress. Adding a
   JWT must never become a *precondition* for anything.
4. Progression tables use `auth.uid()` RLS. Gameplay tables keep the existing anon-read /
   service-role-write convention. Two conventions, cleanly separated, as
   [`pricing-implementation-plan.md:138`](./pricing-implementation-plan.md#L138) already requires.

---

## 4. Pre-flight checks (do these first — they are cheap and one of them is a real risk)

**A. Enabling auth flips the browser client's role from `anon` to `authenticated`.**
Verified safe on the *write* side: every server route uses either the JWT-less anon singleton
([`supabase-anon.ts:20-25`](../src/lib/supabase-anon.ts#L20-L25)) or the admin client
([`supabase-admin.ts:20-59`](../src/lib/supabase-admin.ts#L20-L59)) — **no route forwards a user session**, so no
existing write changes role. The exposure is the *browser* client
([`supabase.ts:6`](../src/lib/supabase.ts#L6), [`apps/mobile/lib/supabase.ts:7-15`](../apps/mobile/lib/supabase.ts#L7-L15)), which does direct SELECTs and
realtime subscriptions.

There are **22 legacy `for all to anon` policies** that name `anon` only. Every one I traced was
later dropped and replaced by the lockdown migrations — `20260628132823_rls_lockdown_core_gameplay.sql:26-32`
and `0126_rls_lockdown_rooms.sql:18-21` both recreate policies as `for select using (true)` **with no
role clause**, which applies to all roles. So this *should* be fine. **Verify on the live DB
before Slice 1**, don't assume:

```sql
select tablename, policyname, roles, cmd from pg_policies
where schemaname = 'public' and roles::text[] = array['anon'];
```

Any row returned is a table that breaks for signed-in players. Also confirm `authenticated` holds
SELECT on every table the browser client reads (`information_schema.role_table_grants`).

**B. The column-GRANT gotcha.** `0122` and `0126` converted `games`/`players`/`rooms`/`room_members`
to **column-level** grants. `players.profile_id` (Slice 1) is a new column on `players` and **must be
explicitly granted** to `anon, authenticated` or client reads fail with `42501`. Re-run the `0122`
do-block, or grant the single column.

**C. Session persistence.** `supabase-js` defaults `persistSession: true`, so the browser client is
already capable of holding a session — it has simply never had one. Mobile needs an explicit
storage adapter passed to `createClient` (SecureStore has a ~2KB per-item limit; a JWT pair fits,
but AsyncStorage is the safer default for the session blob and SecureStore stays for the game
tokens it already holds).

**D. Supabase project config** (dashboard, not code): enable anonymous sign-ins; set custom SMTP
to Resend; set the OTP email template to emit `{{ .Token }}` (a 6-digit code) rather than a link.

---

## 4A. Session lifetime — stay signed in indefinitely

**Decision: we configure no expiry — don't enable time-box or inactivity timeout.**

That is not the same as "a session can never end". A session still dies if the refresh token is
revoked (a password/email change, an admin sign-out, a project-wide revocation), if local storage
is cleared, or if a refresh fails while offline long enough for rotation to lapse. What we're
choosing is not to *add* an expiry on top of that. Every consumer must still handle "signed out"
gracefully — which is why `getProfileFromRequest` returns null rather than throwing, and why a
401 clears the cached profile instead of leaving a stale signed-in chip.

Supabase's defaults already give us this, so it's a matter of *not turning things on*:

- The **access token (JWT)** is short-lived (default 1 hour). This is invisible — it's just how
  often the client silently refreshes. Leave it alone; lengthening it only widens the window a
  stolen token stays valid.
- The **refresh token** is what keeps you signed in, and with `persistSession: true` +
  `autoRefreshToken: true` it rotates indefinitely. There is no fixed expiry unless we add one.
- Two opt-in settings would add one — **"time-box user sessions"** (absolute max session length)
  and **"inactivity timeout"**. Both default to *disabled*. **Keep both disabled.** A 3–6 month
  cap would be strictly worse than the default, and there's no security case for it here: we hold
  no payment details or PII beyond an email, and the account exists to protect a *streak*.

Why this matters more than it looks:

1. **An expired anonymous session is unrecoverable data loss.** A guest has no email — the anon
   session in local storage is the *only* key to their profile. If it lapses, their streak and
   trophies are orphaned with no way back. For a signed-in user an expiry is a mild annoyance
   (re-enter email, get a code); for a guest it's permanent. Anon sessions especially must never
   expire.
2. **A streak app that logs you out has broken its own core promise.** Being asked to sign in
   again is exactly the friction the whole anonymous-first design exists to avoid.

**Two interactions to handle:**

- **Mobile auto-refresh doesn't run in the background.** `supabase-js`'s refresh timer is paused
  while the app is backgrounded, so a session can go stale on mobile even though it never
  "expired". Standard fix: an `AppState` listener calling `supabase.auth.startAutoRefresh()` on
  `active` and `stopAutoRefresh()` on `background`. Wire this in Slice 2 with the storage adapter
  — it's the single most common cause of "logged out on mobile for no reason".
- **Never-expiring sessions vs. the 90-day anon prune.** These are different things — one is
  *session* lifetime, the other is *data* retention — and they collide. A guest returning after
  100 days holds a perfectly valid session pointing at a pruned profile. So: the prune must delete
  the `auth.users` row (with `profiles` cascading off it), and the client must treat
  "my session's user no longer exists" as *create a fresh anonymous identity*, not as an error.
  Also: only prune anon profiles with **no** progression — never silently delete a real streak.
- **Shared/family devices** (resolves §8.3). A permanent session on a tablet the whole house plays
  on means the next person inherits your profile. Mitigation is the chip, not an expiry: a
  **"Not you? Switch"** action that signs out and starts a fresh anonymous identity. Ship it with
  the chip in Slice 4.

---

## 5. The build, in slices

Each slice is independently shippable and independently useful.

### Slice 1 — Remembered name & prefs (no backend at all) ✅ DONE

**Ships the biggest user-visible win first, with zero risk.**

Built: `src/lib/identity-local.ts` + `apps/mobile/lib/identity-local.ts` (key `fateround_identity`),
wired into `useJoinFlow` on web and the shared `JoinScreen` on mobile (which covers ~30 game views
at once). Verified in the browser: join game A as a name, open an unrelated game B, field is
prefilled. Priority rules covered by tests in `src/hooks/useJoinFlow.test.tsx`.

**Known gap:** the views that bypass `useJoinFlow` and call `setPlayerSession` directly —
`MahjongPlayerView`, `CodewordsPlayerView`, `AnonymousMessagesPlayerView`,
`SecretMessageSenderView` — don't prefill yet. Not a bug, just uncovered surface; fold them in
when convenient.

- New `src/lib/identity-local.ts` + `apps/mobile/lib/identity-local.ts`: a single non-game-keyed
  record `{ name, gender, avatar, prefs }` in localStorage / AsyncStorage.
- `getPlayerIdentity()` — the accessor named in [`platform-features-master-plan.md:132-151`](./platform-features-master-plan.md#L132-L151).
  For now it reads the local record; from Slice 3 it prefers the profile when
  `!is_anonymous` and falls back to local.
- Wire as a **prefill, never a lock**: [`useJoinFlow.ts`](../src/hooks/useJoinFlow.ts) name input and
  [`JoinScreen.tsx`](../apps/mobile/components/JoinScreen.tsx) default to the remembered name, still fully editable.
  Existing room / tournament prefills keep priority over it.
- Write it back on successful join, and on inline name edit ([`EditNameInline.tsx`](../src/components/ui/EditNameInline.tsx)).
- Leave `kmk_player_<CODE>` completely untouched — this is a new, additive key.

*Ship this on its own. It needs no migration and no decisions.*

### Slice 2 — `profiles` + auth turned on (still no UI) ✅ CODE-COMPLETE, NOT DEPLOYED

Built:

| File | What |
|---|---|
| `supabase/migrations/20260803000000_profiles_identity.sql` | `profiles` (trophy/streak/pref columns pre-added), `profile_merges`, `players.profile_id` + **the required column GRANT**, owner-only RLS, `public_profiles` narrow view |
| `src/lib/identity.ts` / `apps/mobile/lib/identity.ts` | `ensureServerIdentity()`, `getAccessToken()`, `authHeaders()`, `signOutIdentity()` |
| `src/lib/identity-server.ts` | `getProfileFromRequest()`, `isPermanentAccount()` — bearer-token verification, never throws |
| `src/app/api/profile/anon/route.ts` | idempotent profile upsert, id taken from the verified JWT |
| `apps/mobile/lib/identity-storage.ts` | chunked SecureStore session adapter |
| `apps/mobile/lib/supabase.ts` | storage adapter + `AppState` auto-refresh wiring |

All of it is **dormant** — nothing imports `identity.ts` yet. Slice 3 is what turns it on.
13 tests in `src/lib/identity-server.test.ts` cover the never-throws / fail-closed contract.

**Before this ships — deploy checklist:**

1. **Run the pre-flight `pg_policies` query** (§4 A). Static analysis of the migrations says we're
   clean, but that has not been checked against the live DB.
2. **Enable anonymous sign-ins** in the Supabase dashboard. Until then `signInAnonymously()`
   returns an error and `ensureServerIdentity()` correctly resolves to null.
3. **Raise the 30/hour-per-IP anonymous sign-in rate limit.** Non-optional for classrooms (§2.2).
4. **Custom SMTP → Resend**, OTP template emitting `{{ .Token }}`. Needed for Slice 3, not Slice 2.
5. **Schedule the 90-day anon prune** — Supabase has no automatic cleanup. SQL is in the migration.
6. **Smoke-test mobile on a device.** `apps/mobile/lib/supabase.ts` changed for *all* game code:
   it now persists auth sessions and registers an `AppState` listener. No session exists yet so
   the blast radius should be nil, but this is the one change here that touches existing paths.

**Deliberate omissions:** no session-timeout config (§4A — sessions never expire), and no trigger
auto-creating `profiles` on `auth.users` insert (the idempotent upsert route covers it and keeps
every write server-side, matching the house convention).

- **One migration** creating `profiles` exactly as specified in [`trophies-and-streaks.md`](./trophies-and-streaks.md) §5 —
  **including the trophy/streak/pref columns up front** (`trophy_points`, `trophy_level`,
  `current_streak`, `longest_streak`, `last_active_date`, `streak_freezes`, `default_voice_on`,
  `preferred_theme`) so later batches never re-migrate this table. Plus `profile_merges`.
  Timestamped filename (`YYYYMMDDHHMMSS_`), with the commented ROLLBACK block per house style.
- `alter table players add column profile_id uuid references profiles(id) on delete set null;`
  **+ the column GRANT** (pre-flight B). Nullable forever.
- RLS: `profiles` owner-read `auth.uid() = id`; no client write policy; a narrow
  `public_profiles` view exposing `handle, avatar_url, trophy_level, current_streak` only.
- `src/lib/identity.ts`: `ensureServerIdentity()` (idempotent `signInAnonymously` + upsert
  profile), `getAccessToken()`, `signOut()`. Mobile mirror.
- `src/lib/identity-server.ts`: `getProfileFromRequest(req)` — reads the `Authorization: Bearer`
  header, verifies via the admin client's `auth.getUser(jwt)`, returns `profileId | null`.
  **Must never throw and never block a request** — an invalid or absent token is just `null`.
  This mirrors the existing "authorization by token in the request" pattern and lets us skip
  `@supabase/ssr` and cookie-based SSR entirely.

### Slice 3 — The bridge: attribution + upgrade in place ✅ CODE-COMPLETE, NOT DEPLOYED

> **Design change vs. the original sketch — attribution is its own endpoint, not a header on the
> finish request.** A game reaches `finished` from three different places and two have no
> finishing player attached: the host pressing "End game" (which would attribute the *host*, who
> may not even be playing), a quorum-elected client driving `/advance` for the room, and the
> server ticker in `game-tick.ts`, which posts with no auth and no browser at all. Hanging
> attribution off the finish request would therefore have silently skipped every timed and
> round-based game. A call the player's **own** client makes when it observes the finish works
> uniformly for all of them — and needs no changes to the ~40 sites that call `markGameFinished`.

| File | What |
|---|---|
| `src/app/api/profile/attribute/route.ts` | links `players.profile_id`; `resumeToken` proves the player row, the bearer JWT proves the profile |
| `src/hooks/useProfileAttribution.ts` + mobile mirror | fires once on `status === 'finished'`; wired into `useGameViewBootstrap` (36 views) and `useGameSession` (6) on web, and mobile's `useGameViewBootstrap` |
| `src/lib/identity-auth.ts` | `requestEmailCode()` / `verifyEmailCode()` — Case A upgrade-in-place, falling back to Case B |
| `src/app/api/profile/merge/route.ts` | Case-B audit log |
| `src/app/api/profile/me/route.ts` | what the Slice-4 chip renders |
| `src/lib/rate-limit.ts` | three new buckets: `profileAttribute`, `authRequestCode`, `authVerifyCode` |

**Two decisions worth knowing:**

- **The OTP calls run client-side**, not through our API routes as originally sketched. Verifying
  an OTP is what *creates the session*, and the session has to land in the browser's own storage
  — proxying it would mean receiving tokens server-side and shipping them back to call
  `setSession`, so the credentials would transit our infrastructure for no benefit. Supabase
  rate-limits both calls itself.
- **`/api/profile/merge` takes the old session's access token, never a `fromProfileId`.** A
  profile id is not a secret, so the obvious `{ fromProfileId }` shape becomes "move that
  stranger's trophies onto my account" the moment a real merge exists. Both identities are
  proven: the bearer for the destination, the captured anonymous JWT for the source.

**Still to verify against a live Supabase** (cannot be checked without one): that the
`updateUser({ email })` → `verifyOtp({ type: 'email_change' })` pair is the correct Case-A
sequence, and that the "email already registered" error message matches `isEmailTaken()`. Both
are isolated in `identity-auth.ts`.
- `requestEmailCode()` → `signInWithOtp({ email })` (client-side, see above).
- `verifyEmailCode()` → `verifyOtp`. Then:
  - **Case A** (email unknown): `updateUser({ email })` on the existing anon user → same
    `auth.uid()`, `is_anonymous = false`. No data movement.
  - **Case B** (email already has an account): adopt the existing account, tombstone the anon
    profile, write a `profile_merges` row. **Currently a no-op merge — there is no progression
    data yet (§2.3).** Leave a clearly-marked `mergeProfiles()` stub for the trophies batch.
- `GET /api/profile/me`.
- Rate-limit the code endpoints — there is existing infrastructure in
  `20260714120000_api_rate_limit.sql`.

### Slice 4 — The profile chip ✅ CODE-COMPLETE, NOT DEPLOYED

| File | What |
|---|---|
| `src/components/profile/ProfileChip.tsx` + `apps/mobile/components/profile/ProfileChip.tsx` | the "you" button; guest reads `Guest` |
| `src/components/profile/SaveToProfileModal.tsx` | email → 6-digit code, one door, **"Save to profile"** |
| `src/hooks/useProfile.ts` | reads `/api/profile/me` |
| `apps/mobile/lib/identity-auth.ts` | mobile mirror of the OTP flow |

Wired into `MarketingHeader` (both the desktop `.site-nav` and the `.fr-mobile-actions` slots,
mirroring how `ThemeButton` is rendered twice) and mobile's home-screen top bar. Verified in the
browser at desktop and mobile widths; the failure path was exercised too — a rejected address
surfaces inline with no crash, which also confirms the call really reaches Supabase.

**Two deliberate deviations from the spec:**

- **A guest reads `Guest`, never their remembered name.** Wiring in the Slice-1 name looked
  friendlier and I built it that way first, but it quietly implies the progress *is* saved. The
  word "Guest" is doing real work in §2.5 and it wins.
- **Counters are hidden until non-zero.** The spec shows `🔥 3 · 🏆 12 · Guest`, but everything
  reads 0 until the trophies batch, and `🔥 0 · 🏆 0` advertises emptiness. They appear on their
  own once the numbers are real.

**Chip placement — the funnel gap.** The chip first shipped only in `MarketingHeader`, which
covers the home and marketing pages. But the core path is *open a link → play → leave*, and that
path never touches those pages: `/game/[code]` and `/host/[code]` use `GamePlayerChrome` /
`GameHostChrome`. A link-joiner was therefore never told they were a guest and never offered an
account — the entire funnel had no entry point. Fixed 2026-07-31: the chip is now in both
in-game headers too, via a `tone="app"` variant (the `fr-*` classes only resolve inside
`.fr-site`, so the in-game chrome needs app-scope classes). Verified at desktop and mobile widths.

Still **not** on `SiteLogoHeader` (`/create`, `/history`, `/library`, `/input`, `/tournament`):
the global floating `ThemeToggle` sits at `fixed top-4 right-4` on exactly those routes and would
collide. Needs a small layout decision rather than a drop-in.

Note this does put the chip on the *join* screen. That does not violate §2.6's "never prompt at
lobby join" — the chip is passive and interrupts nothing; the rule is about active prompts.

**Not built:** the post-win "save this" prompt (the second prompt surface in §2.6) — it needs
something worth saving, so it belongs with trophies. Until it exists there is **no active
conversion moment anywhere in the product**, so expect signup conversion near zero by
construction; that's a property of the build, not of the pricing. And there is still no
`/profile` page for a signed-in player to land on; the chip opens the same sheet in both states.

**Original scope, for reference:**

- The always-present corner button from [`trophies-and-streaks.md`](./trophies-and-streaks.md) §2.5. Guest state reads
  `Guest`; signed-in reads the handle. Streak/trophy counters land empty until the trophies batch —
  **ship the chip anyway**, it's the login door for returning users on a new device.
- One email+code screen, in-tab, button labelled **"Save to profile"** — never "Sign up".
- Post-win prompt surface stubbed but not fired until there's something to save.
- Mobile: same chip, same screen. **No purchase or upgrade UI** — that constraint is already
  locked in [`pricing-implementation-plan.md:48-51`](./pricing-implementation-plan.md#L48-L51) and applies from day one.

### Then, and only then

Trophies & streaks → daily/leaderboards → clubs → billing/entitlements → orgs. Per
[`platform-features-master-plan.md`](./platform-features-master-plan.md). Billing attaches to `profiles`; it cannot start before
Slice 3.

---

## 6. Schools & corporate — why this design already serves them

The one segment that *wants* accounts. Nothing here needs changing for them, because:

- An educator or admin is a fully motivated signup — they're provisioning, not playing. The
  email-OTP door is enough; SSO is an Enterprise add-on, later.
- **Students never need accounts.** A class joins by code as guests exactly like a party does,
  which is what makes the no-student-device classroom mode viable
  ([`schools-education-market.md`](./schools-education-market.md)). The org layer sits *above* `profiles`
  (`profiles.school_id`), it does not push identity downward onto players.
- So: keep guests first-class permanently. It is not a consumer compromise we tolerate — it's
  the thing that makes the school product work.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| **Anonymous sign-ins rate-limited to 30/hr per IP** — breaks a 40-student classroom or two parties on one WiFi | Raise the limit in the dashboard (Slice 2); create at first *finish*; keep students pure-guest (§2.2, §6). **The top operational risk in this plan.** |
| Anonymous users inflate Supabase MAU | Checked — not a real cost (50k free / 100k Pro, $0.00325 overage). Still prune at 90 days: there is no automatic cleanup. |
| A legacy `to anon`-only policy breaks for signed-in players | Pre-flight A — one `pg_policies` query, before any code. |
| `players.profile_id` unreadable (`42501`) | Pre-flight B — explicit column GRANT. |
| Auth becomes a soft dependency of gameplay by accident | §3 rule 1. Enforce in review: no gameplay route may call `getProfileFromRequest` and branch on `null` by failing. |
| Mobile drifts (3 codebases, duplicated types) | Every slice lands web + mobile together. See `web-shared-parallel-copies` memory. |
| Case B merge loses guest progress | Sequencing (§2.3) makes it vacuous now; real algorithm ships with trophies. |
| OTP email abuse | Rate-limit via existing `api_rate_limit`. |

---

## 8. Open decisions

1. ~~MAU cost~~ — **resolved 2026-07-31 (§2.2)**: anonymous users count toward MAU but the
   allowances (50k free / 100k Pro) put this far outside our range; overage is $0.00325/MAU.
   Slice 2 instead has to **raise the 30/hour-per-IP anonymous sign-in limit** in the dashboard,
   and schedule the 90-day prune ourselves (no automatic cleanup exists).
2. ~~Patch `pricing-implementation-plan.md:34` to drop OAuth; reconcile its club numbers~~ —
   **done 2026-07-31.** OAuth line now reads email-OTP-only. Club numbers reconciled in favour of
   `clubs-spec.md` (unlimited joining, cap clubs *owned*; roster 20 free / 50 Club Pro) — flagged
   in-place as a monetization change, since "free = join 1 club" came from the pricing draft and
   may have been deliberate. The misleading "on-device / 🔸 local" guest wording in
   `account-tiers.md` (§2.4) is fixed too.
3. ~~Anonymous session lifetime on a shared/family device~~ — **resolved in §4A**: sessions never
   expire; shared-device risk is handled by a "Not you? Switch" action on the chip, not by a timeout.
4. **Handle vs typed name.** Slice 1 remembers a name locally; `profiles.handle` is the same idea
   server-side. Confirm they're one concept, not two, before Slice 3.
