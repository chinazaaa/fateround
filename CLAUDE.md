# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start dev server (Next.js with Turbopack)
- `npm run build` — production build
- No test runner or linter is configured

## Architecture

Party game web app with six game modes: Smash Marry Kill, Red Flag / Green Flag, Smash or Pass, Would You Rather, Most Likely To, and Who Said This.

**Stack:** Next.js 16 (App Router), React 19, Supabase (Postgres + Realtime), Tailwind CSS 4, TypeScript.

**Key concepts:**
- **Game** — a room identified by a short code (the `id` column). A host creates it and controls rounds via a `host_token`.
- **Participants** — people being voted on (imported from a list or created when players join).
- **Players** — people playing/voting. In "joiners" mode, joining also creates a participant.
- **Rounds** — each round presents 2–3 participants (or a question) for players to vote on. Rounds have timed deadlines with auto-submit.
- Game types are categorized: **trio games** (SMK — 3 choices), **pair games** (Red Flag/Green Flag, Smash or Pass — 2 choices per person), **question games** (WYR, MLT, Who Said This — different voting mechanics).

**Data flow:** All state lives in Supabase. The frontend polls or subscribes via Supabase Realtime (`supabase_realtime` publication on games, players, rounds, votes). There is no auth — RLS is fully permissive (anon access). Host authorization is done by matching `host_token` in API routes.

**Directory layout:**
- `src/app/` — Next.js pages and API routes
  - `page.tsx` — home/join page
  - `create/` — game creation wizard
  - `host/[code]/` — host dashboard (controls rounds)
  - `game/[code]/` — player view (vote, see results)
  - `history/` — past game results
  - `api/` — REST endpoints for games, participants, players, votes, confessions, quotes
- `src/lib/` — shared logic: game type configs (`game-types.ts`), vote statistics (`vote-stats.ts`), round timing (`round-timing.ts`), question pools, Supabase client
- `src/types/index.ts` — all TypeScript types (Game, Player, Participant, Round, Vote, etc.)
- `src/components/` — React components including UI primitives (`ui/`) and game-specific components
- `supabase/schema.sql` — full database schema (run in Supabase SQL editor)

**Game type system:** `src/lib/game-types.ts` defines `GAME_TYPE_CONFIG` with per-type slot labels, colors, and emoji. Helper functions like `isPairGame()`, `isWouldYouRather()`, `isThreeChoiceGame()` drive conditional logic throughout the app. The vote schema reuses `kiss/marry/kill` columns across all game types — pair games use `pair_assignments` JSONB, WYR uses `wyr_choice`, MLT/WST use `target_player_id`/`target_participant_id`.

## Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
