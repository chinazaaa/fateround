# Fate Round — Mobile (Expo)

React Native app alongside the web client. Same backend, token-based join — no account required to play.

**Full rollout status, gaps, and proposed Batches 10+:** [`docs/mobile-rollout.md`](../../docs/mobile-rollout.md)

---

## Quick status (Jul 2026)

| | |
|--|--|
| **Native player screens** | **40 / 40** game types (Batches 1–9) |
| **Store-ready UX** | **No** — MVPs only; host, create, polish, push still missing |
| **Web fallback** | Opens when a type is disabled in `/api/mobile-config` |

What works today: enter code → join → core gameplay for every game type.  
What’s still web-first: **create game, host lobby, leave/edit name, rich finish screens, push notifications, voice chat**, and most visual polish.

---

## Setup

```bash
cd apps/mobile
cp .env.example .env
# EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY (same as web)
# Local API: EXPO_PUBLIC_API_URL=http://localhost:3000
npm install
npm start
```

From repo root:

```bash
npm run mobile
```

Typecheck:

```bash
cd apps/mobile && npm run typecheck
```

---

## Architecture

- **`apps/mobile/`** — Expo Router (`app/index` join, `app/game/[code]`)
- **`packages/shared/`** — `@fateround/shared` types + pure game logic
- **`src/`** — Next.js web + API routes (unchanged)

Player views live in `components/games/*PlayerView.tsx`, registered in `GameRouter.tsx`.

Server feature flags: `GET /api/mobile-config` → `mobileSupportedGames`.

---

## Phase 0 shell (done)

- Join by code, `resumeToken` in `expo-secure-store`
- Supabase realtime on `games` / game tables
- `useGameViewBootstrap` + `useGameTableSync`
- Minimal `JoinScreen`, `LobbyView`, `GameChrome`
- `eas.json` scaffold

---

## Batches 1–9 — player views (done)

All `GameType` values have a registered native player view. See [`docs/mobile-rollout.md`](../../docs/mobile-rollout.md) for the full per-batch table.

Highlights:

- **Batch 2** — 10 poll games via shared `PollPlayerView`
- **Batch 7** — mafia (API state), codewords
- **Batch 8** — monopoly / mahjong phase MVPs; quick_draw guess mode (Drawful still web)
- **Batch 9** — secret_message, hot_seat, custom, anonymous_messages

---

## Next up (Batches 10+)

Not implemented yet — see roadmap in [`docs/mobile-rollout.md`](../../docs/mobile-rollout.md):

1. **Batch 10** — Leave, edit name, header, share link, recent games, toasts
2. **Batch 11** — Create game + host lobby + start
3. **Batch 12** — Finish screens, late join, viewer mode, lifecycle parity
4. **Batch 13** — Push notifications
5. **Batch 14** — Voice chat (LiveKit)
6. **Batch 15+** — Per-game UI polish

---

## Auth model

Same as web: `resumeToken` for players, `hostToken` for host actions.  
Host token helpers exist in `lib/secure-session.ts` but **no host UI** uses them yet.
