# Platform Features — Master Plan (Batched Rollout)

Status: **Consolidation doc — the single guide to sequence the identity/retention features.**
Last consolidated: **2026-07-17**

> **Why this doc exists.** Accounts, trophies, streaks, the Daily Challenge, per-game high-score
> leaderboards, and Clubs each live in their own spec today. That's great for depth but bad for
> *sequencing* — it's not obvious what to build first, what blocks what, or how much of each is
> web vs mobile. This document folds all of them into **one batched roadmap** so you can ship in
> order without re-reading five files. It does **not** replace the source specs — it points to
> them. When you build a batch, open the linked source doc for the full detail.
>
> **Revenue is intentionally out of scope here** (per decision). Cosmetics/Pro hooks are noted only
> where a feature *creates the surface* a future purchase sits on, so we don't design ourselves into
> a corner. The money spec stays in [`revenue-model.md`](./revenue-model.md).

---

## Source docs this consolidates

| System | Source doc | Role |
|---|---|---|
| Accounts / tiers / Clubs philosophy | [`account-tiers.md`](./account-tiers.md) | Guest ⊂ Account ⊂ Pro, signup prompts, Clubs definition |
| Trophies + Streaks mechanics + **the identity/auth foundation** | [`trophies-and-streaks.md`](./trophies-and-streaks.md) | Data model, award engine, streak rules, login flow |
| Trophy content (606 trophies, 32 games) | [`trophy-catalog.md`](./trophy-catalog.md) | Seed list for the catalog |
| Daily Challenge + per-game high-score leaderboards | [`high-scores-leaderboards-plan.md`](./high-scores-leaderboards-plan.md) | 4 boards, daily puzzle, scoring |
| Clubs (persistent teams) | [`clubs-spec.md`](./clubs-spec.md) | Full build spec — data model, roles, seasons |
| Revenue guardrails (context only) | [`revenue-model.md`](./revenue-model.md) | What we *don't* sell |

---

## The one thing to understand first: everything sits on a single identity

Read this before picking a batch. **Four of the five systems here need the same thing and the same
thing only: a persistent identity per player.** Today the app has no memory of who a player is — a
name typed into one game, forgotten when it ends. The fix is defined once, in
[`trophies-and-streaks.md`](./trophies-and-streaks.md) §2, and reused everywhere:

- **Anonymous-first.** The client calls `supabase.auth.signInAnonymously()` at the **first
  finished game** — every player who actually plays gets a real `profiles.id` from game one, with
  no sign-up screen and zero friction.
  > Superseded 2026-07-31: this used to say "on first play", which read as page load or lobby
  > join. Anonymous sign-ins are rate-limited to **30/hour per IP**, and a NAT'd classroom or a
  > 20-person party shares one IP — so spectators, abandoned lobbies and people who merely opened
  > a link must not consume that budget. Nothing is worth persisting until a game completes
  > anyway, since trophies and streak days are both awarded on the finish path. See
  > [`accounts-and-identity-plan.md`](./accounts-and-identity-plan.md) §2.2, which is canonical
  > for *when* identity is created.
- **Email + 6-digit code upgrades that same identity in place** (not a magic link — the code stays
  in the playing tab and works cross-device). Login == signup, one door, never labelled "Sign up."
- **Nothing is ever gated behind login to *play*.** The only nudge is *after* earned value
  ("Nice score — save it so you don't lose it").

**This is Batch 1, and it is the hard dependency for Trophies, Streaks, Daily/Leaderboards, and
Clubs.** Build it once; everything else is additive on top. This is also why your instinct —
"Batch 1 = accounts" — is exactly right.

```
                 ┌─────────────────────────────────────────┐
   Batch 1  →    │  Identity & Accounts (profiles + auth)   │   ← blocks everything below
                 └─────────────────────────────────────────┘
                    │          │            │            │
        ┌───────────┘   ┌──────┘     ┌──────┘      ┌─────┘
        ▼               ▼            ▼             ▼
   Batch 2         Batch 3      Batch 4        Batch 5
   Streaks         Trophies     Daily +        Clubs
   (daily habit)   (mastery)    Leaderboards   (community)
                                (needs the daily
                                 puzzle, which also
                                 feeds Batch 2's streak)
```

---

## Cross-cutting reality: "web + mobile" means THREE codebases, not two

This is the single biggest thing the individual specs undercount. The trophy and leaderboard docs
were written "mobile-first web / responsive" — but this repo ships a **native Expo app**
(`apps/mobile`), not a responsive website. Per the codebase, mobile is **not just a view**: types,
game engines, `isXGame` guards, and the `*_SELECT` strings are **duplicated** in
`packages/shared/src` *and* `apps/mobile` (they are not re-exported). So every backend-touching
feature in this plan is really **three units of work**:

| Layer | What changes | Notes |
|---|---|---|
| **1. Shared / backend** | Supabase migrations, RLS, award/scoring logic, API routes | Column grants must be **column-level** `GRANT SELECT` to anon/authenticated or reads throw `42501`. Migrations use `YYYYMMDDHHMMSS_` prefix. |
| **2. Web UI** | Next.js screens under `src/` | Game themes live in `globals.css` under `[data-game-theme]` with light+dark. |
| **3. Native mobile UI** | Expo/React Native screens under `apps/mobile` | Runtime theming via `useThemedStyles`/`useTheme` (never module-scope `theme`). New games/columns may need the shared-package copy updated too. Push is native, not web-push. |

**Every batch below lists all three explicitly.** Treat "done on web" as ~60% done, not done.

**Design-change note.** Each batch introduces new surfaces (a profile chip, a streak flame, trophy
screens, a Daily card, a leaderboard, club screens). On **web** they follow the Claude Design
system rollout; on **mobile** they follow the mobile header/text conventions and runtime theming.
Neither is free — budget design time per batch, both platforms.

---

# The batches

Each batch: **what it is → what unlocks it → the three-layer work → design surfaces → done-when.**
Sub-letters (3a/3b/3c) are shippable increments inside a batch.

---

## Batch 1 — Identity & Accounts  *(the foundation)*

**Source:** [`trophies-and-streaks.md`](./trophies-and-streaks.md) §2, §5 · [`account-tiers.md`](./account-tiers.md)

**What it is.** A persistent identity per player and the one-door email login that saves it. This
is *only* accounts/identity — no trophies or streaks logic yet, just the `profiles` row, anon auth,
email upgrade, and the profile screen shell.

**Unlocked by:** nothing. Start here.

**Shared / backend**
- Migration: `profiles` table (`id` → `auth.users`, `handle`, `avatar_url`, `is_anonymous`, plus the
  trophy/streak counter columns so later batches don't re-migrate the same table), and `player_stats`
  (`profile_id`+`game_type` PK). Keys off `auth.uid()`.
- Anonymous auth: client `signInAnonymously()` on first play.
- API routes: `POST /api/profile/anon`, `POST /api/auth/request-code`, `POST /api/auth/verify-code`,
  `GET /api/profile/me`. OTP via Supabase Auth (`signInWithOtp`) + **custom SMTP via Resend**.
- Case-A upgrade (guest → new account) via `updateUser({ email })` — same `auth.uid()`, nothing lost.
- RLS: owner reads own row; public reads a **narrow view** (handle + level + streak only, no PII).
  Follow [`rls-hardening.md`](./rls-hardening.md).
- **Defer to Batch 3c:** Case-B merge (`mergeProfiles`, `profile_merges` table) — only needed once a
  player can log into an account that exists on another device *and already has trophies*.

**Web UI**
- Profile "chip" button (corner): guest shows `Guest` → opens email+code dialog; logged-in shows
  handle + avatar → opens `/profile`. `auth/EmailCodeDialog.tsx`, `ProfileButton.tsx`.
- `/profile` overview shell (`profile/ProfileOverview.tsx`) — populated further in Batch 3.
- Signup prompts wired to **moment-of-value only** (post-win, post-Daily), never at lobby join.

**Native mobile UI**
- Same profile chip + email-code screen + profile screen, built natively (Expo).
- The mid-game OTP-**code** choice (vs magic link) exists specifically so mobile players can save
  without leaving the game.

**Profile-backed defaults — stop re-asking logged-in players (key payoff of signing up)**
- Today the **join flow asks a guest to type a name every single time** (and re-pick avatar). For a
  logged-in account that's pointless friction — the profile already has it. **Logged-in = we read
  name + avatar (+ saved preferences) from the profile and skip the ask**: one-tap "Join as
  *Chinaza*" (with a small "not you? change" affordance). Guests still get the name field; accounts
  don't.
- Applies anywhere we currently re-prompt per session. Audit these entry points and switch each to
  *use-profile-if-logged-in, ask-only-if-guest*:
  - **Join a room by code** — the display name field (the main one you noticed).
  - **Host / create a room** — host display name (already partly handled via the
    `host-play-intent` / create-screen host-name work — wire it to the profile once accounts exist).
  - **Play-as-yourself toggle on the host lobby** — prefill the host's saved name/avatar.
  - **Avatar / player photo**, **voice on/off preference**, **preferred theme** — read from profile.
- Implementation shape: a single `getPlayerIdentity()` that returns `{ name, avatarUrl, prefs }` from
  the profile when `!is_anonymous`, else falls back to the typed-name flow. One source of truth so we
  don't sprinkle "if logged in" checks across every game's join screen. Store reusable prefs on
  `profiles` (e.g. `default_voice_on bool`, `preferred_theme text`) — cheap columns added with this
  batch's migration.
- Guest still overrides freely (type a different name for one game); logged-in override is one tap
  and does **not** rewrite the profile unless they choose "save as default."

**Design surfaces:** profile chip (both platforms), email→code dialog, profile overview shell,
**the "Join as *You*" one-tap join state** replacing the name field for logged-in users (web + mobile).

**Done when:** any player has a stable `profiles.id` from first play, can save it with an email code,
and switching devices/logging in preserves it — **and a logged-in player joins/hosts without re-typing
their name or re-picking their avatar.** Guest-history claim / anon-retention window = **90 days**
(unified — see decision #7).

---

## Batch 2 — Streaks  *(the daily-return habit)*

**Source:** [`trophies-and-streaks.md`](./trophies-and-streaks.md) §4

**What it is.** One general (Duolingo-style) daily streak per account, kept alive by playing *any*
game today (or the Daily Challenge once Batch 4 lands). Small, fast, high-retention — good second
batch because it's cheap on top of Batch 1.

**Unlocked by:** Batch 1.

**Shared / backend**
- Streak columns already added on `profiles` in Batch 1 (`current_streak`, `longest_streak`,
  `last_active_date`, `streak_freezes`).
- Streak update logic (`src/lib/streak.ts`) in the finish path; increments when
  `activity_date == last_active_date + 1`, flat same-day, else break (minus a freeze).
- **WAT day boundary** — reuse `src/lib/room-timezones.ts` so streak, Daily, and leaderboards agree
  on when "today" flips.
- Freeze economics: auto-consume one per missed day; earn ~1 per 7 consecutive days, cap ~2 (tunable).

**Web UI**
- Flame counter in the profile chip (`🔥 12`); streak state on `/profile`; a gentle streak nudge.

**Native mobile UI**
- Same flame + streak state natively. Cross-session **push** nudge ("your 🔥 breaks tonight") —
  note the existing push infra is **per-game/`game_id`** and must be **re-scoped to `profile_id`**
  to fire between sessions (see §8 of the trophies doc). That re-scope is shared work counted here.

**Design surfaces:** flame counter, streak milestone moment, streak-break nudge (web + push).

**Done when:** playing on consecutive WAT days grows the streak, a missed day consumes a freeze or
breaks it, and the count shows on the profile chip both platforms. Milestone trophies (7/30/100)
are authored in Batch 3.

---

## Batch 3 — Trophies  *(per-game mastery + collection)*

**Source:** [`trophies-and-streaks.md`](./trophies-and-streaks.md) (mechanics) ·
[`trophy-catalog.md`](./trophy-catalog.md) (606-trophy seed content)

**What it is.** PlayStation-style per-game Bronze/Silver/Gold/Platinum trophies with rarity and an
aggregate Trophy Level. The biggest batch — split into three shippable increments.

**Unlocked by:** Batch 1 (and pairs naturally after Batch 2 so streak-milestone trophies exist).

### Batch 3a — Engine + first catalog (invisible plumbing + first unlocks)
**Shared / backend**
- Migrations: `trophies` (catalog), `player_trophies`, `player_distinct`, `awarded_sessions`,
  `trophy_rarity`. All key off `auth.uid()`/`profile_id`.
- Award engine as a **library** (`src/lib/trophies/award.ts`), invoked inside the existing finish
  path `src/app/api/games/[code]/finish-game/route.ts`, wrapped in a `security definer` RPC
  `award_for_session(...)` for atomicity. Idempotent via `awarded_sessions`.
- Criteria DSL: `counter`, `event`, `distinct`, `streak`, `platinum` (§3.10).
- Catalog registry `src/lib/trophies/catalog.ts` seeds `trophies` (idempotent upsert on `id`); DB row
  becomes source of truth after seed. **Seed the 5 deepest games + the Platform set first —
  decided: Whot, Trivia, Monopoly, Scrabble, Chess** (games that can each carry ~25–30 trophies via
  laddered win counters + event trophies; mix of most-played and richest event surface). Bench for
  the next wave: Yahtzee, Ludo, Checkers.
- Anti-spoof: gate competitive "win N" trophies behind a server-side **min real-player count** (§3.9).
- **Rollout rule from the catalog doc:** ship Bronze/Silver *counter* trophies first where the
  `event.*` signal isn't wired yet; add the Gold *event* trophy when the emitting event lands.

**Web UI:** trophy unlock toast (`TrophyUnlockToast.tsx`, reuse `AchievementsShareBlock` styling).
**Native mobile UI:** native unlock toast in the finish flow.

### Batch 3b — The four profile/trophy screens (the visible collection)
Four PSN-modeled screens, **built on both web and native mobile**:
1. `/profile` overview — level medallion + progress ring, tier totals, per-game completion bars.
2. `/profile/game/:gameType` — per-game summary + rarest-earned + full trophy list.
3. All-trophies list (within #2) — earned/locked/hidden states, Platinum pinned top.
4. Single-trophy detail modal — art, rarity pyramid, plain-English progress.
- Two reusable SVGs to design: `LevelMedallion`, `RarityPyramid`.
- Weighted completion % and measurable/binary progress from day one.

### Batch 3c — Full catalog + rarity + merge + admin
**Shared / backend**
- Expand catalog to **all 32 games** + Completionist/Explorer platform trophies (606 total, 34
  Platinums).
- Rarity computation (`trophy_rarity`, refreshed hourly, never live). Hidden-trophy server-side
  redaction. Trophy Level curve polish (`level = floor(sqrt(points/100)) + 1`, tunable).
- **Case-B merge** now lands (`mergeProfiles`, `profile_merges`) — "merge, never overwrite."
- Admin CRUD `/api/admin/trophies` + `src/app/admin/trophies/page.tsx` (guardrails: Platinum
  engine-managed, criteria edits forward-only, soft-delete only).

**Design surfaces:** four screens ×2 platforms, unlock toast ×2, level medallion + rarity pyramid
SVGs, admin trophy manager (web only).

**Done when (3a):** finishing a game awards the right trophies once, server-side. **(3b):** players
can browse their collection on both platforms. **(3c):** all 32 games have ladders, rarity shows,
merges are safe, and you can tune the catalog without a deploy.

---

## Batch 4 — Daily Challenge + Per-Game High-Score Leaderboards

**Source:** [`high-scores-leaderboards-plan.md`](./high-scores-leaderboards-plan.md)

**What it is.** The "best high score" leaderboards you described — per game, **separate from the
community leaderboard**. The prerequisite idea is the **Daily Challenge**: once a day, per game,
*everyone in the world gets the exact same puzzle*, so results are finally comparable. Four boards
sit on top: **Personal Best · Daily Global · All-Time · Weekly** (weekly is optional / last).

**Two ranking axes — score *and* best time.** Not every game ranks by points. Puzzle-completion
games (Sudoku, Crossword, Word Search) rank by **fastest time** (`Sudoku — best time 1:23`,
lower-is-better); accumulate-points games (Word Hunt) rank by **score**. Each game declares a
**primary metric**; both are tracked and shown on the Personal Best card, so "New personal best!"
(score) and "New record time!" (time) are both celebration moments. `personal_bests` caches
`best_score` and `best_time_ms`; best time only counts a full valid completion so a fast partial
solve can't fake a record. Detail in [`high-scores-leaderboards-plan.md`](./high-scores-leaderboards-plan.md)
Parts 2–3 and 6.

**Unlocked by:** Batch 1 (identity). Pairs with Batch 2 — **the Daily Challenge is also the daily
action that keeps a streak alive**, so one feature feeds two systems. Do this after streaks exist so
that link is live.

**Scope of games (not all games):**
- **Launch (all four boards) — the whole puzzle family:** Sudoku, Word Hunt, Word Search,
  Crossword, Word Scramble. All five already give each player a score on a puzzle and keep the
  answer key server-side (Word Scramble via `/api/word-scramble/solution`), so they slot in together.
- **Later:** Word Rush, Yahtzee (solo), Trivia, Quick Draw, Matching Pairs.
- **Not for:** turn-based/party/win-lose games (chess, whot, monopoly, etc.) — their competitive
  layer is trophies + tournaments, not a high-score board.

**Shared / backend**
- Migrations: `daily_challenges` (one puzzle per game per WAT day, **no answer key in it**),
  `daily_scores` (one scored attempt per player per daily — PK `(challenge_id, profile_id)` enforces
  "one attempt/day"), `personal_bests` (cached, rebuildable).
- **Answer key stays server-side** (existing `*_solutions` RLS pattern) — the phone never sees it.
- Deterministic puzzle from `hash(game_type + date)` so every device gets the identical board.
- **Server computes the official score** (phone's number is cosmetic) via a shared module
  `packages/shared/src/scoring/daily.ts` — but run authoritatively server-side. Normalised shape:
  `solved + speed_bonus − hint/wrong penalty`. All weights in one shared place so web+mobile agree.
- Reuse the finish path + WAT date logic; write the daily score in the **same transaction that
  awards trophies**.
- The four boards are just four queries over `daily_scores`/`personal_bests`.

**Web UI**
- Daily Challenge card on home (today's game(s), your streak, played/not-yet).
- Result screen: score, today's rank, **"New personal best!"** moment, peek at top of today's board.
- Leaderboard screen with tabs **Today · All-time · Weekly**, per game, own row highlighted.
- Personal best on the profile/game screen.

**Native mobile UI**
- Same three surfaces natively; reuse the mobile ShareCard pattern for shareable results. Remember
  the shared scoring module must have its **mobile copy** in sync (parallel-copies rule).

**Design surfaces:** Daily card, result/celebration screen, tabbed leaderboard — all ×2 platforms.

**Done when:** each launch game has one shared daily puzzle, a server-scored one-attempt-per-day
result, a personal-best celebration, and Daily Global + All-Time boards (Weekly optional after).

---

## Batch 5 — Clubs  *(persistent teams / community off WhatsApp)*

**Source:** **Full spec now written → [`clubs-spec.md`](./clubs-spec.md)** (data model, roles,
invites, teams, seasons, RLS, three-codebase breakdown, build order). Philosophy in
[`account-tiers.md`](./account-tiers.md) §Clubs.

**What it is.** Named groups with a crest and roster for recurring crews: pre-set teams for
Codewords/Describe It/team Trivia/Bingo, a club leaderboard + seasons, club game history. Free up to
**20 members**; monetize crests/seasons *later* (retention first). Club tournaments/leagues are
deferred past v1.

**Unlocked by:** Batch 1 (identity) and ideally after Batch 3/4 so there are trophies/scores worth
aggregating into a club leaderboard.

**Shared / backend:** `clubs`, `club_members` (owner/admin/member roles), `club_invites`,
`club_games`, `club_teams` + `club_team_members`, `club_seasons` (see [`clubs-spec.md`](./clubs-spec.md)
§3). Club leaderboard is a **query** over existing wins/trophy/daily-score data, not a new table.
Member-only RLS; invites validated server-side; column-level grants on every readable column.

**Web + native mobile UI:** club home (roster/leaderboard/history), create/edit + crest picker
(emoji+colour in v1), invite sheet, join page (deep-linked on mobile), "Play as \<Club\>" +
team-preset picker wired into the host lobby, season board + champion moment. Both platforms.

**Build order (inside Batch 5):** core club+roster+invites → play-as-a-club + history → club
leaderboard → pre-set teams → seasons. Details in [`clubs-spec.md`](./clubs-spec.md) §10.

**Done when:** a crew can create a club (≤20), hold a persistent roster, play "as the club," see a
club leaderboard + history, and load pre-set teams into a supported game. (Cosmetic crests/seasons +
club tournaments = later, out of scope here.)

---

## Recommended sequence (one line)

**1 Accounts → 2 Streaks → 3a Trophy engine → 3b Trophy screens → 4 Daily + Leaderboards →
3c Full trophy catalog/rarity/merge/admin → 5 Clubs.**

Rationale: 1 unblocks all. 2 is cheap retention. 3a/3b give visible reward fast on the top games.
4 delivers the Daily (which also strengthens the streak) before you spend the long tail on 3c's
full 606-trophy catalog. Clubs last because it's the least-specced and benefits from having
trophies/scores to aggregate. You can reorder 4 and 3c freely — they're independent.

---

## Open decisions to settle before building (collected from the source docs)

All resolved with **recommended defaults** (2026-07-17) — reversible, override anytime.

| # | Decision | ✅ Resolution (recommended default) | Source |
|---|---|---|---|
| 1 | First 5 trophy games | **Whot, Trivia, Monopoly, Scrabble, Chess** (depth-first, ~25–30 trophies each). Bench: Yahtzee, Ludo, Checkers | trophies §10 |
| 2 | Daily launch set | **Whole puzzle family**: Sudoku, Word Hunt, Word Search, Crossword, Word Scramble | high-scores Part 9 |
| 3 | Handle uniqueness | **Free, non-unique display names** now (identity = internal `profiles.id`); optional unique `@username` only if friends/mentions ship later; disambiguate duplicate names on boards with avatar + tiny suffix | trophies §10 |
| 4 | Freeze economics + Level curve | **Freezes:** earn 1 per 7-day streak, hold max 2, auto-consume 1 per missed day, base free forever. **Level curve:** keep `floor(sqrt(points/100)) + 1` | trophies §10 |
| 5 | Min players for competitive trophies | **Per-game floor, not a flat 3.** Default 3 real players for party games; **2 for inherently 2-player games** (chess, checkers, tic-tac-toe). Guests count; guard is against solo/bot farming | trophies §3.9 |
| 6 | Guests on the global board | **Yes** — auto-generated handle, nudged to claim after a good result (moment-of-value hook; keeps boards populated) | high-scores Part 9 |
| 7 | Anonymous retention window | **90 days of inactivity, then prune.** Unify the 30-day guest-history claim window in `account-tiers.md` up to 90 so there's one number | trophies §10 |
| 8 | Clubs full spec | **Written** → [`clubs-spec.md`](./clubs-spec.md) (data model, roles, invites, seasons) | this doc |
| 9 | Trophy thresholds / event signals | **Default win-ladder 1 / 10 / 25 / 50 / 100** as the standard convention (adjust outliers only); ship counter trophies first, wire `event.*` per game as signals land (already locked) | trophy-catalog §7 |
| 10 | One scored attempt per Daily | **Yes, one attempt/day counts** (practice after is unranked) | high-scores Part 9 |
| 11 | Daily score-formula weights | **Start at completion 70% / speed 20% / −penalty 10% on a 0–1000 scale**, tune from real play data | high-scores Part 5 |
| 12 | Host-streak semantics | **Hosting feeds the same account streak** (play *or* host today keeps 🔥); host-cadence trophies use their own counter, not a second streak | trophy-catalog §7 |

---

## What is deliberately NOT in this plan

- **Revenue** (FateRound+, Club Pro, Schools, Corporate — subscription tiers) — [`revenue-model.md`](./revenue-model.md).
  Referenced only where a feature creates a future purchase surface (frames, crests, extra freezes,
  podium art). Build the free/earned layer first; monetize around it later, never on trophies/streaks.
- **Tournaments** — already shipped; trophies/leaderboards reference them but don't rebuild them.
- **Schools / education (B2B)** — a separate, parked GTM track, thesis in
  [`schools-education-market.md`](./schools-education-market.md). Wedge = **individual play on the
  school's own devices** (computer lab / tablets) — which the product already does — for Trivia +
  word/puzzle games; whole-class no-device mode is a *later* add-on, not the opener. Rides on Clubs +
  Tournaments + anonymous identity, so it comes *after* this base exists. Recommended pricing: a flat
  **banded whole-school license** (never per-student, never per-game), per-teacher entry, one-off
  competition fees. Two cheap "insurance" decisions to make now: (1) make content **curatable /
  scopable** (a `school_safe`-style audience tag), and (2) put monetization prompts behind a
  suppressible **"managed mode"** flag — so a school edition is later a config, not a rebuild.
