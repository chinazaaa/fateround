# FateRound

A real-time multiplayer party game platform with **49 game modes**, built-in voice chat, daily
puzzles, tournaments, trophies and persistent rooms. Create a room, share the code, and play —
no sign-up, on the web or in the native app.

The repository holds two clients over one backend:

| Surface | Path | Stack |
|---|---|---|
| **Web app** | `src/` | Next.js 16 (App Router) · React 19 · Tailwind 4 |
| **Mobile app** | `apps/mobile/` | Expo (React Native) · expo-router · EAS |
| **Shared game logic** | `packages/shared/` | TypeScript, consumed by the mobile app |
| **Database** | `supabase/migrations/` | Postgres + Realtime + Storage |

## Game modes

**Party & social** (16) — Smash Marry Kill · Red Flag / Green Flag · Smash or Pass ·
Would You Rather · Never Have I Ever · Pick a Number · This or That · Most Likely To ·
Hot Seat · Custom Game · Anonymous Room · Secret Message · Two Truths & a Lie ·
Date My Kid · I Call On (NPAT) · Mafia

**Guessing & teams** (6) — Who Said This · Codewords · Trivia · Text Charades ·
Punchline (Quiplash-style) · Quick Draw (draw-and-fool *or* draw-and-race)

**Puzzle & word** (13) — Bingo · Five Dice (Yahtzee) · Sudoku · Word Hunt · Matching Pairs ·
Word Rush · Crossword · Word Search · Word Scramble · Landmine · Word Grouping ·
Wordle · Troll Run

**Board** (11) — Estate Kings (property trading) · Ludo · Mahjong · Tic-Tac-Toe ·
Chess · Word Tiles (Scrabble-style, EN/FR/DE/ES dictionaries) · Snake & Ladder ·
Checkers: American / International / Nigeria · Ayo (Yoruba mancala)

**Cards** (3) — Whot · Crazy Eights · Match Up

The canonical list is the `GameType` union in `packages/shared/src/types.ts`;
`src/lib/game-type-coverage.test.ts` fails CI if a game is only half-wired.

## Features

**Playing together**

- Real-time gameplay via Supabase Realtime, with a polling fallback and an always-on
  server-side ticker (`src/lib/game-tick.ts`) so clocks keep moving with every tab closed
- Built-in **voice chat** (self-hosted LiveKit)
- Viewers, late-join, host transfer, and host-plays-along modes
- **Tournaments** — brackets, head-to-head, knockout, round-robin, plus a school
  championship format, reminders and CSV export
- **Persistent rooms** — a standing room for a friend group, with points, scheduled games and RSVPs
- **Elimination** mode across many game types
- **Bots in room** — fill empty seats so a crew of two can play a four-player game (Whot and
  Estate Kings today)
- **Practice vs bot** — single-player screens for Whot, Match Up, Crazy Eights, Ludo, Ayo and
  Five Dice, on web and mobile

**Progression & discovery**

- **Daily challenges** — 13 puzzles, one per day, same for everyone, with their own leaderboards
- **Trophies & streaks** — per-game system trophies plus admin-authored ones, earned from facts
  derived at finish
- Leaderboards: daily, all-time trophy points, and the community board
- Public game **browse**, a question **library**, and admin-curated **collections**
- Player profiles and public profile pages
- Game history, rematch history and shareable result cards

**Hosting**

- Player photo uploads, player-submitted questions, anonymous confessions during play
- Timed rounds with auto-submit; per-game turn timers
- AI-generated questions, plus CSV/Excel import for participants and custom questions
- Themes (per-game cosmetic editions), dark/light mode
- Web push and mobile push notifications, with quiet hours
- Scheduled games and shareable invite links / QR codes

## Repo layout

```
src/                     Next.js web app (App Router)
  app/                     routes + API routes
  components/              per-game views, shared UI
  lib/                     game engines, scoring, trophies, SEO
apps/mobile/             Expo app (its own package.json / lockfile)
packages/shared/         game logic shared with mobile
supabase/migrations/     the only source of schema truth
scripts/og/              Open Graph card template + render notes
docs/                    plans, audits, checklists
```

## Getting started

```bash
pnpm install
cp .env.example .env.local  # fill in your Supabase + LiveKit credentials
pnpm dev
```

For the mobile app:

```bash
cd apps/mobile && npm install   # separate lockfile, not part of the pnpm workspace install
pnpm mobile                     # from the repo root: starts Expo
```

Requires **Node >= 24** and pnpm 10.

## Environment variables

See `.env.example` for the full list. At minimum:

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public (publishable) key
- `NEXT_PUBLIC_LIVEKIT_URL` — LiveKit server URL (voice chat)
- `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` — LiveKit server credentials

The full per-environment value map (dev vs prod) and where each secret lives is documented in
[docs/environments.md](docs/environments.md).

## Database setup

The schema is defined entirely by the migrations in `supabase/migrations/`
(`0001_base_schema.sql` plus everything after it). Apply them to a fresh Supabase project with
the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push   # applies every migration in supabase/migrations/ in order
```

That also creates the `avatars` storage bucket and its policies (the base migration handles it),
so there's no manual bucket step.

Once Supabase is connected to GitHub, new migrations apply automatically — on the preview branch
when a PR opens, and on prod when you merge. **Make every schema change as a new timestamped
migration file; never edit the schema in the SQL Editor** (manual edits aren't tracked and drift
the database out of sync). See [CONTRIBUTING.md](CONTRIBUTING.md) for the full conventions.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start the web dev server |
| `pnpm build` | Production build |
| `pnpm start` | Start the production server |
| `pnpm test` | Run the Vitest suite |
| `pnpm lint` / `pnpm lint:fix` | ESLint |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm typecheck` | TypeScript (web) |
| `pnpm mobile` | Start Expo for the mobile app |
| `pnpm mobile:typecheck` | TypeScript (mobile) |
| `pnpm indexnow:submit` | Submit the live sitemap's URLs to IndexNow after a deploy |

## Adding a game

Read [docs/new-game-checklist.md](docs/new-game-checklist.md) first — a game touches ~22 files
across registries, views, API routes, landing content and migrations, and the checklist is what
keeps one from shipping half-wired. Then do the mobile half:
[docs/mobile-game-checklist.md](docs/mobile-game-checklist.md).

Several CI tests exist purely to catch a partly-wired game — landing content and rules, view
registries, the turn ticker, community leaderboard boards, Open Graph art and the mobile config
all have coverage guards. `pnpm test` before opening a PR.
