# Party Games (Kiss Marry Kill & More)

A real-time multiplayer party game app with 30+ game modes and built-in voice chat.
Create a room, share the code, and play with friends.

## Game Modes

**Voting & social**

- **Smash Marry Kill** -- Pick one to smash, marry, or kill from 3 people
- **Red Flag / Green Flag** -- Rate each person green or red
- **Smash or Pass** -- Quick binary choice on each person
- **Date My Kid** -- Approve or pass on each candidate
- **Would You Rather** / **This or That** -- Pick between two options (anonymous)
- **Never Have I Ever**, **Most Likely To**, **Who Said This**, **Hot Seat**, **Pick a Number**

**Word, trivia & puzzle**

- **Trivia**, **Two Truths and a Lie**, **Codewords**, **NPAT** (name, place, animal, thing)
- **Scrabble** (English, French, German & Spanish editions), **Word Hunt**, **Sudoku**, **Bingo**, **Text Charades**

**Board & card**

- **Chess**, **Checkers**, **Ludo**, **Snakes & Ladders**, **Tic-Tac-Toe**
- **Whot**, **Crazy Eights**, **Monopoly**, **Yahtzee**

**Anonymous & custom**

- **Anonymous Messages**, **Secret Message**, and **Custom** game modes

Many modes also support **tournaments** (brackets / head-to-head) and **elimination** rounds.

## Features

- Real-time gameplay via Supabase Realtime, with a polling fallback
- Built-in **voice chat** (self-hosted LiveKit)
- 30+ game modes — voting, trivia, word/puzzle, and turn-based board & card games
- Tournaments (bracket & head-to-head) and elimination mode
- Viewers & late-join support
- Player photo uploads for avatars
- Player-submitted questions in lobby
- Anonymous confessions during gameplay
- Timed rounds with auto-submit
- Game history and leaderboards
- Dark/light theme support
- CSV/Excel import for participant lists and custom questions
- Mobile-friendly responsive design

## Tech Stack

- Next.js 16 (App Router)
- React 19
- Supabase (Postgres + Realtime + Storage)
- LiveKit (self-hosted, voice chat)
- Tailwind CSS 4
- TypeScript
- Zod (input validation)

## Getting Started

```bash
pnpm install
cp .env.example .env.local  # fill in your Supabase + LiveKit credentials
pnpm dev
```

## Environment Variables

See `.env.example` for the full list. At minimum:

- `NEXT_PUBLIC_SUPABASE_URL` -- Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` -- Supabase anon/public (publishable) key
- `NEXT_PUBLIC_LIVEKIT_URL` -- LiveKit server URL (voice chat)
- `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` -- LiveKit server credentials

The full per-environment value map (dev vs prod) and where each secret lives is
documented in [docs/environments.md](docs/environments.md).

## Database Setup

The schema is defined entirely by the migrations in `supabase/migrations/`
(`0001_base_schema.sql` plus everything after it). Apply them to a fresh Supabase
project with the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push   # applies every migration in supabase/migrations/ in order
```

That also creates the `avatars` storage bucket and its policies (the base
migration handles it), so there's no manual bucket step.

Once Supabase is connected to GitHub, new migrations apply automatically — on the
preview branch when a PR opens, and on prod when you merge. **Make every schema
change as a new timestamped migration file; never edit the schema in the SQL
Editor** (manual edits aren't tracked and drift the database out of sync). See
[CONTRIBUTING.md](CONTRIBUTING.md) for the full migration conventions.

## Scripts

- `pnpm dev` -- Start development server
- `pnpm build` -- Production build
- `pnpm start` -- Start production server
- `pnpm lint` -- Run ESLint
- `pnpm format:check` -- Check Prettier formatting
- `pnpm format` -- Auto-format with Prettier
- `pnpm typecheck` -- Run TypeScript type checking
