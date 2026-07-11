# Mobile rollout — status & roadmap

Living doc for the React Native / Expo app in `apps/mobile/`.  
**Branch:** `feat/mobile-shell` (work largely uncommitted as of Jul 2026).

---

## TL;DR

| Area | Status |
|------|--------|
| **Game types with a native player screen** | **40 / 40** (Batches 1–9) |
| **Player E2E (join → play → finish)** | **40 / 40** |
| **Production-ready mobile UX** | **No** — functional MVPs; Batch 15 polish done for priority games |
| **Host / create / lobby** | **Batch 11 + 16–17 done** — lobby, in-game host, play-along; create is title+type only |
| **Session shell (Batch 10)** | **Done** — header menu, rules links, keyboard forms, native create |
| **Lifecycle & finish UX (Batch 12)** | **Done** — finish scoreboards, play-again flow, import claim join |
| **Push notifications (Batch 13)** | **Done** — turn push for 13+ games, per-game mute, local haptics; EAS project ID deferred |
| **Voice chat (Batch 14)** | **Done** — 14 game types, rename sync, background disconnect; device QA with TestFlight |
| **Game UI polish (Batch 15–17)** | **Done** — poll/trivia/bingo, boards/cards, party UX, Drawful canvas, host dashboards |
| **Web fallback** | Advanced create (settings, participants, custom slots) + `mobile-config` disable list |

Batches 1–9 were about **coverage**: every game type can open a native screen and perform core player actions.  
Batches 10–17 added **shell, lifecycle, notifications, voice, polish, host mode, and Drawful canvas**.  
**Next priority:** **native create wizard** (Batches 18–22), **host + play parity** (Batch 23), + device QA / TestFlight.

### Player E2E exceptions (Jul 2026)

| Case | Native player? | Notes |
|------|----------------|-------|
| **40 game types** | ✅ Full player flow | Join, lobby, play, finish, play-again waiting |
| **`custom` game type** | ✅ Play | Create needs web slot builder (until Batch 22) |
| **Import-mode polls / hot seat** | ✅ Claim join | `ParticipantClaimJoinScreen`; host still adds names on web create |
| **Advanced create** | ⚠️ Web | Title + type on app; per-game settings / rosters on web (Batches 18–22) |

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
| **8** | monopoly, mahjong, quick_draw | 3 | Quick Draw **guess + Drawful** native with touch canvas (Batch 17) |
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
- [x] In-game host controls during active games *(Batch 16)*
- [x] Host playing along while hosting *(Batch 16 — see Host + play below)*

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
**Host mode + Drawful canvas done (Batches 16–17)** — remaining gap is release QA (EAS / TestFlight).

### Host mode

Mobile can **create**, **lobby**, **start**, **run mid-game**, **play along**, and **play again**.

| Capability | Mobile | Web |
|------------|--------|-----|
| Create game (title + type) | ✅ `/create` | ✅ full settings |
| Host lobby (roster, share, start) | ✅ `/host/[code]` | ✅ |
| Play again from lobby | ✅ | ✅ |
| **In-game host dashboard** (trivia advance, bingo call, Mafia phase, poll round controls) | ✅ `HostGameScreen` → `HostRouter` | ✅ full dashboards |
| **Host playing along** (seated as player while hosting) | ✅ `HostPlayAlongCard` | ✅ |
| **Bingo auto-call sync** (`useBingoAutoCall` → `/api/bingo/sync`) | ✅ | ✅ |

- [x] Host token storage + `/host/[code]` lobby (roster, share, start, play-again)
- [x] Native create for most types + deep-link host token from web create
- [x] **In-game host dashboard** — `HostGameScreen` routes to per-game screens during `active` / `finished` *(Batch 16)*
- [x] **Host playing along** — join as player while keeping host token (`HostPlayAlongCard`)
- [x] **Bingo auto-call sync** — `useBingoAutoCall` on bingo host screen + manual call button

**Still thinner than web:** host+play lobby UX and integrated tabs *(Batch 23)*; advanced create *(Batches 18–22)*; poll host animations.

### Host + play (play along)

**Yes — with a simpler flow than web.**

| Capability | Mobile | Web |
|------------|--------|-----|
| Join own game as a player while keeping host token | ✅ | ✅ |
| Switch back to host controls | ✅ **Host** button in player session header | ✅ Play / Manage tabs |
| Play along from **in-game host dashboard** | ✅ `HostPlayAlongCard` on all host screens | ✅ |
| Play along from **lobby before start** | ❌ not on `HostLobbyScreen` yet | ✅ Host joins/seats in lobby |
| Host mode toggle (spectator vs player) | ❌ | ✅ per-game host views |
| Integrated play+manage on one screen | ❌ separate routes (`/host` ↔ `/game`) | ✅ tabs |

**Mobile flow today:**

1. Host creates → `/host/[code]` lobby → starts game → in-game host dashboard (`HostGameScreen` → `HostRouter`).
2. On the host dashboard, tap **Play along** → enter name → join as player → `/game/[code]`.
3. While playing, tap **Host** in the session header to return to `/host/[code]` (host token stays in SecureStore).

**Not yet:** see **Batch 23 — Host + play parity** below.

### App shell & session

**Previously listed as open in older doc drafts — all done except advanced create:**

- [x] Leave game, edit name, recent games, share link / copy code
- [x] Native create (`/create`) for all types except `custom` (`NATIVE_CREATABLE_GAMES`)
- [x] Rules / how-to-play links (`GameRulesLink` on `GameShell` + session header)
- [x] ⋮ overflow menu (`PlayerSessionMenu`: rename, rules, push mute, leave)
- [ ] Advanced create on app — title + type only today; full wizard planned in **Batches 18–22** (see below)

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
| **P3** | monopoly, scrabble, mahjong, quick_draw | ✅ Core done | — |
| **—** | Other 30+ game types | MVP playable | Visual parity vs web, animation pass |

Detail:

- [x] **Poll suite** — timers, results UI, MLT avatars, lobby photos (P0)
- [x] **Trivia / Bingo** — `TriviaActiveRound`, bingo claim, called-number polish (P0)
- [x] **Board/card** — checkers, ludo, chess highlight, crazy8/whot cards (P1)
- [x] **Party** — describe_it, word_rush, quiplash team/score UX (P2)
- [x] **Heavy** — monopoly board, scrabble tiles, mahjong table, quick_draw guess (P3)
- [x] **Quick Draw (guess + Drawful):** native touch canvas (`DrawingCanvas`), stroke sync, full Drawful player flow *(Batch 17)*
- [ ] **Anonymous room** — text feed only; no GIFs, reactions, reply threading
- [ ] **Remaining games** — logic-first MVPs (matching_pairs, sudoku, mafia, etc.)
- [ ] **Mahjong** — simplified claim UI (no full chow/pung/kong picker like web)

### Testing & release

- [ ] Device QA matrix (iOS/Android, small/large phones)
- [ ] E2E smoke tests for join → play → finish
- [ ] App Store / Play Store listing, OTA strategy documented

---

## Proposed next batches

Batches 10–17 core work is **done**. Next: **native create wizard (18–22)**, **host + play parity (23)**, then device QA + TestFlight.

### Batch 17 — Drawful canvas + host polish ✅

**Done (Jul 2026).** See “Batch 17” under What's done — touch canvas, Drawful player, Quick Draw host, poll host results.

### Batch 18 — Create wizard shell + universal lobby settings *(planned)*

**Goal:** Replace “title + type only” with a multi-step create flow; every game gets meaningful defaults + lobby knobs.

- [ ] `CreateWizardShell` — steps: Setup → (optional People) → Create
- [ ] Extend `createGame()` to send full API payload (not just `title` + `game_type`)
- [ ] `CREATE_SETTINGS_REGISTRY` — `GameType → { defaults, fields, validate, toApiPayload }`
- [ ] Universal lobby fields where web supports them: max players, late join / viewers, public vs private, theme
- [ ] Soften web link copy — “Full import & custom slots → web” until Batch 22

### Batch 19 — Board & card game room settings *(planned)*

**Goal:** Match web “room” panels (e.g. Ludo traditional vs modern).

| Games | Settings |
|-------|----------|
| Ludo | `ludo_variant` (traditional / modern), turn timer, max players, late join |
| Snakes & Ladders, Yahtzee, Tic-tac-toe | Max players, turn timer, late join |
| Chess | Board theme, piece set, clocks |
| Checkers, Ayo | Variant, turn timer |
| Whot, Crazy 8 | Rule toggles, game duration, turn timer |
| Scrabble | Dictionary, clock mode / seconds |
| Mahjong | Ruleset + rule options |
| Monopoly | Session duration, turn timer |

Reuse `@fateround/shared` parsers (`parseLudoVariant`, `turnTimerOptionsFor`, game limits).

### Batch 20 — Party & round-based game settings *(planned)*

**Goal:** Rounds, timers, and mode toggles for party games (platform question pools only — no custom editor yet).

| Games | Settings |
|-------|----------|
| Poll suite | Rounds, round timer, anonymous, gender-based, pair vote mode |
| Trivia | Rounds, timer, category, `question_source: platform` |
| Bingo | Max players, auto vs manual call, call interval |
| Quick Draw | Drawful vs guess, team vs individual, teams, rounds, timers |
| Describe It / Word Rush | Team vs individual, num teams, rounds, timer |
| Mafia | Doctor, detective, anonymous votes |
| Codewords | Spymaster / operative timers, late join |
| Two Truths, Quiplash, Hot Seat, etc. | Rounds + timer where web has them |

### Batch 21 — Custom content (questions & words) *(planned)*

- [ ] Manual entry: custom WYR, MLT, trivia Q&A, describe-it words, quick-draw prompts
- [ ] Optional: library question packs (read-only pick from server)
- [ ] Trivia `question_source`: platform \| custom \| library

### Batch 22 — Participants & Custom Game *(planned)*

- [ ] Manual participant list (name + optional gender)
- [ ] Joiners vs import mode where relevant
- [ ] **Custom Game** — slot builder (`custom_slots`) + validation
- [ ] Optional later: CSV import via document picker
- [ ] Add `custom` to `NATIVE_CREATABLE_GAMES`; remove “go to web” for create

**Architecture note:** Port per-game **config modules**, not the 4,700-line web create page. Mirror web’s `needsParticipantStep` logic for when step 2 (People) appears.

### Batch 23 — Host + play parity *(planned)*

**Goal:** Close the remaining gaps between mobile and web when the host wants to play their own game — without requiring the game to be active first.

Batch 16 shipped **`HostPlayAlongCard`** (join from in-game host dashboard + **Host** button in player header). Batch 23 finishes the lobby and integrated UX.

| Gap (vs web) | Planned work |
|--------------|--------------|
| Play along from **lobby before start** | Add `HostPlayAlongCard` (or shared join flow) to `HostLobbyScreen`; persist host + player sessions |
| **Spectator vs player** host mode | Per-game or global toggle: host-only (manage) vs play-as-yourself; drop player seat when switching to spectator *(mirror web `HostModeSelector`)* |
| **Play / Manage on one screen** | Host shell with tabs or segmented control — **Manage** (roster, start, host controls) + **Play** (embedded player view or quick switch without losing context) |
| **Lobby auto-seat** (board games) | Chess, checkers, tic-tac-toe, ludo, etc.: host picks seat / color in lobby before start *(mirror web host lobby panels)* |
| **Host rename while seated** | Patch player name via host token when host is also a player *(web `renameHost`)* |
| **Replay lobby play-along** | After play-again, re-join host’s player seat without re-entering name |

**Reference (web):** `HostModeSelector`, play/manage tabs in `*HostView` components, `useHostAutoReady`, `useHostPlayerReconciliation`.

**Out of scope for Batch 23:** host transfer to another player (nominee claim flow) — keep web-only unless needed.

### Batch 10 — Session & navigation shell ✅

**Done (Jul 2026).** See “Batch 10” under What's done.

### Batch 11 — Create & host (MVP) ✅

**Done (Jul 2026)** for lobby + native create + in-game host (Batch 16).

### Batch 16 — In-game host ✅

**Done (Jul 2026).** Host can run a full night from the phone without switching to web for core controls.

- [x] `HostGameScreen` — waiting → `HostLobbyScreen`; active/finished → `HostRouter`
- [x] Per-game host screens: bingo (call + auto-sync), trivia (auto-advance + force), poll/hot_seat/custom (end/next/finish), Mafia (phase advance), generic (board/party games + two-truths/quick-draw guess advance)
- [x] `useBingoAutoCall`, `useTriviaAutoAdvance`, host API helpers in `game-api.ts`
- [x] `HostPlayAlongCard` — join own game as player while retaining host token
- [x] Poll host: round results (`PollRoundResults`), vote progress, MLT cumulative leaderboard *(Batch 17)*

### Batch 17 — Drawful canvas + host polish ✅

**Done (Jul 2026).**

- [x] Native touch canvas (`DrawingCanvas` + `react-native-svg`)
- [x] Quick Draw guess: live draw + stroke sync; Drawful (lie): full player flow
- [x] `QuickDrawHostScreen` — phase advance, drawing preview, leaderboard
- [x] Poll host results + cumulative MLT leaderboard

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

### Batch 17 — Drawful canvas + host polish ✅

**Done (Jul 2026).**

- [x] `react-native-svg` drawing surface — pen, eraser, colors, undo/clear
- [x] **Guess mode:** live canvas for drawer, readonly preview for guessers, stroke sync via `/api/quick-draw/guess-strokes`
- [x] **Drawful (lie) mode:** full mobile player (`QuickDrawLiePlayerView`) — draw, fake titles, vote, reveal
- [x] **Quick Draw host:** `QuickDrawHostScreen` — phase advance, live drawing preview, leaderboard
- [x] **Poll host polish:** `PollRoundResults` between rounds, vote-in progress, MLT overall leaderboard

#### Batch 15 P3 (Jul 2026)

- [x] Shared `@fateround/shared/monopoly-board-layout` (11×11 grid, color hex, short labels)
- [x] **Monopoly:** `MonopolyBoardView` — visual board, token positions, property color bands, pending-space highlight, turn timer
- [x] **Scrabble:** `ScrabbleTile` wood-style rack/board tiles, responsive board grid, live leaderboard, turn deadline badge
- [x] **Mahjong:** `MahjongTableView` four-seat table + discard pond, `MahjongTileFace` colored tile faces, visual melds, turn timer
- [x] **Quick Draw (guess mode):** team roster picker, live scoreboards, timers, guess feed (P3)
- [x] **Quick Draw (Drawful canvas):** native touch canvas + full lie-mode flow (Batch 17)

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
| `apps/mobile/components/host/HostGameScreen.tsx` | Host shell: lobby vs in-game routing |
| `apps/mobile/components/host/HostRouter.tsx` | Per-game host view dispatch |
| `apps/mobile/components/host/HostPlayAlongCard.tsx` | Host join-as-player while keeping token |
| `apps/mobile/hooks/useBingoAutoCall.ts` | Bingo auto-call sync polling |
| `apps/mobile/hooks/useTriviaAutoAdvance.ts` | Trivia round auto-advance polling |
| `apps/mobile/app/create.tsx` | Native game create |
| `apps/mobile/lib/native-create.ts` | Creatable game types (excludes `custom` until Batch 22) |
| `apps/mobile/components/quick-draw/DrawingCanvas.tsx` | Native sketch surface (Batch 17) |
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

- [x] Host can **create, start, and run** a game on device (lobby + in-game host dashboard)
- [x] Player can join, play, see results, leave, rejoin (**40/40** types including Drawful canvas)
- [x] No dead-end “use web” copy on happy paths (`UnavailableFeaturePanel`, “More setup options”)
- [x] Turn notification for async games (server push + foreground alerts + haptics on 13+ turn-based types)
- [x] Voice chat implemented (14 types, background handling; physical QA pending TestFlight)
- [x] Top traffic games visually acceptable (Batch 15 polish + shared `GameChrome` / `TurnBanner` refresh)
- [ ] **EAS project ID + TestFlight / internal track build** *(deferred — remaining gate)*

**Current score:** **6 / 7** — only store build + real push tokens remain.
