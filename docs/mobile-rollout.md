# Mobile rollout — status & roadmap

Living doc for the React Native / Expo app in `apps/mobile/`.  
**Branch:** `feat/mobile-shell` (work largely uncommitted as of Jul 2026).

---

## TL;DR

| Area | Status |
|------|--------|
| **Game types with a native player screen** | **40 / 40** (Batches 1–9) |
| **Production-ready mobile UX** | **No** — functional MVPs only |
| **Host / create / lobby polish** | **Batch 11 MVP** — host lobby + web create link |
| **Session shell (Batch 10)** | **Done** — header menu, rules links, keyboard forms, native create |
| **Lifecycle & finish UX (Batch 12)** | **Done** — finish scoreboards, play-again flow, import claim join |
| **Push notifications** | **Core done (Batch 13)** — Expo tokens, turn/game/round push; EAS project ID needed for device tokens |
| **Game UI polish (Batch 15 P0)** | **Core done** — poll/trivia/bingo timers, results, bingo claim, poll photos |
| **Web fallback** | Still used when `mobile-config` disables a type or no view is registered |

Batches 1–9 were about **coverage**: every game type can open a native screen and perform core player actions.  
**Batches 10+** should be **shell, host, polish, and notifications** before calling the app store-ready.

---

## Architecture (current)

```
apps/mobile/          Expo app (join → game screen)
packages/shared/      Types + pure game helpers (@fateround/shared)
src/                  Web app + API routes (unchanged)
```

- Join/resume via `resumeToken` in `expo-secure-store`
- Realtime via Supabase (`useGameTableSync`, game row subscriptions)
- Server flags: `GET /api/mobile-config` (`mobileSupportedGames`, `forceWebFallbackFor`)
- Game registration: `apps/mobile/components/games/GameRouter.tsx`

---

## What's done

### Phase 0 — Shell (foundation)

- [x] Home screen: join by game code only (`app/index.tsx`)
- [x] Game route: load game → `GameRouter` or `WebFallbackScreen` (`app/game/[code].tsx`)
- [x] `JoinScreen`, minimal `LobbyView`, minimal `GameChrome` (loading / not found / shell / turn banner / basic finished panel)
- [x] `useGameViewBootstrap` + `useGameTableSync`
- [x] `packages/shared` extracted from web types/libs
- [x] `eas.json` scaffold, env example, `npm run mobile` from repo root
- [x] Host token **storage** helpers (`getHostToken` / `setHostToken`) — **no host UI yet**

### Batches 1–9 — Native **player** views (40 games)

All types in `GameType` are registered in `MOBILE_SUPPORTED_GAMES` and `mobile-config`.

| Batch | Games | Count | Notes |
|-------|--------|-------|--------|
| **1** | ayo, tic_tac_toe, checkers, bingo, trivia | 5 | First native screens |
| **2** | would_you_rather, this_or_that, never_have_i_ever, most_likely_to, who_said_this, smash_marry_kill, smash_or_pass, red_flag_green_flag, pick_a_number, parent_approval | 10 | Shared `PollPlayerView` |
| **3** | matching_pairs, sudoku, yahtzee, snake_and_ladder, ludo | 5 | |
| **4** | crazy_eights, whot, two_truths, describe_it | 4 | |
| **5** | quiplash, word_rush, word_hunt, i_call_on | 4 | |
| **6** | chess, scrabble | 2 | |
| **7** | mafia, codewords | 2 | Mafia uses API state; codewords uses Supabase + API |
| **8** | monopoly, mahjong, quick_draw | 3 | Monopoly/Mahjong phase MVPs; Quick Draw **guess** mode only (Drawful → web message) |
| **9** | secret_message, hot_seat, custom, anonymous_messages | 4 | Auto-join for inbox games |

**Cumulative: 40 games.**

### Batch 10 — Session & navigation shell ✅

- [x] `PlayerSessionShell` on every game screen (code, share, host link, back)
- [x] Leave + rename + resume card (`PlayerSessionControls`, `patchPlayerName`, `leaveGame`)
- [x] Recent games on home; web create link
- [x] Toast provider; safe-area on game shell (top + bottom)
- [x] All player views use `usePlayerSessionActions` + `bootstrap={bootstrap}` on `GameShell`
- [x] Rules / how-to-play links from game screens
- [x] ⋮ overflow menu (leave, rename) in session header
- [x] Native create (`/create`) — title + game type, stores host token, routes to host lobby
- [x] Web create link retained for advanced setup (participants, custom questions)

### Batch 11 — Create & host (MVP)

- [x] `HostLobbyScreen` + `/host/[code]` with deep-link host token capture
- [x] `POST /api/games/[code]/start` from mobile
- [ ] Native create flow (still web)

### Batch 12 — Lifecycle & finish UX ✅

- [x] Shared `@fateround/shared/viewers` (late join, spectator, pre-join screen logic)
- [x] `PlayerPreJoinGate` in `GameRouter`: `GameEndedScreen`, `GameStartedWaitingScreen`, `LateJoinChoiceScreen`
- [x] `ViewerModeBanner` + `POST /api/players/promote` (spectator → player)
- [x] `ReplayReadyRing` in `LobbyView` when `replay_pending` (`postPlayerReady`)
- [x] `GameFinishedScreen` / enhanced `FinishedPanel` (leaderboard rows)
- [x] Wired lifecycle via `bootstrap={bootstrap}` on all player `GameShell`s + rich lobby everywhere
- [x] Removed stale “native screen coming in a later batch” lobby copy
- [x] `GameFinishPanel` + `PlayAgainFooter` on all native player views (scoreboards + “waiting for host” on finish)
- [x] Per-game finish leaderboards (trivia, yahtzee, party/score games, board winners, MLT vote tally)
- [x] Host play-again: `postPlayAgain` on `HostLobbyScreen` → players see ready ring → host starts next round
- [x] Import claim join: `@fateround/shared/participant-mode`, `ParticipantClaimJoinScreen` (poll + hot seat)

### Shared package exports (high level)

`batch-*-games`, game libs (`ayo`, `poll-games`, `chess`, `mafia`, `monopoly-board`, `mahjong`, `quick-draw-guess`, `anonymous-messages`, `hot-seat`, `custom-game`, …), **`viewers`**, **`participant-mode`**, **`game-type-checks`**, **`game-limits-lite`**.

### API wrappers (`apps/mobile/lib/game-api.ts`)

POST helpers for moves/votes/actions per game; GET for mahjong state, hot-seat results; anonymous message send; etc.

---

## What's **not** done (known gaps)

These are why the app still feels rough even with 40 game screens.

### App shell & session

- [x] **Leave game** — clears session, returns home
- [x] **Edit name** — inline rename in lobby
- [x] **Recent games** — resume list on home
- [x] **Share link / copy code** — share sheet from header + lobby + join
- [ ] **Create game** — native flow; web create link on home for now
- [ ] **Rules / how to play** — not linked from native screens yet
- [ ] **Global header menu** — basic header only (no ⋮ menu yet)

### Lobby & lifecycle (web parity)

- [x] Late join / viewer mode (`PlayerPreJoinGate`, `ViewerModeBanner`, promote)
- [x] Game started waiting / game ended pre-join screens
- [x] Replay ready ring (`ReplayReadyRing` + `postPlayerReady`)
- [x] Rich lobby (`LobbyView` ≈ `GameLobbyWaitingPanel`)
- [ ] **Participant claim** (import-mode polls, hot seat names) — partial
- [ ] **Rich finish screens per game** — Trivia has leaderboard; most games still minimal

### Notifications

- [x] **Push notifications** — Batch 13: Expo tokens, server turn/game/round push, foreground toasts
- [x] **In-app turn alerts** — `useTurnNotifications` on key turn-based / trivia views
- [ ] **Local reminders** — no turn timer vibration/sound

### Voice chat

**Web (done):** LiveKit-based room voice for players and hosts.

- **Token:** `POST /api/audio-token` (LiveKit credentials; identity + game room)
- **Presence:** `POST /api/audio-presence` (who is in the call — badge / nudge to join)
- **UI:**
  - Floating **“Join voice”** pill — `src/components/AudioChat.tsx` on most player/host game pages
  - Design-system **header rail** — `RoomVoiceRail` / `RoomVoiceBar` (e.g. Whot via `PlayerRoomShell`)
  - `gameHasHeaderVoice()` in `src/lib/game-types.ts` — games with inline rail skip the floating pill (avoid duplicate controls)
- **Gating:** Disabled for some contexts on web (e.g. tournament watch mode); see `src/app/game/[code]/page.tsx`
- **Product:** Listed as a core feature in `docs/account-tiers.md` (all tiers)

**Mobile (Batch 14 core done):** `@livekit/react-native` + fixed header `VoiceRail` in `PlayerSessionShell` / `HostLobbyScreen`.

- Reuses same token/presence APIs and room resolution as web
- v1 games: mafia, whot, describe_it, codewords, anonymous_messages (`gameHasMobileVoice`)
- Requires **Expo dev build** (native WebRTC — not Expo Go)
- Host identity: `useHostVoiceIdentity` (SecureStore)

**Launch candidates (expand next):** chess, monopoly, mafia-adjacent social types, then broader rollout.

### Per-game UI quality (player views)

Player views are **logic-first MVPs**, not design-complete:

- Minimal dark theme; per-game styling inconsistent
- Many board games show **actions/scores only** (monopoly, mahjong) — no full board/canvas
- **Quick Draw Drawful** (`lie` variant) — explicit web fallback, no canvas
- **Anonymous room** — text feed only; no GIFs, reactions, reply threading
- **Poll games** — single shared component; no photos, gender filters, or results animations
- **Complex games** (scrabble board, chess board, ludo board, etc.) — playable but visually sparse vs web

### Host mode

- [x] Host token storage + `/host/[code]` lobby (start game, share code, player roster)
- [ ] In-game host controls during active games (still web for most types)

### Testing & release

- [ ] Device QA matrix (iOS/Android, small/large phones)
- [ ] E2E smoke tests for join → play → finish
- [ ] App Store / Play Store listing, OTA strategy documented

---

## Proposed next batches

Prioritize **shell + host** before polishing every game board — otherwise each game team rebuilds the same missing chrome.

### Batch 10 — Session & navigation shell

**Goal:** Feel like an app, not a single full-screen game.

- Game shell wrapper: header (code, title, ⋮ menu)
- Leave game → `clearPlayerSession` + `router.replace('/')`
- Edit display name (`PATCH /api/players`)
- Copy/share game link
- Recent games on home (read from SecureStore history)
- Shared toast / error banner
- Safe-area + keyboard-avoiding defaults
- Remove stale copy in `LobbyView`

### Batch 11 — Create & host (MVP)

**Goal:** Host can run a night from the phone for common types.

- Create game: start with **5–8 high-traffic types** or “create on web, host on mobile” deep link
- Host token capture after web create (deep link `?hostToken=`) or native create response
- Generic **HostLobbyScreen**: player list, start button, copy link
- Wire `POST /api/games/[code]/start` and basic lobby settings where APIs exist
- Route: if `getHostToken(code)` → host stack, else player stack

### Batch 12 — Lifecycle & finish UX ✅

**Done (Jul 2026).** See “Batch 12” under What's done — finish scoreboards, play-again host + player flow, import claim join.

### Batch 13 — Push & local notifications (core ✅)

- [x] `expo-notifications` + permission flow on join (`GamePushSetup`)
- [x] `mobile_push_tokens` table + `POST /api/games/[code]/push/expo-subscribe|unsubscribe`
- [x] Server push via Expo API + existing web push (`src/lib/push.ts`, `src/lib/expo-push.ts`)
- [x] Turn notifications: ludo, tic-tac-toe, checkers, ayo (move + expire routes)
- [x] Round started: trivia advance (`round_started` event)
- [x] Game lifecycle push now includes native tokens (start / play-again / end)
- [x] Foreground in-app banner (`useTurnNotifications` + push received listener)
- [ ] Set real EAS `projectId` in `app.json` for physical-device push tokens
- [ ] Roll turn alerts into more game types (chess, whot, scrabble, …)
- [ ] Optional: settings toggle to disable notifications per game

### Batch 14 — Voice chat (core ✅)

- [x] `@livekit/react-native` + Expo config plugins (dev build required — not Expo Go)
- [x] Reuse `POST /api/audio-token`, `POST /api/audio-presence`, `GET /api/games/[code]/room`
- [x] `VoiceRail` in `PlayerSessionShell` + `HostLobbyScreen` (join / mute / leave / participant list)
- [x] Host voice identity via SecureStore (`useHostVoiceIdentity`)
- [x] Mic permission flow (iOS plist + Android runtime)
- [x] v1 games: mafia, whot, describe_it, codewords, anonymous_messages
- [ ] Expand voice to more game types
- [ ] Host+play stable display name sync (poll-based today)
- [ ] Background / phone-call interruption QA on device

### Batch 15+ — Game UI polish (ongoing)

Pick games by traffic / complexity, not all at once:

| Priority | Games | Work | Status |
|----------|--------|------|--------|
| P0 | Poll suite, trivia, bingo | Results UI, photos, timers | **Core done** — see below |
| P1 | Board/card (ludo, checkers, chess, crazy8, whot) | Boards, hands, animations | **Core done** — see below |
| P2 | Party (describe_it, quiplash, word_rush) | Team UX, score recap | **Core done** — see below |
| P3 | Heavy (monopoly, scrabble, mahjong, quick_draw lie) | Full boards / canvas | **Core done** — see below |

#### Batch 15 P0 (Jul 2026)

- [x] Shared `@fateround/shared/round-timing`, `vote-stats`, `bingo`; extended `trivia` helpers
- [x] Mobile `useRoundTimer`, `useDeadlineCountdown`, `useAdvancePolling`, `TimerBadge`
- [x] **Trivia:** `TriviaActiveRound` — per-question timer, locked/revealed states, correct-answer reveal, live leaderboard, advance polling
- [x] **Poll suite:** round timer badge, `PollRoundResults` between rounds, countdown to next/final, MLT avatars, lobby `ParticipantPhotoCard` (`expo-image-picker`)
- [x] **Bingo:** `BINGO!` claim (`postBingoClaim`), winner finish screen, latest-call highlight, `B-15` formatted numbers

#### Batch 15 P1 (Jul 2026)

- [x] Shared `@fateround/shared/checkers` legal-move helpers; `@fateround/shared/ludo-board-layout`
- [x] **Checkers:** `CheckersBoard` — disc pieces, legal-move dots, board flip, last-move highlight
- [x] **Ludo:** `LudoBoard` — 15×15 visual board, coloured tokens, destination highlights, tap-to-move
- [x] **Chess:** king-in-check square highlight (existing board + clocks retained)
- [x] **Crazy 8 / Whot:** `PlayingCardFace`, `WhotCardFace`, `WhotShapeIcon`, `CardTableArea`, `PlayerTurnRail`, turn `TimerBadge`

#### Batch 15 P2 (Jul 2026)

- [x] Shared party primitives: `TeamPickerGrid`, `TeamBadge`, `TeamScoreGrid`, `RoundBreakCard`, `PhaseStepper`, `ActivityFeed`, `useAbsoluteDeadline`
- [x] **Describe It:** live team/individual scoreboards, team roster picker, turn timer, break countdown, guess feed, team badge
- [x] **Word Rush:** live scores, team roster picker, letter-pair prompt display, intermission recap, recent-correct feed, turn timer
- [x] **Quiplash:** live leaderboard, Write/Vote/Results stepper, reveal recap with vote pts + top highlight, solo-round banner, next-round countdown

#### Batch 15 P3 (Jul 2026)

- [x] Shared `@fateround/shared/monopoly-board-layout` (11×11 grid, color hex, short labels)
- [x] **Monopoly:** `MonopolyBoardView` — visual board, token positions, property color bands, pending-space highlight, turn timer
- [x] **Scrabble:** `ScrabbleTile` wood-style rack/board tiles, responsive board grid, live leaderboard, turn deadline badge
- [x] **Mahjong:** `MahjongTableView` four-seat table + discard pond, `MahjongTileFace` colored tile faces, visual melds, turn timer
- [x] **Quick Draw (guess / lie):** team roster picker, live team/individual scoreboards, turn + break timers, guess activity feed (Drawful canvas remains web-only)

---

## How to enable / disable games remotely

`src/app/api/mobile-config/route.ts` returns `mobileSupportedGames`.  
Flip types off without an app store release if a native screen regresses.

Client check: `isGameMobileSupported()` in `apps/mobile/lib/api.ts`.

---

## Key files

| File | Purpose |
|------|---------|
| `apps/mobile/components/games/GameRouter.tsx` | View registry + batch lists |
| `apps/mobile/components/lifecycle/*` | Pre-join, replay ready, viewer banner |
| `apps/mobile/hooks/useGameViewBootstrap.ts` | Join, load, screen FSM |
| `apps/mobile/lib/native-games.ts` | Fallback list when config unavailable |
| `packages/shared/src/batch-*-games.ts` | Batch labels + game type arrays |
| `src/app/api/mobile-config/route.ts` | Server-side enable list |
| `src/components/AudioChat.tsx` | Web floating voice pill (LiveKit) |
| `src/components/rooms/RoomVoiceRail.tsx` | Web header voice rail |
| `src/app/api/audio-token/route.ts` | LiveKit token issuance |
| `src/app/api/audio-presence/route.ts` | Voice room presence |

---

## Honest readiness checklist

Use this before marketing “native app”:

- [ ] Host can create and start a game on device
- [ ] Player can join, play, see results, leave, rejoin
- [ ] No placeholder / “use web” copy on happy paths
- [ ] Turn notification for at least one async game
- [ ] Voice chat join/leave works on iOS + Android for at least one social game type
- [ ] Top 5 games visually acceptable on a phone
- [ ] TestFlight / internal track build signed off

**Current score:** ~2/6 (join + play core actions for most types).
