# Fate Round — Mobile (Phase 0)

Expo / React Native app living alongside the web client in the same repo.

## Setup

```bash
cd apps/mobile
cp .env.example .env
# Fill EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY from the web app.
# For local API testing: EXPO_PUBLIC_API_URL=http://localhost:3000
npm install
npm start
```

From repo root:

```bash
npm run mobile
```

## Phase 0 includes

- Join by game code (no sign-in)
- Secure `resumeToken` storage (`expo-secure-store`)
- Supabase realtime sync for `games` + `players`
- Web fallback for unsupported game types
- `/api/mobile-config` server flags (enable native games without store review)
- `packages/shared` — shared types + token helpers
- `eas.json` — build + OTA channels (set EAS project id in `app.json`)

## Batch 1 — native games (5)

Enabled in `/api/mobile-config`:

- `ayo` — tap pits to sow
- `tic_tac_toe` — ultimate 3×3 board grid
- `checkers` — tap piece, tap destination
- `bingo` — card marking + called numbers
- `trivia` — multiple choice per round

All other game types still open the web fallback.

## Auth model

Same as web: token-based join/host. No account required to play.
