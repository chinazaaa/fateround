# New game checklist

Use this when adding a **new game type** to Fate Round. Most games share the
same shell — lobby, join, spectators, ready-up, play again, finished screen,
community leaderboard — and bugs usually come from wiring only half of it.

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
- [ ] `HostRulesRow` → `/games/<slug>#rules`
- [ ] `HostEndGameButton` if host can end early

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

## 5. Game rules & marketing pages

Players expect **View game rules** in lobby to match actual behaviour.

- [ ] `GAME_LANDING_RULES[gameType]` — `src/lib/game-landing-rules.ts`
  - Objective, how it works, tips
  - Max players, timers, spectator/late-join behaviour if relevant
  - Edge cases (ties, solo round, battle caps)
- [ ] `GAME_LANDING_CONTENT[gameType]` — `src/lib/game-landing.ts` (SEO, hero, steps)
- [ ] `GAME_TYPE_TO_SLUG` entry
- [ ] Optional OG image — `public/og/<slug>.png`

Update rules when you change caps, phases, or spectator behaviour.

---

## 6. Community leaderboard

- [ ] Migration: `INSERT INTO community_games (...)` with matching `game_type`
- [ ] `PostWinToCommunity` on finished screen — **winner only** (gate `iWon`)
- [ ] `roundKey={game.session_started_at}` for per-play dedup (stable; don’t mix
  with session row ids that can shift on load)
- [ ] Confirm message: “Added to the community leaderboard” + link to `/leaderboard`
- [ ] Server dedup: `POST /api/community/post-win` (409 = already posted)

Role-based games (Codewords): achievement keys via `src/lib/community-achievements.ts`

**Reference:** `QuiplashFinishedResults.tsx`, `PostWinToCommunity.tsx`

---

## 7. API routes & advance logic

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

## 8. Error handling & edge cases

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

## 9. Finished screen & sharing

- [ ] Score tally helper — `tallyMyGameScores()` in `src/lib/<game>.ts`
- [ ] `FinishedWinnerHero` + `PaginatedLeaderboard`
- [ ] `ShareResults` / share capture block
- [ ] Tie handling for `iWon` (top score match, not only `leaderboard[0].id`)
- [ ] Contested win gate where needed (`leaderboard.length > 1`, score > 0)

---

## 10. Create flow

- [ ] Game type on `/create` page — fields for your timers, rounds, max players
- [ ] Defaults from `DEFAULT_*` constants
- [ ] Late join policy default from `defaultLateJoinPolicyForGameType()`
- [ ] `POST /api/games` creates row + initial rounds if needed

---

## 11. Tests

- [ ] `src/lib/<game>.test.ts` — scoring, pairing, phase helpers, visibility rules
- [ ] `game-type-coverage.test.ts` passes (automatic)
- [ ] `game-flags.test.ts` if join/lobby flags changed

---

## 12. Lessons from Quiplash (common misses)

These were all found in playtesting — use as a final sanity pass:

1. **Spectator writing** — hide input; show `writing_watch` screen
2. **Spectator voting** — no vote buttons; `voting_watch` with clear copy
3. **Contestants can’t vote on own battle** — separate from spectator case
4. **Late join choice** — add game to `gameOffersLateJoinChoice()`
5. **Promote bypasses max players** — enforce in `promote` route + hide banner button
6. **`onReadyError`** on `GameLobbyWaitingPanel` — or “game is full” is silent
7. **Community leaderboard** — migration + `PostWinToCommunity` + stable `roundKey`
8. **Lobby settings** — max players / timers editable before start
9. **Game rules page** — update for 3–6 players, battle caps, spectators
10. **Copy** — avoid jargon (“match” → “battle”); explain what watchers see

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
```
