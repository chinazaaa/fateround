# New game checklist

Use this when adding a **new game type** to FateRound. Most games share the
same shell — lobby, join, spectators, ready-up, play again, finished screen,
community leaderboard — and bugs usually come from wiring only half of it.

> ⚠️ **Don't forget the mobile app.** This checklist covers the **web** app
> (`src/…`) only. A new game type also has to be wired into the Expo app under
> `apps/mobile/`, which has its own registries and player views. **Ship both, or
> the game is invisible / broken on mobile.** See
> **[mobile-game-checklist.md](./mobile-game-checklist.md)**.

**Best full reference today:** **Quiplash** (`src/components/quiplash/`,
`src/lib/quiplash.ts`). Copy its shape for any lobby-based, multi-player,
round/phase game.

**CI guardrail:** `src/lib/game-type-coverage.test.ts` fails if landing content,
rules, validation, or `GAME_TYPE_OPTIONS` drift from `GAME_TYPE_CONFIG`. Run
`pnpm test` before opening a PR.

---

## 0. Pick an archetype

| Archetype | Examples | Late join as player? | Lobby ready-up? |
|-----------|----------|----------------------|-----------------|
| **Round / phase game** | Quiplash, Trivia, Word Hunt, Two Truths | Usually yes (`viewers_and_players`) | Yes |
| **Board / turn game** | Chess, Ludo, Monopoly | Usually watch-only | Yes |
| **Poll / hot-seat** | Smash or Pass, Most Likely To | Varies | Often no lobby |
| **Team / role game** | Codewords, Describe It | Yes + extra flags | Yes |

Not every row below applies to every archetype — skip what your game doesn't
have, but **explicitly decide** spectators, late join, and max players.

---

## 1. Registration & data model

### Types & config
- [ ] Add to `GameType` union — `src/types/index.ts`
- [ ] `GAME_TYPE_CONFIG` entry (label, tagline, card, slots) — `src/lib/game-types.ts`
- [ ] `parseGameType()` branch — `src/lib/game-types.ts`
- [ ] `isMyGameGame()` predicate — `src/lib/game-types.ts`
- [ ] `gameHowItWorks()` blurb (create flow) — `src/lib/game-types.ts`
- [ ] `NAME_ONLY_PLAYER_JOIN_GAMES` / `LOBBY_GAMES` flags — `src/lib/game-types.ts`
- [ ] Update `src/lib/game-flags.test.ts` if those sets change
- [ ] `gameTypeEnum` in validation — `src/lib/validation/shared.ts`
- [ ] Game-specific DB types (session row, answers, metadata on `Round`, etc.) — `src/types/index.ts`

### Player limits
- [ ] `MIN / MAX / DEFAULT` constants — `src/lib/<game>.ts`
- [ ] Register in `LOBBY_LIMIT_GAME_TYPES` + `GAME_LIMIT_CODE_DEFAULTS` — `src/lib/game-limits.ts`
- [ ] `resolveMaxPlayers()` on create — `src/app/api/games/route.ts`

### Supabase migration
- [ ] Extend `games_game_type_check` (+ `app_feedback_game_type_check` if present)
- [ ] Seed `game_player_limits` row
- [ ] Game tables, indexes, RLS, realtime publication
- [ ] Round metadata column if prompts/phases live on `rounds`

### View registration
- [ ] `HOST_VIEW_REGISTRY` — `src/components/game-host-views.ts`
- [ ] `PLAYER_VIEW_REGISTRY` — `src/components/game-player-views.ts`

---

## 2. Host UI

### Lobby (before start)
- [ ] **Lobby settings panel** — dedicated file under `src/components/host-lobby/`
  (Quiplash, Word Hunt) *or* inline in host view (Bingo) *or* manage tab
  (Trivia, Codewords)
- [ ] Settings to expose (as applicable):
  - [ ] Max players
  - [ ] Round count / timer(s)
  - [ ] **Late join policy** — `HostAllowViewersField` / `HostLateJoinSettingsCard`
  - [ ] Custom content pool (Trivia, Quiplash prompts)
- [ ] PATCH handler — `src/app/api/games/[code]/lobby-settings/route.ts`
- [ ] Enforce max when lowering cap (“remove someone first”) — same route

### Start game
- [ ] `startGame()` → `POST /api/games/[code]/start`
- [ ] Min-player validation in start route
- [ ] Bootstrap session / first round in start route

### During game
- [ ] `useGameTableSync` on all tables the UI reads
- [ ] `HostModeSelector` if host can play or spectate
- [ ] `HostRulesRow` → `/games/<slug>#rules` (see §5)
- [ ] `HostEndGameButton` if host can end early
- [ ] **`HostLobbyWaitingFooter` with `game={game}`** — enables public/private toggle
  (see §6). Board games put visibility in `HostBoardGameLobbyPanel` instead.

### Remove players
- [ ] `useHostRemovePlayer()` → `DELETE /api/players`
- [ ] Wire `onRemovePlayer` in `HostLobbyPlayersSection`

### Finished screen (host)
- [ ] Final standings + share block
- [ ] `HostGameFinishedActions` with:
  - [ ] **Play again · same settings** (`same_settings: true`)
  - [ ] **Return to lobby** (`same_settings: false`) — host can tweak settings
- [ ] `PostWinToCommunity` if host plays and can win (gate on “did I win?”)

### Play again / return to lobby
- [ ] `POST /api/games/[code]/play-again`
- [ ] Register session clearer in `SESSION_CLEARERS` — same route
- [ ] Implement `clearMyGameSessionData()` — `src/lib/<game>.ts`
- [ ] `resetSpectatorsForLobby()` so replay requires ready-up — `src/lib/viewers.ts`

### Replay ready ring (lobby reopens after play again)
- [ ] Host: `ReplayReadyRing` when `game.replay_pending` / `replay_open`
- [ ] `useLobbyOpenNotification` for “lobby is open” chime

**Reference:** `QuiplashHostView.tsx`, `HostQuiplashLobbyPanel.tsx`

---

## 3. Player UI

### Screen machine
Typical screens: `loading` → `join` | `late_join_choice` | `game_started_waiting`
→ `lobby` → `playing` → (finished via game status or active round)

- [ ] `preJoinScreen()` — `src/lib/viewers.ts`
- [ ] `useGameViewBootstrap` with `computeScreen` — pattern in `QuiplashPlayerView.tsx`
- [ ] `GameStartedWaiting` when game started but late join closed
- [ ] `GameEndedScreen` when game is `finished` and you never joined

### Join
- [ ] `NameJoinForm` for name-only games
- [ ] `LateJoinChoice` when `gameOffersLateJoinChoice()` — **join as viewer vs player**
- [ ] `joinAsViewer` passed to `POST /api/players` — `src/app/api/players/route.ts`
- [ ] Seat cap on join-as-player — same route (`lobbyMaxPlayersFromGame`)

### Lobby / ready-up
- [ ] `GameLobbyWaitingPanel` with `onReady` → `POST /api/players/ready`
- [ ] **`onReadyError={toastError}`** — surfaces “game is full” etc.
  (`GameLobbyWaitingPanel.tsx` swallows errors without this)
- [ ] `GameRulesLink` in lobby
- [ ] `PlayerSessionControls` (rename / leave)

### Replay lobby
- [ ] `ReplayReadyRing` for players when `game.replay_pending`
- [ ] `toggleReplayReady()` → `/api/players/ready`

### Active play
- [ ] `*ActiveRound.tsx` — phases, timers, submit actions
- [ ] `useGameTableSync` + polling fallback
- [ ] Phase advance hook if server-driven (`useQuiplashAdvance`, `useAdvancePolling`)

**Reference:** `QuiplashPlayerView.tsx`, `QuiplashActiveRound.tsx`

---

## 4. Spectators, viewers & late join

This is the area most often half-wired. Treat it as a **checklist within the
checklist**.

### Policy (`src/lib/viewers.ts`)
- [ ] `defaultLateJoinPolicyForGameType()` — default for create flow
- [ ] `gameOffersLateJoinChoice()` — if join screen offers watch vs play
- [ ] `gameAllowsLatePlayerJoin()` — `false` for board games that lock rosters
- [ ] `allowLateJoin()` / `allowLatePlayers()` — runtime gates
- [ ] `spectatorOnJoin()` — marks `spectator: true` when joining as viewer
- [ ] `playerIsViewer()` — used everywhere for read-only mode
- [ ] `canSwitchViewerToPlayer()` — mid-game promote; pass `players` + check
  `lobbyHasOpenPlayerSeat()` so full games hide “Join as player”
- [ ] `fetchLateJoinContext()` case — `src/lib/late-join-context.ts` (status
  line + detail copy for `LateJoinChoice`)

### Host settings UI
- [ ] `LateJoinPolicyToggle` on create — `src/app/create/page.tsx`
- [ ] `HostAllowViewersField` / `HostLateJoinSettingsCard` on host manage/lobby

### API: block spectator actions
- [ ] Every mutating route checks `player.spectator` or `playerIsViewer()`
- [ ] **`POST /api/players/promote`** — `assertLobbyPlayerSeatAvailable()` (same
  cap as ready-up; promote used to bypass this)

### Player UI: read-only mode
Pass `readOnly={isViewer}` (or equivalent) into the active round and branch:

| Phase | Spectator / contestant should… |
|-------|--------------------------------|
| **Writing** | See prompt; **no** textarea / submit (`writing_watch`) |
| **Voting** | See answers; **no** vote buttons if spectator or contestant in battle |
| **Waiting** | See leaderboard + status; clear “watching” copy |

- [ ] `ViewerModeBanner` when `playerIsViewer()` — promote button only when
  `canSwitchViewerToPlayer(player, game, players)`
- [ ] Banner copy when game is full (no seats left)

### What spectators should see (decide explicitly)
Document in code comments if non-obvious. Quiplash pattern:
- Spectators see **all** answers during voting watch
- Active players see **other** answers (not their own) until reveal
- Everyone sees battles, reveals, leaderboard

**Reference:** `roundAnswersVisibleToPlayer()`, `canPlayerVoteInBattle()` in
`src/lib/quiplash.ts`

---

## 5. Public marketing pages (`/games`, SEO, rules)

These are **game-type** pages (how Quiplash works in general), not individual
room codes. They are mostly data-driven — wire the content once and the routes
appear automatically.

### `/games` — all games index
- [ ] Game appears in `GAME_TYPE_OPTIONS` — `src/lib/game-types.ts`
- [ ] `GAME_LANDING_CONTENT[gameType]` exists — `src/lib/game-landing.ts`
- [ ] Page builds from `GAME_TYPE_DISPLAY_ORDER` — `src/app/games/page.tsx`
- [ ] Optional: add to `PINNED_GAME_TYPES` (top of grid) or
  `HOMEPAGE_FEATURED_GAMES` (home page “Popular games”) — `src/lib/game-types.ts`

### `/games/<slug>` — per-game landing page
Auto-generated when slug + content exist (`generateStaticParams` uses
`ALL_GAME_LANDING_SLUGS`).

- [ ] `GAME_TYPE_TO_SLUG[gameType]` — e.g. `quiplash: 'quiplash'` —
  `src/lib/game-landing.ts`
- [ ] `GAME_LANDING_CONTENT[gameType]` — `landing()` call with:
  - [ ] `seoTitle`, `seoDescription`, `keywords`
  - [ ] `heroSubtitle`, `highlights`, `features`, `steps`, `perfectFor`
  - [ ] `rules` is wired automatically from `GAME_LANDING_RULES[gameType]`
- [ ] Optional `bodyParagraph` for extra SEO copy
- [ ] Optional `extraFaqs` for landing-page FAQ block
- [ ] Optional OG image — `public/og/<slug>.png` (used by `gameLandingOgPath` in
  `src/lib/seo.ts`)
- [ ] “Play free” CTA links to `/create?type=<gameTypeCreateParam>`

### Game rules (public + in-lobby link)
Two surfaces, **one source of truth**:

| Surface | URL / component | Data |
|---------|-----------------|------|
| Public rules section | `/games/<slug>#rules` | `GAME_LANDING_RULES` |
| In-game link | `GameRulesLink` in lobby | `gameRulesHref()` → same `#rules` anchor |

- [ ] `GAME_LANDING_RULES[gameType]` — `src/lib/game-landing-rules.ts`
  - Objective, how it works, tips
  - Max players, timers, spectator/late-join behaviour
  - Edge cases (ties, solo round, battle caps)
- [ ] `GameRulesLink gameType="…"` in player lobby — `QuiplashPlayerView`
- [ ] `HostRulesRow gameType="…"` on host manage/lobby

Update rules when you change caps, phases, or spectator behaviour — the public
page and lobby link stay in sync.

### SEO & discovery
- [ ] Sitemap entry — automatic via `ALL_GAME_LANDING_SLUGS` in
  `src/app/sitemap.ts` (`/games/<slug>`, priority 0.85)
- [ ] `llms.txt` lists all games — `src/app/llms.txt/route.ts` (uses
  `GAME_TYPE_DISPLAY_ORDER`)
- [ ] `game-type-coverage.test.ts` asserts slug + content + rules exist
- [ ] Site nav/footer link to `/games` — `MarketingHeader`, `SiteFooter`

**Reference:** Quiplash entries in `game-landing.ts`, `game-landing-rules.ts`,
live page at `/games/quiplash`.

---

## 6. Public vs private lobbies (Browse)

This is **per game instance** (a specific room code), separate from the
marketing pages above.

| Setting | Meaning |
|---------|---------|
| **Public** (`is_public: true`) | Listed on `/browse` for anyone to find and join |
| **Private** (`is_public: false`, default) | Invite-only via share link / code |

### Create flow
- [ ] Host picks Public or Private on `/create` — `settings.isPublic` in
  `src/app/create/page.tsx` (`src/app/create/types.ts`)
- [ ] Passed to `POST /api/games` as `isPublic` → stored as `games.is_public` —
  `src/app/api/games/route.ts`

### Host lobby (change after create)
- [ ] **`HostVisibilityToggle`** — `src/components/host-lobby/HostVisibilityToggle.tsx`
  - Label: “Public game — list in Browse…”
  - PATCH `is_public` via `PATCH /api/games/[code]` (also editable live during
    active games — `LIVE_EDITABLE_SETTING_KEYS` in same route)
- [ ] Surface the toggle in host lobby:
  - **Most lobby games:** pass `game={game}` to `HostLobbyWaitingFooter` (includes
    toggle) — `QuiplashHostView`
  - **Board games:** toggle inside `HostBoardGameLobbyPanel` (don’t duplicate in
    footer)
  - **Manage-panel games:** e.g. Trivia/Codewords host manage tab
- [ ] Optional: also accept `is_public` in `lobby-settings` route for games that
  PATCH settings there — `src/app/api/games/[code]/lobby-settings/route.ts`

### Browse page
- [ ] No per-game code needed — `GET /api/games` filters `.eq('is_public', true)`
- [ ] UI: `src/app/browse/page.tsx` → `BrowseGamesPage`

Private games are never listed; players need the direct `/game/<code>` link.

---

## 7. Community leaderboard

- [ ] Migration: `INSERT INTO community_games (...)` with matching `game_type`
- [ ] `PostWinToCommunity` on finished screen — **winner only** (gate `iWon`)
- [ ] `roundKey={game.session_started_at}` for per-play dedup (stable; don’t mix
  with session row ids that can shift on load)
- [ ] Confirm message: “Added to the community leaderboard” + link to `/leaderboard`
- [ ] Server dedup: `POST /api/community/post-win` (409 = already posted)

Role-based games (Codewords): achievement keys via `src/lib/community-achievements.ts`

**Reference:** `QuiplashFinishedResults.tsx`, `PostWinToCommunity.tsx`

---

## 8. API routes & advance logic

### Typical layout
```
src/app/api/<game>/answer|vote|submit/route.ts   # player actions
src/app/api/<game>/advance/route.ts              # phase transitions (if needed)
src/lib/<game>.ts                                # pure logic, scoring
src/lib/<game>-advance.ts                        # server advance + markGameFinished
src/lib/validation/round-games.ts                # Zod schemas
src/lib/supabase-selects.ts                      # *_SELECT constants
src/hooks/use<Game>Advance.ts                    # client advance polling
```

### Every action route should
- [ ] `assertPlayer()` auth — `src/lib/game-admin.ts`
- [ ] Reject spectators
- [ ] Validate phase / timer server-side (don’t trust client)
- [ ] Return `{ error: string }` with sensible status codes

### Advance / end game
- [ ] `markGameFinished()` when complete — `src/lib/game-admin.ts`
- [ ] Set session `phase: 'finished'` if UI keys off it
- [ ] Client: nudge advance when countdown hits zero (don’t wait only for poll)

**Reference:** Quiplash (`quiplash-advance.ts`), Trivia, Word Hunt (timer expiry)

---

## 9. Error handling & edge cases

| Scenario | Where | What to do |
|----------|-------|------------|
| Ready when full | `assertLobbyPlayerSeatAvailable` — `game-limits.ts` | 400 + toast via `onReadyError` |
| Promote when full | `players/promote/route.ts` | Same seat check |
| Join as player when full | `players/route.ts` | “This game is full” |
| Start with too few players | `games/[code]/start/route.ts` | Min-player message |
| Lower max in lobby | `lobby-settings/route.ts` | “Remove someone first” |
| Session expired | Player views | `toastError` on missing `resumeToken` |

- [ ] Never let API errors be silent `unhandledRejection` on ready/promote/join
- [ ] Host start button `startDisabledHint` when below min players

---

## 10. Finished screen & sharing

- [ ] Score tally helper — `tallyMyGameScores()` in `src/lib/<game>.ts`
- [ ] `FinishedWinnerHero` + `PaginatedLeaderboard`
- [ ] `ShareResults` / share capture block
- [ ] Tie handling for `iWon` (top score match, not only `leaderboard[0].id`)
- [ ] Contested win gate where needed (`leaderboard.length > 1`, score > 0)

---

## 11. Create flow

- [ ] Game type on `/create` page — fields for your timers, rounds, max players
- [ ] **Public vs private** toggle (`isPublic`) — see §6
- [ ] Defaults from `DEFAULT_*` constants
- [ ] Late join policy default from `defaultLateJoinPolicyForGameType()`
- [ ] `participant_mode: 'joiners'` for lobby games — `src/app/create/page.tsx`
- [ ] `POST /api/games` creates row + initial rounds if needed

---

## 12. Tests

- [ ] `src/lib/<game>.test.ts` — scoring, pairing, phase helpers, visibility rules
- [ ] `game-type-coverage.test.ts` passes (automatic)
- [ ] `game-flags.test.ts` if join/lobby flags changed

---

## 13. Lessons from Quiplash (common misses)

These were all found in playtesting — use as a final sanity pass:

1. **Spectator writing** — hide input; show `writing_watch` screen
2. **Spectator voting** — no vote buttons; `voting_watch` with clear copy
3. **Contestants can’t vote on own battle** — separate from spectator case
4. **Late join choice** — add game to `gameOffersLateJoinChoice()`
5. **Promote bypasses max players** — enforce in `promote` route + hide banner button
6. **`onReadyError`** on `GameLobbyWaitingPanel` — or “game is full” is silent
7. **Community leaderboard** — migration + `PostWinToCommunity` + stable `roundKey`
8. **Lobby settings** — max players / timers editable before start
9. **Game rules page** — update `GAME_LANDING_RULES` for caps, spectators, battles
10. **Public pages** — slug, landing content, rules; verify `/games/<slug>` loads
11. **Public/private lobby** — `HostLobbyWaitingFooter` passes `game` for visibility toggle
12. **Copy** — avoid jargon (“match” → “battle”); explain what watchers see

---

## Minimum file touch list (dedicated round game)

```
src/types/index.ts
src/lib/game-types.ts
src/lib/<game>.ts
src/lib/<game>-advance.ts
src/lib/game-limits.ts
src/lib/validation/shared.ts
src/lib/validation/round-games.ts
src/lib/game-landing-rules.ts
src/lib/game-landing.ts
src/lib/supabase-selects.ts
src/lib/viewers.ts                    # late join + spectator policy
src/lib/late-join-context.ts
src/lib/game-flags.test.ts
src/components/game-host-views.ts
src/components/game-player-views.ts
src/components/<game>/*HostView.tsx
src/components/<game>/*PlayerView.tsx
src/components/<game>/*ActiveRound.tsx
src/components/<game>/*FinishedResults.tsx
src/components/host-lobby/Host*LobbyPanel.tsx
src/hooks/use<Game>Advance.ts
src/app/api/<game>/*
src/app/api/games/route.ts
src/app/api/games/[code]/start/route.ts
src/app/api/games/[code]/play-again/route.ts
src/app/api/games/[code]/lobby-settings/route.ts
src/app/create/page.tsx
src/app/games/page.tsx                 # auto-lists if content exists
src/app/games/[slug]/page.tsx          # auto-generates from slug
src/app/sitemap.ts
public/og/<slug>.png                   # optional
src/components/host-lobby/HostLobbyWaitingFooter.tsx   # public/private toggle
supabase/migrations/*_<game>.sql
supabase/migrations/*_<game>_community_leaderboard.sql
```

---

## Quick “which game to copy?”

| Area | Copy from |
|------|-----------|
| Full lobby round game | **Quiplash** |
| Phased advance + polling | Quiplash, Trivia |
| Timed single round | Word Hunt |
| Host calls / player marks | Bingo |
| Teams + roles | Codewords |
| Manage tab (no lobby panel file) | Trivia |
| Board game (no late players) | Chess, Ludo |

---

When in doubt, grep for an existing game’s pattern:

```bash
rg 'isQuiplashGame|Quiplash' src --files-with-matches
rg 'PostWinToCommunity' src/components
rg 'gameOffersLateJoinChoice' src
rg 'onReadyError' src/components
rg 'ViewerModeBanner' src/components
rg 'GAME_LANDING_CONTENT' src/lib/game-landing.ts
rg 'GAME_LANDING_RULES' src/lib/game-landing-rules.ts
rg 'HostVisibilityToggle|is_public' src
```
