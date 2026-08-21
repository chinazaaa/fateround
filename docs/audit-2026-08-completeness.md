# FateRound completeness audit — 2026-08

Scope: web app (`src/`), Expo app (`apps/mobile/`), shared package, migrations, docs.
Method: read the canonical `GameType` union (49 types) and cross-checked it against every
per-game registry, then diffed web routes/features against mobile routes/features.

Baseline health, for context — all green:

| Check | Result |
|---|---|
| `vitest run` | 161 files passed, 1 skipped · 1926 tests passed, 16 skipped |
| `tsc --noEmit` (web) | clean |
| `eslint .` | 0 errors, 756 warnings (unused vars / `any` in tests) |
| `game-type-coverage.test.ts` | passing — landing slug, content, rules, validation, options all cover 49/49 |
| `game-view-registry.test.tsx` | passing — player + host views cover 49/49 |

The CI guards do their job: nothing is half-wired on the surfaces they cover. Everything
below is a surface **no guard watches**.

---

## 1. Bugs / correctness

### 1.1 🔴 The server-side turn ticker skips 7 turn-based games

`src/lib/game-tick.ts` is the always-on backstop whose own docstring says: *"if every
participant backgrounds their tab, a round/turn can sit expired for minutes."* It pokes
`/api/<slug>/expire-turn` for every active timed game.

18 games ship an `expire-turn` route. `TURN_EXPIRE_SLUG` lists 9 of them.

Missing, all of which have a **tokenless, deadline-gated** `expire-turn` route (i.e. exactly
what the ticker is designed to poke — no auth work needed):

| Game | Route |
|---|---|
| `ludo` | `src/app/api/ludo/expire-turn/route.ts` |
| `scrabble` | `src/app/api/scrabble/expire-turn/route.ts` |
| `uno` | `src/app/api/uno/expire-turn/route.ts` |
| `ayo` | `src/app/api/ayo/expire-turn/route.ts` |
| `mahjong` | `src/app/api/mahjong/expire-turn/route.ts` |
| `checkers_international` | `src/app/api/checkers-international/expire-turn/route.ts` |
| `checkers_nigeria` | `src/app/api/checkers-nigeria/expire-turn/route.ts` |

Effect: in those 7 games the turn clock only advances while some browser tab has the view
open and foregrounded. On mobile (app suspended) or with everyone backgrounded, a turn
stalls indefinitely. The inconsistency is sharpest in Checkers: plain `checkers` is
covered, its two variants are not — same UI, different failure mode.

Fix is 7 lines in `TURN_EXPIRE_SLUG`. Worth adding a test that asserts every
`src/app/api/*/expire-turn/` directory has a `TURN_EXPIRE_SLUG` entry (or an explicit
opt-out, as bingo and troll-run have for auth reasons).

### 1.2 🟠 `troll_run` has no server-side round driver either

`/api/troll-run/advance` exists and its docstring says *"Every client in the room polls this
so the round still ends if the host's tab is asleep"* — but it requires a host or player
token, so like bingo the ticker can't drive it, and `troll_run` is absent from
`ROUND_ADVANCE_SLUG` and `HANDLED_GAME_TYPES`. Same stall class as 1.1, needs a tokenless
system path (bingo solved this with a separate `sync` route).

### 1.3 🟠 Monopoly's landing/share OG image broke when the slug was renamed

`GAME_LANDING_OG_BY_SLUG` in `src/lib/seo.ts:379` is keyed by **landing slug**, and holds
`monopoly: '/og/monopoly.png'`. But `GAME_TYPE_TO_SLUG.monopoly === 'estate-kings'` (the
rename is asserted in `game-type-coverage.test.ts`). So `gameLandingOgPath('estate-kings')`
misses and falls back to the generic site image on `/games/estate-kings` and on every
Monopoly join link. `public/og/monopoly.png` exists and is now unreferenced.

Also missing OG entries (and files): `troll-run`, `wordle`, `daily-wordle`. `troll_run` is
the **first pinned game** in `PINNED_GAME_TYPES` — the flagship shares with a generic card.

Dead entry: `'ping-pong': '/og/ping-pong.png'` (`seo.ts:426`) — Ping Pong was retired in
`20261023120000_remove_ping_pong.sql` and the file does not exist. Only surviving code
reference to ping_pong; safe to delete.

There is no test guarding this map; one that asserts every landing slug resolves to a file
that exists in `public/og/` would have caught all four.

### 1.4 🟡 `mahjong/expire-turn` still uses raw `req.json()`

`src/app/api/mahjong/expire-turn/route.ts:9` — malformed body throws → 500 instead of 400.
The `parseJsonBody` migration in `docs/architecture-debt.md` reached 103 routes; this is one
of the ~15 stragglers.

### 1.5 🟡 Sitemap hardcodes the solo-game list

`src/app/sitemap.ts:70` declares `const SOLO_SLUGS = [...] as const` with a "kept in sync
with the route list" comment, while `SOLO_PLAY_INDEX` in `src/lib/solo-play.ts` is the
registry the footer already uses. Second copy, no test. Import the registry.

---

## 2. Missing on mobile (web has it, app does not)

### 2.1 🔴 Troll Run — the #1 pinned game — does not exist on mobile

`troll_run` is first in `PINNED_GAME_TYPES` (top of the web picker and `/games` grid) and is
the only one of the 49 game types with **no mobile player view and no entry in
`/api/mobile-config`**. Mobile covers 48/49.

### 2.2 🔴 Tournaments are entirely absent from the app

Web ships `/tournament`, `/tournament/create`, `/tournament/[code]`,
`/tournament/[code]/screen`, an `online-tournaments` landing page, a
`school-whot-championship` landing page, bracket/head-to-head/knockout engines, tournament
push reminders and CSV export. `apps/mobile` has **three** matches for the string
"tournament" — a code comment, a `ViewerModeBanner` union member, and `tournament_id` inside
a select string. No screen, no deep link in `lib/game-links.ts`. A player sent a tournament
link has no in-app path.

### 2.3 🔴 Persistent Rooms are absent from the app

Same shape: web has `/rooms`, `/room/[code]`, `RoomLobby` with presence/broadcast, room
points, room timezones, scheduled games, RSVPs. Mobile has no rooms screen and no room deep
link. The footer markets Rooms as a headline feature.

### 2.4 🟠 Solo "practice vs bot" is nearly unreachable on mobile

Six solo screens exist (`apps/mobile/app/play-solo/*.tsx`) but the **only** navigation to
them is `CreateWizardShell.tsx:323` — you must start creating a game and pick one of those
six types first. There is no `/play-solo` hub screen and no home-screen entry, where web has
a hub page, a footer index and CTAs on each game landing page.

### 2.5 🟠 Ten games have never had a mobile parity pass

`docs/mobile-web-parity-plan.md` audited **39** game types. There are now **49**. Never
audited game-by-game against their web implementation:

`uno` · `checkers_international` · `checkers_nigeria` · `crossword` · `word_search` ·
`word_scramble` · `landmine` · `word_grouping` · `wordle_room` · `troll_run`

Each has a mobile view, so nothing is obviously broken — but the earlier audit found 353
gaps across 39 games (16 critical), so "has a view" is not evidence of parity.

### 2.6 🟡 The mobile game list is maintained twice, with no test

`src/app/api/mobile-config/route.ts` hand-writes `BATCH_1..BATCH_12` as string literals;
`apps/mobile/components/games/GameRouter.tsx` builds `MOBILE_SUPPORTED_GAMES` from the
shared `batch-*-games.ts` modules. The two agree today (48 games each), but drift has
already started — the route has a `BATCH_11_GAMES` the client has no counterpart for. The
route is the server-driven kill switch, so a drift here ships a game to a client that can't
render it. Import the shared batches, or add a test asserting the two sets match.

### 2.7 🟠 Account settings are split across three places on mobile, and two are missing — ✅ **fixed**

Web has one **`/profile` → Settings** tab (`src/components/profile/SettingsTab.tsx`) holding
everything: **Display name** (edit + save), **Preferences** (Voice chat default, Dark mode) and
**Account** (signed-in state + Sign out / Switch account).

Mobile has no Settings tab on `/profile` at all — that screen is trophy case + per-game stats,
and its own header comment says so: *"Identity management (sign in, edit handle, sign out) lives
in the ProfileChip sheet on Home."* What exists is scattered and incomplete:

| Web `/profile` → Settings | Mobile |
|---|---|
| Display name (edit + save) | **Missing.** `updateProfile({ handle })` exists but is only reachable from `DailyNamePrompt`, and only when your name is auto-generated |
| Voice chat default (`default_voice_on`) | **Missing entirely** — zero references anywhere in `apps/mobile` |
| Dark mode | ✅ `SettingsSheet` (⚙ gear) |
| Sound effects | ✅ `SettingsSheet` — web has this in the in-game gear instead |
| Notifications | ✅ `SettingsSheet` |
| Sign out / Switch account | Present but **hidden and mislabelled** — `signOutIdentity()` behind *"Not you? Switch"* in the Home `ProfileChip` sheet, not in settings |

So a mobile player cannot change their display name outside one narrow daily-challenge prompt,
cannot set the voice-chat default at all, and has to find sign-out on a Home-screen chip.

Related, and the same root cause: mobile's ⚙ gear opens only the global `SettingsSheet`
(Appearance / Sound / Notifications). Web's in-game gear also carries a per-game
`playerSettingsNode` — rename, leave game, and game-specific controls — registered via
`useRegisterGameSettings`. See the systemic finding in
[mobile-web-parity-plan.md](./mobile-web-parity-plan.md#second-pass--the-ten-games-this-audit-never-covered-2026-08).

✅ **Fixed.** `apps/mobile/components/profile/AccountSettingsSection.tsx` gives `/profile` a
Settings section mirroring web's tab — display name, voice-chat default, sign out — and
`lib/profile-api.ts` gained `updateProfileSettings` for `/api/profile/settings`. Signing IN
(email + OTP) stays in the Home ProfileChip; device preferences stay in the ⚙ sheet, matching
how web splits account state from per-install state.

**And a bug it uncovered:** `updateProfile` read `data.profile` from `/api/profile/me` PATCH,
which answers `{ handle }`. It therefore returned `null` on every SUCCESSFUL rename, so the one
place mobile let you change your name (`DailyNamePrompt`) popped *"Could not save name — please
try again"* after a rename that had actually gone through. Replaced with `updateProfileHandle`,
which reads the real response shape and returns the saved handle or an error message.

### 2.8 ⚪ Also web-only, likely deliberate but worth an explicit decision

`/history` · `/library` + `/library/submit` · `/collections` · `/blog` · `/updates` ·
`/faq` · `/feedback` · `/contact` · `/u/[username]` public profiles · `/leaderboard/community`.
Note `/privacy` and `/terms` have one weak reference in the app — worth confirming the
store-required links are present.

---

## 3. Missing features / half-shipped plans

### 3.1 🟠 Bots-in-room stopped at Phase 2

`docs/bots-in-room-plan.md` Phase 3 lists Ayo, Crazy Eights, UNO (described as "nearly free
— adapters over the existing solo bot logic"), plus Ludo and Yahtzee. `BOT_TICK_SLUG` in
`game-tick.ts` contains exactly `{ whot, monopoly }`.

The solo bots for all five already exist (`src/lib/{ayo,crazy-eights,uno,ludo,yahtzee}-bot.ts`)
and the adapter pattern is proven twice (`whot-bot-adapter.ts`, `monopoly-bot-adapter.ts`).
This is the highest-value/lowest-cost item in the audit: "add a bot" is currently invisible
in 47 of 49 games.

### 3.2 🟠 Quick Draw and Troll Run have no trophies

`src/lib/trophies/game-facts/` and `system-trophies/` cover 31 games — every competitive
game except these two. `troll_run` even has a winner resolver in `outcome.ts:260`, so games
finish and award `games_played` but can never unlock anything game-specific. Both are
prominent: Quick Draw is pinned, Troll Run is pinned first.

### 3.3 🟠 18 games show "post to community leaderboard" with no board to post to

`PostWinToCommunity` is rendered by 33 game folders. Only 15 game types have a
`community_games` row created by a migration (3 from the base starter list, 12 added by
their own migrations). The other 18 hit the `not_on_leaderboard` path and silently don't
appear:

`bingo` · `checkers` · `checkers_international` · `checkers_nigeria` · `chess` · `codewords` ·
`crazy_eights` · `describe_it` · `i_call_on` · `ludo` · `matching_pairs` · `monopoly` ·
`snake_and_ladder` · `sudoku` · `tic_tac_toe` · `two_truths` · `word_hunt` · `yahtzee`

Boards are admin-creatable at `/admin/community`, so production may have some of these — but
README states the migrations are the complete schema definition, so a fresh project is
missing 18 boards. `docs/new-game-checklist.md` §7 lists the migration as a required step;
it was skipped for these.

### 3.4 🟡 Streaks are computed but never shown

`docs/feature-backlog.md`: `profiles.current_streak` / `longest_streak` advance in the award
pass and streak trophies are earnable, but there is no streak UI on web or mobile, no
freeze/grace mechanic and no reminder. The engine is built; the player-facing half is not.

---

## 4. SEO / discovery gaps

### 4.1 🟠 Six indexable, footer-linked sections are missing from the sitemap

`src/app/sitemap.ts` emits static pages, `/games/*`, `/play-solo/*`, `/daily-challenges/*`,
the 24 marketing landings and blog posts. It omits these, all crawlable (not in
`ROBOTS_DISALLOW`) and all carrying real metadata:

| Route | Status |
|---|---|
| `/tournament` | footer-linked, not in sitemap |
| `/rooms` | footer-linked, full metadata, not in sitemap |
| `/leaderboard` (+ `/daily`, `/trophies`, `/community`) | footer-linked, canonical + OG set, not in sitemap |
| `/library` | footer-linked, not in sitemap |
| `/browse` | full metadata, not in sitemap, not in footer |
| `/collections` + `/collections/[slug]` | breadcrumb JSON-LD, `force-dynamic`, not in sitemap **or** footer |

`scripts/submit-indexnow.mjs` derives its URL list from the live sitemap, so these are never
submitted to IndexNow either. `/collections/[slug]` is the biggest loss — admin-managed
themed packs built for search, with structured data, that search engines are only told about
via one un-sitemapped hub.

---

## 5. Documentation drift

### 5.1 🟡 README describes a much smaller, older product

- Says **"30+ game modes"**; there are **49**.
- The game list omits ~16 shipped games: Match Up/UNO, Mafia, Quiplash, Quick Draw,
  Matching Pairs, Word Rush, Ayo, Crossword, Word Search, Word Scramble, Landmine,
  Word Grouping, Wordle Room, Troll Run, International Draughts, Nigerian Checkers.
- The **mobile app does not appear anywhere** in the README — no mention of `apps/mobile`,
  Expo, EAS, or the `pnpm mobile` script that the root `package.json` defines.
- Also unmentioned: daily challenges, trophies/achievements, persistent rooms, tournaments
  (listed only as an aside), public game browse, the question library, collections, the
  blog, push notifications, solo-vs-bot mode and bots-in-room.

---

## Status

Everything except the four items below was fixed in the two commits that followed this audit;
each fix ships with a CI guard, since every one of these was a surface no test watched.

| Fixed | Where |
|---|---|
| 1.1 turn ticker (7 games) | `TURN_EXPIRE_SLUG` + `expire-turn-coverage.test.ts` |
| 1.2 Troll Run round driver | new tokenless `/api/troll-run/sync` |
| 1.3 OG art | rekeyed to `estate-kings`; Troll Run / Wordle / Daily Wordle cards rendered; `seo-og.test.ts` |
| 1.4 mahjong `parseJsonBody` | `src/app/api/mahjong/expire-turn/route.ts` |
| 1.5 sitemap solo list | now reads `SOLO_PLAY_INDEX` |
| 2.4 mobile solo hub | `apps/mobile/app/play-solo/index.tsx` + home entry |
| 2.6 mobile-config drift | `mobile-config.test.ts` |
| 3.2 Quick Draw trophies | facts builder + 17 system trophies (Troll Run still open) |
| 3.3 community boards | `20261026120000_community_games_backfill.sql` + `community-games-coverage.test.ts` |
| 4.1 sitemap sections | `src/app/sitemap.ts` + `sitemap.test.ts` |
| 5.1 README | rewritten against the real 49-game surface |

Also found and fixed while doing the above — none of it visible from the audit's own checks:

- **`apps/mobile` had drifted to 13 type errors** because mobile typecheck was not a CI job.
  Among them, `lib/game-rules.ts` was missing Wordle and Troll Run (a broken in-lobby Rules
  link for two shipped games) and still pointed Estate Kings at its pre-rename slug; the Whot
  and Crazy Eights session types had lost the `updated_at` their realtime delta fast-path
  orders on, and the mobile selects weren't fetching it either, so that ordering guard was
  inert. Fixed, plus a **Type Check (mobile)** CI job and `mobile-slug-parity.test.ts`.
- **606 of 649 system trophies had no seed migration** — they reached a database only via the
  admin "Seed launch trophies" button, so a project built from the migrations alone could
  never award them. `20261028120000_system_trophies_backfill.sql` seeds and reconciles the
  whole catalog; `system-trophy-seed-parity.test.ts` guards it. This also surfaced live drift:
  the Wordle set's sort orders were renumbered in code by `20261018122000` while the
  already-seeded rows kept their old values, so that trophy list rendered in the wrong order.

**Still open** (deliberately out of scope for those commits):

- **2.1 / 2.2 / 2.3** — Troll Run, tournaments and rooms on mobile. Large feature ports.
- **2.5** — ✅ **done.** The second-pass audit is in
  [mobile-web-parity-plan.md](./mobile-web-parity-plan.md#second-pass--the-ten-games-this-audit-never-covered-2026-08).
  Outcome: the newer ten are far closer to parity than the original 39 (they inherit the shared
  shells that landed in Phase 0–2), leaving three systemic gaps and one real per-game gap
  (UNO series scoring is fetched but never rendered). Building those fixes is still open.
- **3.1** — bots-in-room Phase 3 (Ayo, Crazy Eights, UNO, Ludo, Five Dice).
- **3.2, partly** — Troll Run still has no trophies.
- **3.4** — streaks are computed and never shown.

## Suggested order

1. `TURN_EXPIRE_SLUG` + a directory-coverage test (1.1) — smallest diff, worst symptom.
2. OG map fixes + a file-existence test (1.3).
3. Sitemap additions (4.1) — pure upside for an SEO-heavy product.
4. Community leaderboard seed migration for the 18 games (3.3).
5. Bots-in-room Phase 3 for Ayo / Crazy Eights / UNO (3.1) — adapters already exist.
6. Trophies for Quick Draw and Troll Run (3.2).
7. Troll Run mobile view (2.1), then decide explicitly on tournaments/rooms for mobile
   (2.2, 2.3).
8. README rewrite (5.1).
