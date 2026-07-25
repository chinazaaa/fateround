# FateRound — Mobile (Expo)

React Native app alongside the web client. Same backend, token-based join — no account required to play.

**Full rollout status:** [`docs/mobile-rollout.md`](../../docs/mobile-rollout.md)

---

## Quick status (Jul 2026)

| | |
|--|--|
| **Native player screens** | **40 / 40** game types |
| **Player E2E** | **40 / 40** |
| **Batches 10–17** | **Done** (shell, lifecycle, push, voice, polish, host, Drawful) |
| **Readiness score** | **6 / 7** — only EAS project ID + TestFlight remain |
| **Biggest gap** | **Custom content create** (Batches 21–22) + **host+play lobby UX** (Batch 23) + TestFlight |

What works: join → play → finish → play-again for all types; native create with lobby settings *(Batch 18)*; full host lobby + in-game host + play-along; push + voice on priority games.  
What's still web-first: **custom Q&A & participant import** (Batches 21–22); **host+play from lobby** (Batch 23).

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

- **`apps/mobile/`** — Expo Router (`app/index` join, `app/create`, `app/host/[code]`, `app/game/[code]`)
- **`packages/shared/`** — `@fateround/shared` types + pure game logic
- **`src/`** — Next.js web + API routes (unchanged)

Player views: `components/games/*PlayerView.tsx` → `GameRouter.tsx`.  
Host: `HostGameScreen.tsx` → lobby (`HostLobbyScreen`) or in-game (`HostRouter` + per-game screens).  
Feature flags: `GET /api/mobile-config`.

---

## Done (summary)

| Batch | What |
|-------|------|
| **1–9** | 40 native player views |
| **10** | Session shell, ⋮ menu, rules links, native create, recent games |
| **11** | Host lobby, start game, play again |
| **16** | In-game host dashboard, play-along, bingo auto-call |
| **17** | Drawful canvas, Quick Draw host, poll host results |
| **18** | Create wizard + universal lobby ✅ — max players, late join, visibility, theme |
| **19** | Board & card room settings ✅ — Ludo, chess, Whot, Scrabble, Mahjong, Monopoly, … |
| **20–22** | Party create + custom content + participants *(planned)* |
| **23** | Host + play parity *(planned)* — lobby play-along, spectator mode, play/manage tabs, lobby auto-seat |
| **12** | Lifecycle gates, finish scoreboards, import claim join |
| **13** | Turn push (13+ games), per-game mute, timer haptics |
| **14** | Voice on 14 types, rename sync, background disconnect |
| **15 P0–P3** | Poll/trivia/bingo, boards/cards, party UX, heavy games |

---

## Next up

See [`docs/mobile-rollout.md`](../../docs/mobile-rollout.md) → **TestFlight / EAS project ID**.

---

## Auth model

Same as web: `resumeToken` for players, `hostToken` for host actions (`lib/secure-session.ts`).
