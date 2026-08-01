# Security & architecture audit — August 2026

> **Status: remediated in code on `fix/security-audit-2026-08`.** Every finding below has a fix
> in that branch — see "Remediation status" directly under the summary for what landed, what is
> a product decision rather than a code change, and what is verified vs. unverified. The
> findings themselves are left as originally written, in the past tense, so the record of what
> was actually exploitable stays intact.

Independent pre-launch review of the FateRound web app, backend (Supabase/Postgres) and
mobile client. Findings below were produced by reading the code **and by executing the
attacks read-only against the live `fateround-dev` Supabase project using nothing but the
publishable anon key that already ships in the client bundle**. Where a finding was proven
by execution it says so; where it was not, it says that too.

Scope: authorisation at the data layer, authentication on server endpoints, entitlement
integrity, PII exposure, secrets handling, third-party cost/credential exposure, file
storage, background jobs, deployment config, CI posture. Out of scope: dependency CVEs,
penetration testing of the LiveKit/Caddy hosts, load testing.

---

## Executive summary

The core architecture is sound and was clearly built with this problem in mind. Game writes
go through server routes that authorise the caller by a secret token and then write with the
service role, and that boundary genuinely holds — I tried to write to `games`, `players`,
`rooms` and `room_members` with the public key and was refused every time. The mobile app
writes nothing to the database directly. Every admin endpoint is gated. That is a better
starting position than most pre-launch products.

The problem is that the hardening was done table-by-table, and four things were left behind.
**Tournaments were never locked down at all**: anyone can read the secret host token of every
tournament on the platform and rewrite any player's score, so a tournament result can be
edited by a spectator. **Trophy levels can be set by anyone** — a view added last week
accidentally re-opened a write path into the profile table that the table's own rules
correctly close, which matters now because trophies and streaks are meant to become a paid
feature. **Two endpoints hand out third-party credentials to whoever asks**: one mints a
voice-room pass (I minted a working one for a real game and joined as a real player's
identity), and the other returns a live Spotify access token for any host who has connected
Spotify, keyed on the six-character game code — that token carries permission to read that
person's Spotify email address. And four newer games (Quiplash, Quick Draw guess mode,
Memory Match, Ping Pong) were shipped after the lockdown work and never got their own
lockdown, so their game state is publicly editable.

None of this requires an account, a password, or any credential the app doesn't already give
away. The fixes are mostly small and mechanical — a handful of migrations and two endpoint
authorisation changes — but four of them should land before launch. The pattern to take away
is that "lock down the tables" was done as a checklist per game rather than as a default, so
every game and view added since has been open by default; changing that default is the
durable fix.

---

## Remediation status

Fixed in code, with the migration or file that does it:

| ID | Fix | Where |
|---|---|---|
| C1 | Tournament tables SELECT-only + writes revoked; `tournaments.host_token` hidden by column grant; the two remaining anon-client writes moved to the service role; the public GET stopped returning `host_token` | `20260803120000_lockdown_tournaments.sql`, `api/tournaments/route.ts`, `api/tournaments/[code]/{route,finish}.ts` |
| C2 | Write privileges revoked on the view, `security_invoker = on`, and `profiles` reduced to a five-column public grant | `20260803130000_fix_public_profiles_writable.sql` |
| C3 | `/api/spotify/{login,token}` now authorize on the host token or the player's resume token and DERIVE the account identity; `user-read-email` dropped from the requested scopes | `src/lib/music-auth.ts`, `src/lib/spotify.ts`, both routes, `useSpotifyPlayer`/`useSpotifySync`, `HostMusicControl`, `NowPlayingBar` |
| C4 | Voice authorizes on `resume_token` / `member_code`, and the LiveKit identity is derived from the resolved row instead of trusted from the request | `src/lib/audio-room-auth.ts`, `api/audio-{token,presence}`, `AudioChat`, `RoomVoiceRail`, mobile `useVoiceRoom` |
| H1 | All 11 late-game tables locked to SELECT-only, plus 7 more found by the new CI check (see below) | `20260803140000_lockdown_late_games.sql` |
| H2 | `codewords_boards.key` hidden by column grant; new `/api/codewords/board` vends the real key only to the host, the spymasters, or anyone once the game is finished, and a MASKED key (true type at revealed cells, `null` elsewhere) to operatives | `20260803170000_hide_codewords_key.sql`, `api/codewords/board/route.ts`, both board views, history page |
| H3 | `avatars` reduced to public-read; the anon write policy is gone (uploads already ran through `/api/photos` with the service role) | `20260803150000_avatars_bucket_read_only.sql` |
| H4 | HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`, `poweredByHeader: false` | `next.config.ts` |
| M1 | The shared dev/prod secrets are now documented as an explicit split-required action | `docs/environments.md` |
| M2 / M3 / M7 | Rate limits on `/api/klipy`, `/api/library` POST and `/api/ai-questions`; the PostgREST `.or()` filter injection in `?q=` is sanitized | `src/lib/rate-limit.ts` + the three routes |
| M5 | Constant-time comparison for the admin password, email and session signature | `src/lib/admin-session.ts` |
| M6 | JSON-LD serializer escapes `<`, `>`, `&` — verified that a `</script>` payload no longer breaks out and still round-trips | `src/lib/seo.ts` |

**Systemic fix.** `20260803160000_default_privileges_lockdown.sql` changes the Postgres default
privileges for `public`, so new tables and views are SELECT-only for anon/authenticated from
here on. C1, C2 and H1 all existed because Supabase's default is `grant all` and the hardening
programme was a per-object checklist — this closes the class, not just the four instances.

**New CI gate.** `src/lib/rls-boundaries.integration.test.ts` + the `rls-boundaries` job assert
the OUTCOME (can the anon key actually write this row?) against the environment's own Supabase
project right after migrations apply. It includes a known-positive control — it first proves the
probe reports `true` for the service role, so a green run can't be vacuous. It fails loudly if
its credentials are missing rather than skipping.

⚠️ **Action required before merging:** the job needs `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` as *variables*, and `SUPABASE_SERVICE_ROLE_KEY` as a *secret*, on
both the `Preview` and `Production` GitHub Environments. Without them the job fails by design.

### Found by the new check, not by the manual audit

Running the gate against dev immediately surfaced two things the manual pass missed, both now
fixed:

- **Anon `INSERT` on 7 more tables** — `quick_draw_sessions`, `quick_draw_assignments`,
  `quick_draw_drawings`, `quick_draw_titles`, `quick_draw_votes`, `anonymous_messages` and
  `anonymous_room_bans`. `UPDATE` was already refused on these, so probing only updates (as the
  manual sweep did) reported them clean. Added to `20260803140000`.
- **`/api/anonymous-messages` POST authorized on a bare `playerId`** — the same class as C3/C4.
  Player ids are enumerable, so anyone could post into an anonymous room *as another named
  player*, on boards whose entire premise is anonymity. Now requires `resumeToken` and resolves
  the author with `assertPlayer`; all five web and mobile senders updated.

### Not fixed — needs a decision, not a patch

- **H5 (public reads) and M4 (`/api/game-snapshots`).** M4 cannot be meaningfully closed on its
  own: `game_snapshots` is anon-readable at the DB, and `/history/[code]` is a public shareable
  results page that reads the same rows directly. Locking only the endpoint would look like a
  fix while changing nothing. Both got a rate limit and an explicit comment saying it is not an
  access control. The real question — do shared results pages stay public? — is yours, and the
  table can be locked as soon as it is answered.
- **M1 rotation.** The documentation now says which secrets must differ per environment, but the
  values themselves live in `terraform.<env>.tfvars` and SSM. Rotating them is a deploy action.

### Verified vs. unverified

- **Verified by execution:** the new CI check reproduces exactly the 15 writable objects found by
  hand, and independently found the 7 INSERT holes; the JSON-LD escaping was tested against a
  `</script>` payload; full typecheck (web + mobile), 984 tests and Prettier all pass.
- **NOT verified live:** none of the seven migrations has been applied. `supabase db push` needs
  `SUPABASE_DB_PASSWORD`, which is not available locally, so they are code-reviewed only. They
  apply to dev on merge via the existing `migrate` job — and the `rls-boundaries` job runs
  immediately afterwards, which is what will actually prove the holes are closed. **Treat every
  DB-layer fix as unproven until that job passes green on dev.**
- **Not re-tested end-to-end:** the voice, Spotify, codewords and anonymous-message flows are
  typecheck- and test-clean but were not exercised against a live game. Codewords and voice
  carry the most regression risk and are worth a manual pass on dev.

---

## What needs fixing before launch

| ID | Issue (plain English) | Priority | What it means |
|---|---|---|---|
| C1 | Anyone can read every tournament's host password and rewrite any player's score | Critical | A spectator can take over a tournament, change who is winning, or delete players. Tournament results cannot currently be trusted. |
| C2 | Anyone can set any player's trophy level to any value | Critical | The trophy/streak system is meant to underpin paid tiers. Right now it can be self-granted from a browser console. |
| C3 | Anyone who knows a game code can obtain that host's live Spotify access token | Critical | The token allows controlling their music and reading their Spotify account email. Game codes are public and can be listed in bulk. |
| C4 | Anyone can mint a voice-room pass for any game and speak as any player | Critical | Someone uninvited can listen to, and talk into, any live voice room on the platform. Proven end-to-end. |
| H1 | Quiplash, Quick Draw (guess), Memory Match and Ping Pong game data is publicly editable | High | Scores and rounds in those four games can be rewritten mid-match by anyone. |
| H2 | The secret answer key in Codewords is readable by everyone | High | Any player can see which words are theirs and win every game. |
| H3 | Anyone can upload files into the public `avatars` storage bucket | High | Your domain can be used to host arbitrary files, including abusive or illegal content. |
| H4 | The site sends no security headers | High | Missing clickjacking, HTTPS-pinning and content-injection protections that browsers rely on. |

---

## What's already working well

These are genuine, and they mean you do **not** need to re-examine these areas:

- **The server-authoritative write boundary is real.** `games`, `players`, `rooms` and
  `room_members` reject anon INSERT/UPDATE/DELETE at the *privilege* level (Postgres 42501),
  not just via policy. Verified by execution.
- **Column-level token hiding works.** `select *` on `games`/`players` fails for anon because
  `host_token`/`resume_token` are ungranted (migration `0122`). The ⚠️ open question in
  `docs/rls-hardening.md` about whether this holds — it does, for REST. (Realtime still
  unverified; see "could not verify".)
- **`assertPlayer` resolves the actor from the secret token and ignores client-supplied
  `playerId`.** This is the right design and it is applied consistently across the game routes.
- **The mobile app performs zero direct database writes** — 11 `.delete(` hits in
  `apps/mobile` are all JavaScript `Set`/`Map` calls. Everything goes through the API. The
  backend is therefore the single boundary to defend for both clients.
- **Every `/api/admin/*` route is gated** by `assertAdminRequest` — I checked all of them, not
  a sample. The session cookie is HMAC-signed, expiring, httpOnly, and pinned to `ADMIN_EMAIL`.
- **Rate limiting is well built**: DB-backed so it works across serverless instances, one
  atomic RPC so concurrency can't slip past, IP stored only as a peppered HMAC, and
  deliberately fail-open with Cloudflare as the real gate.
- **Error responses are scrubbed** (`internalErrorMessage`) so Postgres constraint names don't
  reach clients.
- **The unauthenticated `expire-turn` / `expire-*` endpoints are a sound design, not a hole.**
  They act only once a deadline has genuinely passed, verified server-side. I checked several;
  the guard is present in each.
- **No secrets are committed.** `.env*` is gitignored, only `.example` files are tracked, and
  nothing secret appears in git history. CI deploys via OIDC with no stored AWS keys.

---

## Consolidated findings

| ID | Finding (technical) | Severity | Evidence | Track |
|---|---|---|---|---|
| C1 | `tournaments`, `tournament_players`, `tournament_games` still carry `FOR ALL USING (true) WITH CHECK (true)`; `tournaments.host_token` is anon-SELECTable | Critical | `supabase/migrations/0097_tournaments.sql:43,46,49`; executed: anon UPDATE of a real `tournament_players` row returned 1 row; anon UPDATE of a real `tournaments` row succeeded; anon read returned `host_token` for all 15 tournaments | Fix now |
| C2 | `public_profiles` is an auto-updatable view with definer rights; Supabase default privileges grant anon INSERT/UPDATE/DELETE on it, so writes bypass `profiles`' own RLS | Critical | `supabase/migrations/20260803000000_profiles_identity.sql:112-116`; executed: anon set `trophy_level = 999` on a real profile, confirmed write-through to `profiles`, restored | Fix now |
| C3 | `/api/spotify/token` treats `identity` as a bearer credential, but identity is `host-<GAMECODE>` and game codes are anon-enumerable | Critical | `src/app/api/spotify/token/route.ts:14-23`; `src/lib/spotify.ts:17-23` (scopes include `user-read-email`, `user-read-private`); `spotify_accounts.identity = "host-R4G3UG"` | Fix now |
| C4 | `/api/audio-token` authorises `auth:{kind:'player'}` on `players.id`, a value anon can read | Critical | `src/lib/audio-room-auth.ts:21-32`; executed: minted a LiveKit JWT with `roomJoin/canPublish/canSubscribe` for room `J5A9EK` under a real player's `sub` | Fix now |
| H1 | Quiplash (4 tables), Quick Draw guess mode (4), Memory Match (2), Ping Pong (1) shipped after the lockdown programme and have no restrictive policies | High | `supabase/migrations/20260708210000_quiplash.sql` (no policy statements); executed: anon UPDATE returned 1 row on real rows in each; anon DELETE permitted | Fix now |
| H2 | `codewords_boards` has a SELECT-everything policy but the row contains the secret key card | High | `supabase/migrations/0118_rls_lockdown_codewords.sql:29`; executed: anon read `key: ["blue","red","assassin",…]` for a real board | Fix now |
| H3 | `avatars` bucket is public **and** accepts anonymous uploads and listing | High | executed: anon `storage.from('avatars').upload(...)` succeeded (file removed afterwards); `listBuckets` shows `avatars public=true` | Fix now |
| H4 | No CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy or Permissions-Policy in production; `x-powered-by` present | High | `curl -I https://fateround.com/` — headers absent; `next.config.ts:26-33` sets only a content-type header | Fix now |
| H5 | Every game code, player name and participant name is enumerable in bulk with the publishable key | High | executed: anon SELECT on `games`, `players` (curated columns), `participants` (157 rows) | Decide |
| M1 | `admin_password`, `admin_session_secret`, `klipy_api_key` and the LiveKit key/secret are the **same values** in dev and prod | Medium | `docs/environments.md` "Shared across both environments" | Fix soon |
| M2 | `/api/klipy` is an unauthenticated proxy spending your Klipy quota | Medium | `src/app/api/klipy/route.ts` — no auth, no rate limit | Fix soon |
| M3 | `/api/library` POST is an unauthenticated public write; the `q` param is string-interpolated into a PostgREST `.or()` filter | Medium | `src/app/api/library/route.ts:33,45-` | Fix soon |
| M4 | `/api/game-snapshots` returns full `snapshot_data` for any game code with no auth | Medium | `src/app/api/game-snapshots/route.ts:9-21` | Fix soon |
| M5 | Admin auth is a single shared email+password, no MFA, 7-day cookie, non-constant-time comparison | Medium | `src/lib/admin-session.ts:78-84` | Fix soon |
| M6 | JSON-LD is injected via `dangerouslySetInnerHTML` with no `<` escaping | Low | `src/app/blog/[slug]/page.tsx:59,73`; `src/lib/seo.ts` uses bare `JSON.stringify` | Longer track |
| M7 | `/api/ai-questions` is an unauthenticated outbound proxy to the Anthropic API | Low | `src/app/api/ai-questions/route.ts` | Longer track |

---

## Remediation detail

### C1 — Tournaments were never locked down

`0097_tournaments.sql` created the three tournament tables with `FOR ALL USING (true) WITH
CHECK (true)`, and the Phase 4 lockdown programme (migrations 0106–0121) covered the 16
*game* table groups but not tournaments. `host_token` also sits in a broadly-readable row —
the row-level/column-level distinction that migration `0122` fixed for `games` and `players`
was never applied here. So the tournament host credential is public, and the score table is
directly writable.

Exploit path, no account required: `GET /rest/v1/tournaments?select=id,host_token` with the
publishable key → you now hold every tournament's host token → `PATCH
/rest/v1/tournament_players?id=eq.<id>` with `{"total_points": 99999}`, or use the host token
against `/api/tournaments/[code]` to act as host. Executed both the read and the write.

**Fix:** one migration that (a) replaces the three `_all` policies with SELECT-only `_read`
policies, mirroring `0106`–`0121`, (b) `REVOKE INSERT, UPDATE, DELETE ON tournaments,
tournament_players, tournament_games FROM anon, authenticated`, and (c) applies the `0122`
treatment to `tournaments.host_token` — revoke SELECT on that column from anon/authenticated
and re-grant the rest. Then confirm every tournament write in `src/app/api/tournaments/**`
already uses `getSupabaseAdmin()`; any that use the anon client will start failing and must be
switched first. Trade-off: none of substance, but stage it in the documented order (writes
server-side first, then the migration) or live tournaments break mid-event.

### C2 — `public_profiles` re-opens the write path that `profiles` closes

The migration comment reasons carefully about *reads* — it enumerates columns explicitly so a
sensitive column can't leak later — and is correct about that. It doesn't consider writes.
A view of the form `select <cols> from <table>` is **auto-updatable** in Postgres, Supabase's
default privileges grant `ALL` on new objects in `public` to `anon`/`authenticated`, and a view
without `security_invoker` runs as its owner, so the underlying table's RLS never applies.
Result: `profiles` correctly rejected my direct anon UPDATE (0 rows), and the identical write
through `public_profiles` succeeded and propagated.

Today the blast radius is `trophy_level`, `current_streak`, `handle` and `avatar_url` on any
profile. Per `docs/platform-features-master-plan.md` those become paid-tier signals, at which
point this is an entitlement bypass.

**Fix, in this order:** `revoke insert, update, delete on public.public_profiles from anon,
authenticated;` then `alter view public.public_profiles set (security_invoker = on);` and add
an explicit `profiles` SELECT policy for the columns the leaderboard needs (or keep the
definer view and rely on the revoke alone — simpler, but it re-breaks if someone re-runs
default grants). Then audit for the same shape: `grep -n "create .*view" supabase/migrations`
and check each for the same missing revoke. The general fix is a migration that sets
`alter default privileges in schema public revoke insert, update, delete on tables from anon,
authenticated` so new objects stop being writable by default — that single change also prevents
H1 recurring.

### C3 — `/api/spotify/token` vends a real user's OAuth token to anyone

The route's own comment states the design: "The caller presents its secret `identity` … that
identity IS the bearer credential." The identity is not secret. The stored value is
`host-R4G3UG` — the literal string `host-` plus the six-character game code — and game codes
are listable in bulk with the publishable key. So `POST /api/spotify/token {"identity":
"host-<code>"}` returns a freshly-refreshed access token for whoever connected Spotify to
that game. The granted scopes are `streaming user-read-email user-read-private
user-modify-playback-state user-read-playback-state`, so the token reads the victim's Spotify
email address and controls their playback.

I confirmed the identity format and the enumerability of game codes by execution. I did **not**
execute the token retrieval itself — pulling a live third-party credential was outside what I
was willing to run. Treat it as one HTTP request away from proven.

**Fix:** stop using `identity` as the credential. Key `spotify_accounts` on the game's
`host_token` (or require the host token in the request body and verify it with `assertHost*`
before vending), exactly as `/api/audio-token`'s `kind:'host'` branch already does. Also drop
`user-read-email` and `user-read-private` from `SPOTIFY_SCOPES` — the playback SDK does not
need them, and removing them shrinks the damage of any future leak. Existing rows will need
re-linking after the key change; a short-lived migration that maps `host-<code>` → that game's
current `host_token` avoids forcing every host to reconnect.

### C4 — `/api/audio-token` mints voice passes on a public identifier

`authorizedRoomName` treats `identity` as proof for `kind:'player'` and `kind:'member'`,
looking it up in `players.id` / `room_members.id`. The comment calls these "a server-generated
UUID" and therefore secret, but `game-admin.ts` states the opposite for the same value — "any
client-supplied `playerId` (a public, forgeable value)" — and the roster read confirms it:
anon can `select id, name, game_id from players` with no filter.

Executed: read a roster row with the publishable key, posted it to
`https://dev.fateround.com/api/audio-token`, and received a LiveKit JWT granting `roomJoin`,
`canPublish` and `canSubscribe` for that game's room under that player's `sub`. Anyone can
therefore silently listen to any voice room, or speak into it as an existing player. Because
`LIVEKIT_API_KEY`/`SECRET` are shared between dev and prod (M1), a token minted from the dev
app is valid on the same LiveKit instance the production rooms use.

**Fix:** authorise the player branch with `resume_token` via `assertPlayer` (the helper already
exists and does exactly this) rather than `players.id`, and the member branch with
`room_members.member_code`, which migration `0126` already hid from anon. Keep `identity` as
the LiveKit display identity but derive it server-side from the resolved row, never trust it.
Trade-off: the client must now send its resume token to `/api/audio-token`; it already holds
one in local session, so this is a one-line client change per call site.

### H1 — Four games shipped after the lockdown and were never covered

`quiplash_sessions/answers/votes/battles`, `quick_draw_guess_sessions/players/words/guesses`,
`memory_match_progress/submissions` and `ping_pong_sessions` all accept anon UPDATE and DELETE
on real rows (executed). `20260708210000_quiplash.sql` contains no policy statements at all.
This is the sibling-bug case: the lockdown was a per-game checklist, so anything added after
the checklist was written is open.

**Fix:** one migration adding SELECT-only `_read` policies plus `REVOKE INSERT, UPDATE, DELETE
… FROM anon, authenticated` for all eleven tables, and then the default-privileges change
described under C2 so the twelfth game doesn't repeat this. Add a test that fails when a table
in `public` grants write to `anon` — that is the check that actually prevents recurrence, and
it belongs in CI (see "longer-track").

### H2 — The Codewords key card is public

`0118_rls_lockdown_codewords.sql` correctly removed the write policy but left
`create policy "codewords_boards_read" … for select using (true)`. Row-level access grants
every column, and this row's whole purpose is a secret: I read `key: ["blue","red","assassin",
…]` alongside the word list for a real board with the publishable key. Any player can win
every game, and can identify the assassin.

**Fix:** move `key` out of the anon-readable surface — either `REVOKE SELECT (key) ON
codewords_boards FROM anon, authenticated` (matching the `0122` column-grant approach) and
serve it to spymasters through a server route that checks `resume_token` against
`codewords_player_roles`, or split it into a `codewords_board_keys` table with no anon grant.
The column-revoke is smaller; check first that no client `select('*')` on `codewords_boards`
remains, since Postgres rejects `*` over an ungranted column.

### H3 — Anonymous uploads to a public bucket

`avatars` is `public=true` and anonymous callers can both list it and upload to it (executed;
test object removed). `blog` correctly rejects anonymous uploads, so the correct policy shape
already exists in the project — it just wasn't applied to `avatars`.

**Fix:** drop the permissive `storage.objects` INSERT policy for `avatars` and replace it with
one restricted to `authenticated` and to a path prefix equal to the caller's own profile id
(`(storage.foldername(name))[1] = auth.uid()::text`), plus a size and MIME restriction on the
bucket. Uploading via a server route with the service role is the alternative if avatars need
to work for anonymous-auth users before they have a stable id.

### H4 — No security headers

Verified live against `https://fateround.com/`: no `content-security-policy`,
`strict-transport-security`, `x-frame-options`, `x-content-type-options`, `referrer-policy` or
`permissions-policy`; `x-powered-by: Next.js` is present. Neither `next.config.ts` (which sets
only a content-type header for the Apple association file) nor Cloudflare is adding them.

**Fix:** add a `headers()` block in `next.config.ts` with `Strict-Transport-Security:
max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN` (or
`frame-ancestors` in CSP), `Permissions-Policy: camera=(), geolocation=(), microphone=(self)`
— note microphone must stay `self` for LiveKit voice — and set `poweredByHeader: false`.
Trade-off worth stating: a strict CSP is the valuable one and the fiddly one. The app inlines
`ThemeInitScript` and JSON-LD, so a `script-src 'self'` policy needs nonces threaded through
those. Ship the cheap headers this week and treat CSP as a two-day task, in report-only mode
first.

### H5 — Bulk read access to game and player data

`docs/rls-hardening.md` records this as a deliberate, documented decision: reads stay public
because realtime needs them, and the threat model was write-side cheating. That reasoning was
defensible when the only readable data was game state. It is worth re-opening now for two
reasons: player and participant names are frequently real first names and are enumerable in
bulk across the whole platform (157 participant rows on dev, no filter), and the public
readability of `players.id` and `games.id` is precisely what makes C3 and C4 exploitable. The
accepted read risk has quietly become an auth dependency.

**Fix (decide, don't rush):** the minimum is to stop *authorising* anything on values from this
surface — that is C3 and C4, and fixing those removes the urgency. The larger fix is scoping
reads to a game you can name, e.g. requiring `?id=eq.<code>` by adding a policy predicate that
rejects unfiltered selects, or moving reads behind server routes; both have realtime
implications and should not be attempted the week of launch. Re-read this decision once the
identity work in `docs/accounts-and-identity-plan.md` lands, since it changes what's available
to gate on.

### M1 — Dev and prod share admin, LiveKit and Klipy secrets

`docs/environments.md` is admirably explicit that `admin_password`, `admin_session_secret`,
`klipy_api_key` and `LIVEKIT_API_KEY/SECRET` are the same value in both environments. The
consequence is that dev — which has looser data and more people poking at it — is a full path
to the production admin panel, and that a voice token minted anywhere is valid everywhere.
`ADMIN_SESSION_SECRET` is additionally load-bearing for two unrelated things: the manager
session HMAC (`src/lib/manager-session.ts:26`) and the rate-limiter's IP pepper
(`src/lib/rate-limit.ts`), so rotating it silently logs out managers and resets rate-limit
buckets.

**Fix:** generate distinct values per environment in `infra/terraform.<env>.tfvars` and SSM.
Self-hosted LiveKit supports multiple API key/secret pairs — issue one per environment rather
than sharing. Split `ADMIN_SESSION_SECRET` into `ADMIN_SESSION_SECRET`, `MANAGER_SESSION_SECRET`
and `RATE_LIMIT_PEPPER` so each can be rotated independently.

### M2 — `/api/klipy` is an open quota drain

No auth, no rate limit, forwards `q`/`page` straight to Klipy on your API key. A script can
exhaust the plan and take GIFs out of every game. **Fix:** add the existing `rate-limit`
helper with a new bucket (the mechanism is already there — this is a five-line change), and
require a valid game code in the query so the endpoint is only usable from inside a game.

### M3 — `/api/library` POST and filter injection

`POST /api/library` accepts question packs from anyone with only length checks — expect spam
and abusive content in the public library; the moderation queue (`status = 'approved'`) limits
the damage but not the volume. Separately, line 33 interpolates user input into a PostgREST
`.or()` string: `title.ilike.%${search}%,description.ilike.…`. A `q` containing a comma or a
parenthesis injects additional filter terms into the OR group. The `.eq('status','approved')`
is a separate AND so unapproved packs stay hidden, and the impact is limited to boolean
inference over other columns of the same table — but it is injection and it should not be
there. **Fix:** reject or escape `,`, `.`, `(`, `)`, `*` and `%` in `q` before building the
filter, or use `textSearch`/an RPC with a bound parameter. Add the rate-limit helper to the
POST, and consider requiring an account (`isPermanentAccount`) to submit once identity ships.

### M4 — `/api/game-snapshots` is unauthenticated

Returns the full `snapshot_data` blob for any game code. The blobs contain per-player votes
and answers (confirmed by reading one). For games like Never Have I Ever or Confessions that
is personal content. **Fix:** require `resume_token` (via `assertPlayer`) or `host_token`
before returning snapshots for a game.

### M5 — Admin authentication

One shared email+password, no second factor, a 7-day cookie, and `verifyAdminCredentials`
compares with `===` (timing-observable, though the practical risk over HTTPS behind Cloudflare
is small). The admin panel can edit blog posts, game limits, community leaderboards and
platform content. **Fix:** move to per-admin accounts on the Supabase Auth you now have, or at
minimum add TOTP and shorten the session to 24 hours with re-auth for destructive actions. Use
a constant-time comparison (`crypto.timingSafeEqual` over hashed inputs) for both the password
and the session signature in `verifyAdminSessionToken`.

---

## Longer-track items

- **Make "locked down" the default, not a checklist.** Every finding except C3/C4 exists
  because a new table or view inherited Supabase's permissive defaults. One migration —
  `alter default privileges in schema public revoke insert, update, delete on tables from
  anon, authenticated` — plus the per-table revokes above converts this from a recurring class
  of bug into a one-time fix.
- **CI does not test any security boundary.** `ci.yml` runs typecheck/lint/vitest, and the
  suite is rich but exercises pure game engines. Add a single integration test that connects
  with the anon key and asserts, for every table PostgREST exposes, that INSERT/UPDATE/DELETE
  is refused and that no column matching `/token|secret|key$/` is selectable. That test would
  have caught C1, C2, H1 and H2 on the commit that introduced each. Write it so it *fails*
  first — assert against a deliberately-opened table before trusting it.
- **`eslint .` is currently broken in this repo** (noted in project memory), so the lint gate
  in CI is not doing what it appears to. Worth confirming what CI actually runs.
- **`vercel.json` is vestigial** — deployment is ECR + SSM via GitHub Actions. Remove it so
  nobody assumes Vercel is enforcing anything.
- **Observability**: there is no alerting on the interesting signals — admin login attempts,
  rate-limit 429s, service-role errors. `docs/observability-plan.md` exists; the security
  events belong in it.
- **JSON-LD escaping (M6)**: `JSON.stringify` output goes into `<script>` unescaped, so a
  blog title containing `</script>` breaks out. Input is admin-authored so this is not
  exploitable by outsiders today; escape `<`, `>` and `&` in the serializer anyway — it's a
  three-line change in `src/lib/seo.ts`.
- **`/api/ai-questions` (M7)** takes the caller's own Anthropic key, so there is no cost
  exposure to you — that was a good design choice. It does make your server an unauthenticated
  outbound proxy to `api.anthropic.com`, which is worth a rate limit.

---

## Anything I could not verify

- **Production database.** Every executed probe ran against the `fateround-dev` Supabase
  project (`xzvsrzbbgxbaagqwtpts`), because that is what `.env.local` points at. Prod
  (`skhvbzitwvnbhqxfitgh`) receives the same migrations, so C1, C2, H1, H2 are almost certainly
  identical there — but I did not confirm it, and you should re-run the same checks against
  prod before and after the fixes rather than assume.
- **C3 end-to-end.** I proved the identity format and that game codes are enumerable; I did
  not execute the token retrieval or call the Spotify API with the result.
- **Realtime token leakage.** `docs/rls-hardening.md` flags an open question — whether
  ungranted columns (`host_token`, `resume_token`) are excluded from anon `postgres_changes`
  payloads. I verified the REST path (they are excluded) but did not open a realtime
  subscription and observe an UPDATE payload. This is still open and is worth ten minutes.
- **Cloudflare WAF rules.** `docs/cloudflare-rate-limits.md` describes edge rules that are the
  real gate in front of the app-level backstop. I could not see the Cloudflare configuration,
  so I cannot say what is actually enforced there — including whether any of the
  unauthenticated endpoints above are already rate-limited at the edge.
- **Storage bucket policies beyond the two buckets that exist** (`avatars`, `blog`) — there
  were no others to check.
- **The LiveKit server's own configuration** (room limits, token TTL enforcement, whether
  `canPublish` is further constrained server-side). C4 is proven up to holding a valid token;
  I did not connect to the room.
