# Mobile new-game checklist

Companion to **[new-game-checklist.md](./new-game-checklist.md)**. Do the web
work **first** (the `GameType` union, `GAME_TYPE_CONFIG`, validation, landing
content, migration all live in the web/shared packages and mobile imports them),
then wire the Expo app so the game actually shows up and plays on phones.

> A game that works on the web is **not** live on mobile until it's registered
> here. If you skip this, the game either won't appear in the mobile create
> picker, or `GameRouter` returns `null` and players get a blank screen.

Paths below are relative to `apps/mobile/` unless noted.

---

## 0. Prerequisite (shared package)

The `GameType` union and game config live in `@fateround/shared`
(`packages/shared/src/…`). Make sure the web/shared side is done first — mobile
imports `GameType`, limits, and rules slugs from there. If the type isn't in the
union, none of the steps below will typecheck.

---

## 1. Player view

- [ ] Add `components/games/<Game>PlayerView.tsx` — the on-phone player screen.
  Signature is `({ gameCode }: { gameCode: string })`.
  - Copy an existing view of the same archetype (Whot/Crazy Eights for cards,
    Trivia/Quiplash for round games, Monopoly/Ludo for boards).
  - Follow the mobile conventions in `~/.claude` memory: runtime theming
    (`useThemedStyles`/`useTheme`, never a module-scope `theme`),
    `KeyboardAwareGameScroll` if it has a `TextInput`, `useHeaderBadge` for the
    mode pill, `uniqueTopic()` for any realtime channel.
- [ ] Some simple games are **native** (no dedicated React view) — if so, add the
  type to `NATIVE_GAME_TYPES` in `lib/native-games.ts` instead of a view file.

---

## 2. Register in the router (`components/games/GameRouter.tsx`)

New games are grouped into **batches**. Add yours to the **latest** batch (today
that's batch 9 — bump to a new batch only if the current one is being kept
frozen for a release).

- [ ] `import { <Game>PlayerView } from '@/components/games/<Game>PlayerView'`
- [ ] Add it to the latest `BATCH_N_VIEWS` map (`<game_type>: <Game>PlayerView`)
- [ ] Add the `game_type` to `BATCH_N_GAMES` in
  `packages/shared/src/batch-N-games.ts` (this is what feeds both
  `MOBILE_SUPPORTED_GAMES` and `NATIVE_GAME_TYPES`)
- [ ] Confirm it flows through: `MOBILE_SUPPORTED_GAMES` (bottom of
  `GameRouter.tsx`) must include the new batch — new games appear in the mobile
  create picker via this list.

`resolveMobilePlayerView(gameType)` should now return your component;
`hasMobilePlayerView(gameType)` should be `true`.

---

## 3. Metadata & labels

- [ ] `GAME_LABELS` in `lib/mobile-registry.ts` — display name
- [ ] `META` in `lib/game-type-meta.ts` — `{ emoji, blurb, category }` for the
  create-screen picker (`party | trivia | board | cards | puzzle | custom`)
- [ ] `GAME_TYPE_TO_SLUG` in `lib/game-rules.ts` — must mirror the web
  `src/lib/game-landing.ts` slug so the in-app rules link opens the right
  `/games/<slug>#rules` page (this map is exhaustive `Record<GameType, …>`, so a
  missing entry is a type error — good).

---

## 4. Finish standings

- [ ] Add a standings builder in `lib/finish-leaderboards.ts` so the finish
  screen shows real placements, not `—`. Every game type is expected to have one
  (see the "Mobile finish standings" note in memory).

---

## 5. Optional capabilities

- [ ] **Voice** — add to `MOBILE_VOICE_GAMES` in `lib/voice-games.ts` if the game
  should offer in-app voice chat (social / party / long board games).
- [ ] **Sound** — register SFX in `lib/sounds.ts` if the game uses them (needs a
  dev-client rebuild to activate).
- [ ] **Recent games / deep links** — check `lib/recent-games.ts` and
  `lib/game-links.ts` if the game needs special link handling.

---

## 6. Verify on device/simulator

- [ ] Game appears in the mobile **create** picker with the right emoji/blurb
- [ ] Joining a room code routes to your view (no blank screen → `GameRouter`
  resolved it)
- [ ] Lobby → play → finish standings all render
- [ ] Rules link opens the correct `/games/<slug>#rules`
- [ ] Light **and** dark theme both look right (runtime theming)
- [ ] `pnpm --filter mobile typecheck` (or the app's typecheck script) passes —
  the exhaustive `Record<GameType, …>` maps catch most missed registrations.

---

## Minimum mobile file touch list

```
packages/shared/src/batch-N-games.ts          # add game_type to the batch
apps/mobile/components/games/<Game>PlayerView.tsx
apps/mobile/components/games/GameRouter.tsx    # import + BATCH_N_VIEWS
apps/mobile/lib/mobile-registry.ts             # GAME_LABELS
apps/mobile/lib/game-type-meta.ts              # emoji / blurb / category
apps/mobile/lib/game-rules.ts                  # slug (mirror web)
apps/mobile/lib/finish-leaderboards.ts         # standings builder
apps/mobile/lib/native-games.ts                # only if native (no React view)
apps/mobile/lib/voice-games.ts                 # only if voice-enabled
```
