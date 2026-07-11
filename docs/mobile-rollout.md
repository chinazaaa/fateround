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
**Next priority:** **host + play parity** (Batch 23), **participants + custom game** (Batch 22), + device QA / TestFlight. (Batch 21 manual custom content shipped; library packs deferred.)

### Player E2E exceptions (Jul 2026)

| Case | Native player? | Notes |
|------|----------------|-------|
| **40 game types** | ✅ Full player flow | Join, lobby, play, finish, play-again waiting |
| **`custom` game type** | ✅ Play | Create needs web slot builder (until Batch 22) |
| **Import-mode polls / hot seat** | ✅ Claim join | `ParticipantClaimJoinScreen`; host still adds names on web create |
| **Advanced create** | ⚠️ Partial | Universal + board/card + party rooms on app *(Batches 18–20)*; custom content, rosters *(21–22)* |

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
- [x] Native create (`/create`) — wizard with lobby settings *(Batch 18)*; stores host token, routes to host lobby
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
| Create game (lobby settings) | ✅ `/create` wizard *(Batch 18)* | ✅ full settings |
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

**Still thinner than web:** host+play lobby UX *(Batch 23)*; library packs + file import + custom game slots *(Batch 22)*; poll host animations. (Manual custom questions/words now native — Batch 21.)

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

**Previously listed as open in older doc drafts — all done except per-game create (19–22):**

- [x] Leave game, edit name, recent games, share link / copy code
- [x] Native create (`/create`) for all types except `custom` (`NATIVE_CREATABLE_GAMES`)
- [x] Rules / how-to-play links (`GameRulesLink` on `GameShell` + session header)
- [x] ⋮ overflow menu (`PlayerSessionMenu`: rename, rules, push mute, leave)
- [x] Create wizard shell + universal lobby *(Batch 18)* — max players, late join, public/private, theme
- [x] Board & card room settings *(Batch 19)* — Ludo variant, chess look, Whot/Crazy8 rules, Scrabble, Mahjong, Monopoly
- [x] Party-game create settings *(Batch 20)* — polls, trivia, bingo, quiplash, quick draw, describe it, word rush, mafia, codewords, etc.
- [ ] Custom content + participants *(Batches 21–22)*

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
- [x] **Anonymous room** — GIFs (Klipy via `/api/klipy` + `expo-image`), ephemeral reactions (broadcast, `useAnonymousReactions`), and reply threading now shipped (`GifPickerSheet`, upgraded `AnonymousMessagesPlayerView`)
- [x] **Mahjong** — full pung/kong/chow claim picker (`lib/mahjong-claims.ts` ported from web; chow gated to the seat after the discarder); server re-validates
- [ ] **Remaining games polish** — all types are playable MVPs; visual/animation parity with web is an ongoing polish backlog, not a functional gap (matching_pairs, sudoku, mafia, etc. all have working player + host views)

### Testing & release

- [ ] Device QA matrix (iOS/Android, small/large phones)
- [ ] E2E smoke tests for join → play → finish
- [ ] App Store / Play Store listing, OTA strategy documented

---

## Proposed next batches

Batches 10–20 core work is **done**. Next: **custom content create (21–22)**, **host + play parity (23)**, then device QA + TestFlight.

### Batch 17 — Drawful canvas + host polish ✅

**Done (Jul 2026).** See “Batch 17” under What's done — touch canvas, Drawful player, Quick Draw host, poll host results.

### Batch 18 — Create wizard shell + universal lobby settings ✅

**Done (Jul 2026).** Multi-step create with universal lobby knobs; per-game room settings land in Batches 19–20.

- [x] `CreateWizardShell` — Setup → (People placeholder for Who Said This) → Create
- [x] `createGame()` accepts full API payload via `buildCreatePayload()`
- [x] `CREATE_SETTINGS_REGISTRY` + `apps/mobile/lib/create-settings/`
- [x] Universal lobby: max players, late join, public/private, theme
- [x] Web link copy — custom import & slots → web until Batch 22

### Batch 19 — Board & card game room settings ✅

**Done (Jul 2026).** Per-game room panels on native create for all board/card hosts in scope.

| Games | Settings |
|-------|----------|
| Ludo | `ludo_variant`, turn timer |
| Snakes & Ladders, Yahtzee, Tic-tac-toe | Turn timer |
| Chess | Board theme, piece set, clocks |
| Checkers, Ayo | Variant (Ayo), turn timer |
| Whot, Crazy 8 | Rule toggles, game duration, turn timer |
| Scrabble | Dictionary, clock mode / seconds, turn + session length |
| Mahjong | Ruleset + default rule options |
| Monopoly | Session duration, turn timer |

- [x] `GameRoomSettingsPanel` + `CREATE_SETTINGS_REGISTRY` room payload (`board-games.ts`)
- [x] Shared create helpers: `@fateround/shared/create-board-games`, `mahjong-rulesets`

### Batch 20 — Party & round-based game settings ✅

**Goal:** Rounds, timers, and mode toggles for party games (platform question pools only — no custom editor yet).

| Games | Settings |
|-------|----------|
| Poll suite | Rounds, round timer, anonymous, gender-based, pair vote mode |
| Trivia | Rounds, timer, category, `question_source: platform` |
| Bingo | Auto vs manual call, call interval |
| Quick Draw | Drawful vs guess, team vs individual, teams, rounds, timers |
| Describe It / Word Rush | Team vs individual, num teams, rounds, timer (+ WR difficulty/prompt mode) |
| Mafia | Doctor, detective, anonymous votes |
| Codewords | Spymaster / operative timers, team assignment |
| Two Truths, Quiplash, Hot Seat, etc. | Rounds + timer where web has them |

**Shipped:** `packages/shared/src/create-party-games.ts`, `apps/mobile/lib/create-settings/party-games.ts`, `PartyRoomSettingsPanel.tsx`, wired into `CreateWizardShell` + `buildCreatePayload`.

### Batch 21 — Custom content (questions & words) ✅ *(manual entry)*

- [x] Manual entry: custom WYR / This-or-That pairs, MLT / NHIE / Pick-a-Number / Quiplash prompts, trivia Q&A (question + 2–4 answers + correct + category), describe-it & quick-draw words, codewords single-word pool
- [x] `question_source`: platform \| custom toggle per supported game (`CustomContentPanel`)
- [x] Client-side minimums mirror `POST /api/games` (rounds-count floor, Pick-a-Number ≥5, Codewords ≥25 single words)
- [x] Library question packs — shipped in **Batch 25** (see below)

**Shipped:** `apps/mobile/lib/create-settings/custom-content.ts` (kinds, payload, validation), `apps/mobile/components/create/CustomContentPanel.tsx` (source toggle + list/pair/trivia editors), wired into `CreateWizardShell` + `buildCreatePayload` + `validateCreateState`.

### Batch 22 — Participants & Custom Game ✅

- [x] Manual participant list — `ParticipantListEditor` (name + optional F/M gender, add/remove, live count vs minimum) as the real People step
- [x] Joiners vs import mode — `PlayerModePanel` (Hot Seat: join ↔ pre-set roster; Most Likely To: join ↔ import list); Who Said This & Custom are import-locked
- [x] **Custom Game** — `CustomSlotBuilderPanel` (5 templates + from-scratch, 2–5 slots, emoji/label/color pickers, live preview); `custom_slots` payload + validation (≥2 labelled slots, participants ≥ slot count)
- [x] Added `custom` to `NATIVE_CREATABLE_GAMES`; removed the custom-slots “go to web” copy
- [x] **CSV / file import** via document picker — `lib/file-import.ts` (`expo-document-picker` + SDK-57 `new File().text()`); **Import CSV** buttons in `CustomContentPanel` (WYR / list / trivia) and `ParticipantListEditor` (name + gender). `.xlsx` stays web-only (binary)

**Shipped:** `apps/mobile/lib/create-settings/people.ts` (modes, slots, participant + slot validation, payload), `CustomSlotBuilderPanel.tsx`, `PlayerModePanel.tsx`, `ParticipantListEditor.tsx`; `needsParticipantStep`/`wizardStepsForGame` now derive the People step from `needsPeopleStep(gameType, people)` per web. Replaced the old `PeopleStepPlaceholder`.

### Batch 23 — Host + play parity *(planned)*

**Goal:** Close the remaining gaps between mobile and web when the host wants to play their own game — without requiring the game to be active first.

Batch 16 shipped **`HostPlayAlongCard`** (join from in-game host dashboard + **Host** button in player header). Batch 23 finishes the lobby and integrated UX.

| Gap (vs web) | Status |
|--------------|--------|
| Play along from **lobby before start** | ✅ `HostLobbyPlayCard` on `HostLobbyScreen` — join as player, host token retained, session persisted |
| **Spectator vs player** host mode | ✅ Play-as-yourself ↔ **Stop playing** (drops the seat via `leaveGame` + `clearPlayerSession`) |
| **Play / Manage on one screen** | ✅ **Embedded tabs** — `HostChrome` now has a `Manage` / `Play` segmented control; the Play tab renders the host's own `GameRouter` inline (join screen if not seated). Replaced the old navigate-away quick-switch |
| **Host mode toggle (spectator vs player)** | ✅ Inherent in the Play tab — not seated → join screen; seated → the game. Lobby `HostLobbyPlayCard` also has explicit **Stop playing** |
| **Lobby auto-seat** (board games) | ✅ chess/checkers/tic-tac-toe/ludo auto-assign colour at start; **Monopoly** now has a lobby token picker in `HostLobbyPlayCard` |
| **Host rename while seated** | ✅ Rename in `HostLobbyPlayCard` (patches via the host's own resume token) |
| **Replay lobby play-along** | ✅ `useHostAutoReady` re-marks the seat ready; `postPlayAgain` passes `hostPlayerId` so the seat survives the replay |

**Shipped:** `HostLobbyPlayCard.tsx` (+ Monopoly token grid), `hooks/useHostAutoReady.ts`, `hooks/useHostPlayerReconciliation.ts`; `HostChrome` **Manage/Play embedded tabs** (`GameRouter` inline); `postPlayAgain(..., hostPlayerId)`. Removed the standalone in-game `HostPlayAlongCard` (superseded by the Play tab).

### Batch 24 — Host transfer (nominee claim flow) ✅

**Goal:** Let a host hand the game to another player without web — the claim-based, two-token transfer web already ships.

- [x] **Host side** — `TransferHostSheet` (opened from `HostChrome`'s **Transfer** action): pick a non-spectator player → `POST /transfer-host`; live "waiting for X" via `useHostNomination`; **Cancel invite** (nominate `null`); resolves accept vs decline with `verifyHost` — on accept it drops the dead host token (`clearHostToken`) and returns to the player view, on decline it shows "still the host"
- [x] **Nominee side** — `HostNominationBanner` in `PlayerSessionShell`: when `pending_host_player_id === myPlayerId`, **Become host** → `POST /claim-host` (mints a fresh host token) → stores it + opens `/host/[code]`; **Decline** → `POST /decline-host`
- [x] `useHostNomination` — realtime `games.pending_host_player_id` tracker shared by both sides
- [x] Added `pending_host_player_id` to the shared `Game` type + mobile `GAME_SELECT`; API helpers `postTransferHost` / `postClaimHost` / `postDeclineHost`
- Only `host_token` moves (rotated, returned solely to the proven nominee); the outgoing host's token is invalidated immediately

**Available in-game** (from the host dashboard). Lobby-stage transfer can be added later if wanted.

### Batch 25 — Library packs ✅

The deferred Batch-21 item. Community question packs, read-only pick from the server.

- [x] Third **Library** source option in `CustomContentPanel` for games that support it (trivia, WYR, This-or-That, MLT, NHIE, Pick-a-Number, Codewords, Describe It, Quick Draw — mirrors web `questionSourceOptions`)
- [x] `LibraryPackPicker` — lists `GET /api/library?game_type=X`, loads the chosen pack's questions via `GET /api/library/[id]`
- [x] A picked pack loads into the same editor buffers and persists as `question_source: 'custom'` + `custom_questions` — exactly how web folds library into custom (schema only accepts platform/custom)
- [x] `fetchLibraryPacks` / `fetchLibraryPack` API client; `packQuestionsToState` + `supportsLibrary` + `usesCustomQuestions` in `custom-content.ts`

**All create-flow deferrals are now closed** except `.xlsx` import (binary — CSV/TSV works natively).

## Lobby settings editing (Batches 26+)

Hosts can now edit settings from the lobby (mirrors web). **Universal four** — visibility, rounds, timer, late-join — shipped in `HostLobbySettingsSheet` (**Edit settings** on `HostLobbyScreen`). These batches add the **game-specific** deltas, grouped so games sharing the same web panel + save endpoint land together. Every lobby edit is server-gated to `status === 'waiting'` (PATCH-route settings also allow `finished`).

**Save endpoints:** `PATCH /api/games/[code]` (universal + poll/trivia/scrabble/npat) · `POST /api/games/[code]/lobby-settings` (board house-rules + several party games + max_players) · dedicated `/api/{describe-it,word-rush,quick-draw,bingo}/settings`, `/api/codewords/{timers,randomize-teams}`.

| Batch | Games | Unique lobby settings | Endpoint | Status |
|-------|-------|-----------------------|----------|--------|
| **26** | *(infra)* + Monopoly/Yahtzee/Snake&Ladder + others | `postLobbySettings` helper; **Max players** (board + word_hunt/mafia/sudoku/matching_pairs/ayo) | lobby-settings | ✅ |
| **27** | Whot, Crazy Eights | Game length + house-rule toggles + turn timer | lobby-settings | ✅ |
| **28** | Ludo, Ayo | Variant + turn timer | lobby-settings | ✅ |
| **29** | Describe It, Word Rush | Mode / teams / turn / rounds (+WR prompt·difficulty) | `/describe-it`,`/word-rush`/settings | ⏳ |
| **30** | Mafia, Quiplash | Roles / dual timers | lobby-settings | ✅ |
| **31** | Sudoku, Matching Pairs, Word Hunt | Time / grid / rounds | lobby-settings | ✅ |
| **32** | Quick Draw | Variant/mode/teams/timers + word pool | lobby-settings + `/quick-draw/settings` | ⏳ |
| **33** | Bingo | Call mode + interval | `/bingo/settings` | ⏳ |
| **34** | Poll suite, Trivia, Two Truths | Pair-vote mode, player questions, AI questions | PATCH | ⏳ |
| **35** | Scrabble | Dictionary, clock mode/bank | PATCH | ⏳ |
| **36** | Codewords | Spymaster/operative timers, shuffle teams | `/codewords/{timers,randomize-teams}` | ⏳ |
| **37** | I-Call-On | Writing/marking timers, duration | PATCH | ⏳ |
| **38** | Mahjong | Ruleset + conditional rule options (complex, last) | lobby-settings | ⏳ |

**Create-only (no lobby editor — server locks them):** `gender_based`, `trivia_category`, `question_source` (except via word-pool routes), `codewords_player_picks`/`codewords_randomize_teams` flags, `chess_board_theme`/`chess_piece_set`. Yahtzee/Snake&Ladder/Monopoly need nothing beyond Batch 26.

**Batch 26 shipped:** `postLobbySettings` in `game-api.ts`; **Max players** control in `HostLobbySettingsSheet` (routed to `lobby-settings`, gated to the games that route accepts it for).

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
| `apps/mobile/components/HostLobbyScreen.tsx` | Host lobby (start, play-again, roster, **Edit settings** sheet) |
| `apps/mobile/components/host/HostLobbySettingsSheet.tsx` | In-lobby settings editor — visibility, rounds, timer, late-join (`PATCH /api/games/[code]`) |
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
