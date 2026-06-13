# Party Games (Kiss Marry Kill & More)

A real-time multiplayer party game app with 6 game modes. Create a room, share the code, and play with friends.

## Game Modes

- **Smash Marry Kill** -- Pick one to smash, marry, or kill from 3 people
- **Red Flag / Green Flag** -- Rate each person green or red
- **Smash or Pass** -- Quick binary choice on each person
- **Would You Rather** -- Pick between two options (anonymous)
- **Most Likely To** -- Vote for the friend who fits each prompt
- **Who Said This** -- Guess who wrote the anonymous quote

## Features

- Real-time game updates via Supabase Realtime
- 6 distinct game modes with unique voting mechanics
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
- Supabase (Postgres + Realtime)
- Tailwind CSS 4
- TypeScript
- Zod (input validation)

## Getting Started

```bash
pnpm install
cp .env.example .env.local  # Add your Supabase credentials
pnpm dev
```

## Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL` -- Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` -- Supabase anon/public key

## Database Setup

- Run the SQL in `supabase/schema.sql` in your Supabase SQL editor
- Create a storage bucket named "avatars" with public access (for player photos)

## Scripts

- `pnpm dev` -- Start development server
- `pnpm build` -- Production build
- `pnpm start` -- Start production server
