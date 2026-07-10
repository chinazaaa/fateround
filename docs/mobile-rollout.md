# Mobile rollout — status & roadmap

Living doc for the React Native / Expo app in `apps/mobile/`.  
**Branch:** `feat/mobile-shell` (work largely uncommitted as of Jul 2026).

---

## TL;DR

| Area | Status |
|------|--------|
| **Game types with a native player screen** | **40 / 40** (Batches 1–9) |
| **Production-ready mobile UX** | **No** — functional MVPs only |
| **Host / create / lobby polish** | **Not started** |
| **Push notifications** | **Not started** |
| **Voice chat** | **Web only** (LiveKit) — not in mobile app |
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

### Shared package exports (high level)

`batch-*-games`, game libs (`ayo`, `poll-games`, `chess`, `mafia`, `monopoly-board`, `mahjong`, `quick-draw-guess`, `anonymous-messages`, `hot-seat`, `custom-game`, …).

### API wrappers (`apps/mobile/lib/game-api.ts`)

POST helpers for moves/votes/actions per game; GET for mahjong state, hot-seat results; anonymous message send; etc.

---

## What's **not** done (known gaps)

These are why the app still feels rough even with 40 game screens.

### App shell & session

- [ ] **Create game** — no native flow; host must use web
- [ ] **Host mode** — no host views, no host lobby, no start/settings controls
- [ ] **Leave game** — no “exit” that clears session and returns home
- [ ] **Edit name** — no `PATCH /api/players` UI
- [ ] **Recent games** — no resume list on home screen
- [ ] **Share link / copy code** — no in-game share affordance
- [ ] **Rules / how to play** — not linked from native screens
- [ ] **Global header** — no consistent back, game code, player menu
- [ ] **Safe area / keyboard** — inconsistent across views
- [ ] **Error toasts** — mostly inline text; no shared toast system

### Lobby & lifecycle (web parity)

- [ ] `LobbyView` still shows *“native screen coming in a later batch”* when game is active but player is waiting
- [ ] **Late join / viewer mode** — largely web-only (`allow_late_players`, spectator flows)
- [ ] **Game started waiting / game ended** pre-join screens — not ported
- [ ] **Ready rings / replay / play again** — not on mobile
- [ ] **Participant claim** (import-mode polls, hot seat names) — partial; many games use plain name join only
- [ ] **Rich finish screens** — most games use a one-line `FinishedPanel`; no scoreboards, share cards, or recap UI matching web

### Notifications

- [ ] **Push notifications** — not implemented (no Expo Notifications setup, no server push pipeline)
- [ ] **In-app turn alerts** — web has hooks like `useTurnNotifications`; mobile has no equivalent
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

**Mobile (not started):** No LiveKit SDK, no mic permissions flow, no join/leave/mute UI, no presence polling.

- Native player views have **no voice chrome** — party/social games (Mafia, polls, Describe It, etc.) are text/action-only on mobile
- Host voice identity hooks exist on web (`useHostVoiceIdentity`) but nothing equivalent in `apps/mobile/`
- **Dependency:** Batch 10 game shell (header / room chrome) is the natural mount point for a mobile voice rail

**Launch candidates (mobile voice v1):** mafia, whot, describe_it, codewords, anonymous_messages — high social value; expand after SDK + shell proven.

### Per-game UI quality (player views)

Player views are **logic-first MVPs**, not design-complete:

- Minimal dark theme; per-game styling inconsistent
- Many board games show **actions/scores only** (monopoly, mahjong) — no full board/canvas
- **Quick Draw Drawful** (`lie` variant) — explicit web fallback, no canvas
- **Anonymous room** — text feed only; no GIFs, reactions, reply threading
- **Poll games** — single shared component; no photos, gender filters, or results animations
- **Complex games** (scrabble board, chess board, ludo board, etc.) — playable but visually sparse vs web

### Host token

`secure-session` can store a host token, but nothing in the UI reads it or routes to host APIs.

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

### Batch 12 — Lifecycle & finish UX

**Goal:** Match web join/wait/finish flows.

- Port patterns from web: `GameStartedWaiting`, `GameEndedScreen`, `LateJoinChoice`, `ViewerModeBanner`
- Rich **FinishedScreen** component: winner, scores, play again CTA (web fallback OK initially)
- Per-game finish hooks (leaderboards for describe_it, quiplash, etc.)
- `postPlayerReady` / ready rings where used

### Batch 13 — Push & local notifications

**Goal:** “Your turn” and “game started” on lock screen.

- Expo Notifications + permission flow
- Device token registration API (new route or extend mobile-config)
- Server events: turn start, game start, round end (start with 2–3 game types)
- Foreground in-app banner when push disabled

### Batch 14 — Voice chat

**Goal:** Join the same LiveKit room as web players from the native app.

**Prerequisites:** Batch 10 shell (shared header / room chrome where the rail lives).

- Evaluate **LiveKit React Native** (`@livekit/react-native` + Expo config plugin) vs webview bridge (prefer native SDK)
- Mic permission UX (iOS `NSMicrophoneUsageDescription`, Android runtime permission)
- Reuse existing APIs: `POST /api/audio-token`, `POST /api/audio-presence` (same room naming / identity rules as web)
- **Mobile voice rail component:** join / leave, mute, participant count, optional speaker list
- Mount rail from game shell (all games) or opt-out set mirroring `gameHasHeaderVoice` over time
- Host path: stable LiveKit identity when host is also a player (`useHostVoiceIdentity` parity)
- Background / interruption handling (phone call, Bluetooth route)
- QA: iOS + Android, echo, reconnect, multi-tab not applicable on mobile but resume-from-background
- **v1 game set:** mafia, whot, describe_it — then roll out to remaining social types

**Out of scope for v1:** Spotify sidecar, floating draggable pill (use fixed header rail only), per-game custom voice layouts.

### Batch 15+ — Game UI polish (ongoing)

Pick games by traffic / complexity, not all at once:

| Priority | Games | Work |
|----------|--------|------|
| P0 | Poll suite, trivia, bingo | Results UI, photos, timers |
| P1 | Board/card (ludo, checkers, chess, crazy8, whot) | Boards, hands, animations |
| P2 | Party (describe_it, quiplash, word_rush) | Team UX, score recap |
| P3 | Heavy (monopoly, scrabble, mahjong, quick_draw lie) | Full boards / canvas |

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
