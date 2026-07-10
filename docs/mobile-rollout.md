# Mobile rollout — status & roadmap

Living doc for the React Native / Expo app in `apps/mobile/`.  
**Branch:** `feat/mobile-shell` (work largely uncommitted as of Jul 2026).

---

## TL;DR

| Area | Status |
|------|--------|
| **Game types with a native player screen** | **40 / 40** (Batches 1–9) |
| **Player E2E (join → play → finish)** | **39 / 40** — see exceptions below |
| **Production-ready mobile UX** | **No** — functional MVPs; Batch 15 polish done for priority games |
| **Host / create / lobby** | **Batch 11 MVP** — native create + host lobby; **no in-game host UI** |
| **Session shell (Batch 10)** | **Done** — header menu, rules links, keyboard forms, native create |
| **Lifecycle & finish UX (Batch 12)** | **Done** — finish scoreboards, play-again flow, import claim join |
| **Push notifications (Batch 13)** | **Done** — turn push for 13+ games, per-game mute, local haptics; EAS project ID deferred |
| **Voice chat (Batch 14)** | **Done** — 14 game types, rename sync, background disconnect; device QA with TestFlight |
| **Game UI polish (Batch 15)** | **P0–P3 core done** — poll/trivia/bingo, boards/cards, party UX, heavy games |
| **Web fallback** | Still used when `mobile-config` disables a type, advanced create setup, or Drawful canvas |

Batches 1–9 were about **coverage**: every game type can open a native screen and perform core player actions.  
Batches 10–15 added **shell, lifecycle, notifications, voice, and visual polish**.  
**Next priority:** in-game **host controls** + device QA before calling the app store-ready.

### Player E2E exceptions (Jul 2026)

| Case | Native player? | Notes |
|------|----------------|-------|
| **39 game types** | ✅ Full player flow | Join, lobby, play, finish, play-again waiting |
| **Quick Draw — Drawful (canvas)** | ⚠️ Cross-device | Guess mode is native; canvas uses `UnavailableFeaturePanel` (open same code elsewhere) |
| **`custom` game type** | ✅ Play | Create needs web slot builder |
| **Import-mode polls / hot seat** | ✅ Claim join | `ParticipantClaimJoinScreen`; host still adds names on web |
| **Host-driven mid-game** | ⚠️ Players OK | Trivia auto-advances from any client; bingo auto-call sync not ported to mobile |

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
- [x] Host token storage helpers (`getHostToken` / `setHostToken`)

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
| **8** | monopoly, mahjong, quick_draw | 3 | Quick Draw **guess** mode native; **Drawful canvas → web**. Boards polished in Batch 15 P3 |
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

### Batch 11 — Create & host (MVP) ✅

- [x] `HostLobbyScreen` + `/host/[code]` with deep-link host token capture
- [x] `POST /api/games/[code]/start` from mobile
- [x] Native create (`/create`) — all types except `custom` (`NATIVE_CREATABLE_GAMES`)
- [x] Web create link retained for advanced setup (participants, custom slot builder)
- [x] Host play-again from lobby (`postPlayAgain`)
- [ ] In-game host controls during active games (see gaps below)
- [ ] Host playing along while hosting (still web)

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

### Batch 13 — Push & local notifications (core ✅)

- [x] `expo-notifications` + permission flow on join (`GamePushSetup`)
- [x] `mobile_push_tokens` table + subscribe/unsubscribe API
- [x] Server push via Expo API + existing web push
- [x] Turn notifications: ludo, tic-tac-toe, checkers, ayo, **chess, whot, scrabble, monopoly, mahjong, crazy_eights, snake_and_ladder, yahtzee**
- [x] Round started: trivia advance (`round_started` event)
- [x] Game lifecycle push (start / play-again / end)
- [x] Foreground in-app banner (`useTurnNotifications` / `useGameTurnAlerts`)
- [x] Per-game push mute toggle (`PushMuteToggle` in session ⋮ menu)
- [x] Local turn alerts — vibration on your-turn toast + urgent timer ticks (`TimerBadge`, `local-turn-alerts`)
- [ ] Set real EAS `projectId` in `app.json` for physical-device push tokens *(deferred)*

### Batch 14 — Voice chat ✅

- [x] `@livekit/react-native` + Expo config plugins (dev build required — not Expo Go)
- [x] Reuse web token/presence APIs; `VoiceRail` in `PlayerSessionShell` + `HostLobbyScreen`
- [x] **14 game types** with voice rail (`apps/mobile/lib/voice-games.ts`) — chess, monopoly, ludo, party games, etc.
- [x] Host + player display name sync via `session-events` (rename updates voice label without 5s polling)
- [x] Background / inactive AppState disconnect + reconnect hint in `VoiceRail`
- [ ] Physical device QA for phone-call interruption (code in place; needs TestFlight build)

### Batch 15 — Game UI polish (P0–P3 core ✅)

See detailed checklist under [Batch 15+](#batch-15--game-ui-polish) below.

### Shared package exports (high level)

`batch-*-games`, game libs (`ayo`, `poll-games`, `chess`, `mafia`, `monopoly-board`, `mahjong`, `quick-draw-guess`, `anonymous-messages`, `hot-seat`, `custom-game`, …), **`viewers`**, **`participant-mode`**, **`game-type-checks`**, **`game-limits-lite`**.

### API wrappers (`apps/mobile/lib/game-api.ts`)

POST helpers for moves/votes/actions per game; GET for mahjong state, hot-seat results; anonymous message send; etc.

---

## What's **not** done (known gaps)

Remaining work before App Store / Play Store marketing.  
**Host mode is the largest gap** — everything below in that section is intentional backlog; shell, lifecycle, and Batch 15 player polish are **done**.

### Host mode (biggest gap)

The mobile app can **create**, **lobby**, **start**, and **play again**, but cannot **run** most games mid-session without web.

| Capability | Mobile | Web |
|------------|--------|-----|
| Create game (title + type) | ✅ `/create` | ✅ full settings |
| Host lobby (roster, share, start) | ✅ `/host/[code]` | ✅ |
| Play again from lobby | ✅ | ✅ |
| **In-game host dashboard** (trivia advance, bingo call, Mafia night, poll controls) | ❌ | ✅ |
| **Host playing along** (seated as player while hosting) | ❌ | ✅ |
| **Bingo auto-call sync** (`useBingoAutoCall` → `/api/bingo/sync`) | ❌ not ported | ✅ |

- [x] Host token storage + `/host/[code]` lobby (roster, share, start, play-again)
- [x] Native create for most types + deep-link host token from web create
- [ ] **In-game host dashboard** — see table above *(Batch 16)*
- [ ] **Host playing along** while hosting — `HostLobbyScreen` is host-only
- [ ] **Bingo auto-call sync** — mobile-only host cannot drive auto/manual number calls today

→ Proposed fix: [Batch 16 — In-game host](#batch-16--in-game-host-proposed)

### App shell & session

**Previously listed as open in older doc drafts — all done except advanced create:**

- [x] Leave game, edit name, recent games, share link / copy code
- [x] Native create (`/create`) for all types except `custom` (`NATIVE_CREATABLE_GAMES`)
- [x] Rules / how-to-play links (`GameRulesLink` on `GameShell` + session header)
- [x] ⋮ overflow menu (`PlayerSessionMenu`: rename, rules, push mute, leave)
- [ ] Advanced create only on web (participant import, custom slot builder, per-game settings) — *by design*

### Lobby & lifecycle

**Previously listed as open — core parity done:**

- [x] Late join / viewer mode, replay ready ring, rich lobby, pre-join gates
- [x] Import claim join (`ParticipantClaimJoinScreen` on poll + hot seat import mode)
- [x] Finish scoreboards + play-again on all score-based player views (`GameFinishPanel` + `PlayAgainFooter` on 29/30 views; `secret_message` is send-only — no scoreboard)
- [ ] Per-game finish UX still simpler than web on some types (animations, share cards)

### Notifications

- [x] Push notifications core (Batch 13)
- [x] Turn push + foreground alerts for all major turn-based games
- [x] Per-game mute + local timer vibration
- [ ] EAS `projectId` for real device push tokens *(deferred)*

### Voice chat

- [x] LiveKit rail on **14 game types** (Batch 14)
- [x] Background disconnect + rename sync
- [ ] Physical device QA (blocked on TestFlight / EAS project ID)

### Per-game UI quality (player views)

Batch 15 **P0–P3 core is done** for priority games. Remaining gaps are non-priority polish.

| Batch | Scope | Status | Remaining |
|-------|--------|--------|-----------|
| **P0** | Poll suite, trivia, bingo | ✅ Core done | Gender filters, results animations |
| **P1** | Ludo, checkers, chess, crazy8, whot | ✅ Core done | Motion / deal animations |
| **P2** | describe_it, quiplash, word_rush | ✅ Core done | — |
| **P3** | monopoly, scrabble, mahjong, quick_draw **guess** | ✅ Core done | Drawful **canvas** still cross-device |
| **—** | Other 30+ game types | MVP playable | Visual parity vs web, animation pass |

Detail:

- [x] **Poll suite** — timers, results UI, MLT avatars, lobby photos (P0)
- [x] **Trivia / Bingo** — `TriviaActiveRound`, bingo claim, called-number polish (P0)
- [x] **Board/card** — checkers, ludo, chess highlight, crazy8/whot cards (P1)
- [x] **Party** — describe_it, word_rush, quiplash team/score UX (P2)
- [x] **Heavy** — monopoly board, scrabble tiles, mahjong table, quick_draw guess (P3)
- [ ] **Quick Draw Drawful (canvas)** — `UnavailableFeaturePanel`; no native sketch surface
- [ ] **Anonymous room** — text feed only; no GIFs, reactions, reply threading
- [ ] **Remaining games** — logic-first MVPs (matching_pairs, sudoku, mafia, etc.)
- [ ] **Mahjong** — simplified claim UI (no full chow/pung/kong picker like web)

### Testing & release

- [ ] Device QA matrix (iOS/Android, small/large phones)
- [ ] E2E smoke tests for join → play → finish
- [ ] App Store / Play Store listing, OTA strategy documented

---

## Proposed next batches

Batches 10–15 core work is **done**. Prioritize **in-game host + device QA** next.

### Batch 10 — Session & navigation shell ✅

**Done (Jul 2026).** See “Batch 10” under What's done.

### Batch 11 — Create & host (MVP) ✅

**Done (Jul 2026)** for lobby + native create. Remaining: in-game host controls + host-as-player.

### Batch 16 — In-game host (proposed)

**Goal:** Host can run a full night from the phone without switching to web mid-game.

- Generic or per-game host overlays during `active` status (trivia advance, bingo call/sync, poll round controls)
- Port `useBingoAutoCall` (or equivalent) to mobile
- Optional: host-as-player stack (join own game while retaining host token)
- Host settings that today only exist on web create (participant import, custom slots)

### Batch 12 — Lifecycle & finish UX ✅

**Done (Jul 2026).** See “Batch 12” under What's done — finish scoreboards, play-again host + player flow, import claim join.

### Batch 13 — Push & local notifications ✅

**Done (Jul 2026).** Turn push for 13+ games, `useGameTurnAlerts`, per-game mute, timer haptics. EAS `projectId` deferred.

### Batch 14 — Voice chat ✅

**Done (Jul 2026).** 14 game types, session-event name sync, AppState background disconnect. Physical QA with TestFlight.

### Batch 15+ — Game UI polish

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
- [x] **Quick Draw (guess mode):** team roster picker, live scoreboards, timers, guess feed (P3)
- [x] **Quick Draw (Drawful canvas):** not native — cross-device panel only (see gaps)

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
| `apps/mobile/components/HostLobbyScreen.tsx` | Host lobby (start, play-again, roster) |
| `apps/mobile/app/create.tsx` | Native game create |
| `apps/mobile/lib/native-create.ts` | Creatable game types (excludes `custom`) |
| `apps/mobile/lib/push-preferences.ts` | Per-game push mute + local alert prefs |
| `apps/mobile/lib/voice-games.ts` | Mobile voice enable list (14 types) |
| `apps/mobile/components/push/PushMuteToggle.tsx` | Session menu notification toggle |
| `src/lib/push.ts` | Turn push resolution for all major turn-based games |
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

- [x] Host can **create and start** a game on device (lobby only — not full in-game host)
- [x] Player can join, play, see results, leave, rejoin (39/40 types; Drawful canvas uses cross-device panel)
- [x] No dead-end “use web” copy on happy paths (`UnavailableFeaturePanel`, “More setup options”)
- [x] Turn notification for async games (server push + foreground alerts + haptics on 13+ turn-based types)
- [x] Voice chat implemented (14 types, background handling; physical QA pending TestFlight)
- [x] Top traffic games visually acceptable (Batch 15 polish + shared `GameChrome` / `TurnBanner` refresh)
- [ ] **EAS project ID + TestFlight / internal track build** *(deferred — remaining gate)*

**Current score:** **6 / 7** — only store build + real push tokens remain.
