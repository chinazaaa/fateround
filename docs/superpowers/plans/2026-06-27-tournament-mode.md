# Tournament Mode (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tournament system where a host creates a multi-game competition, players join with a code, play trivia games in sequence, earn placement-based points, and compete on a running leaderboard.

**Architecture:** Three new DB tables (`tournaments`, `tournament_players`, `tournament_games`) plus a nullable `tournament_id` FK on `games`. The tournament layer wraps existing games — games don't know they're in a tournament. When a tournament game finishes, a placement adapter computes rankings from the game's scoring data and awards points. Phase 1 supports trivia only; Phase 2 will add 12 more game types.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (Postgres + Realtime), Tailwind CSS 4, TypeScript, Zod.

## Global Constraints

- No test runner — verify via `npx tsc --noEmit` and `npm run build` (compilation success is sufficient; the build will fail at data collection due to missing env vars — that's pre-existing and expected).
- No auth — RLS is fully permissive (anon access). Host authorization via `host_token` matching.
- All DB field names use `snake_case`. TypeScript interfaces mirror DB column names.
- Use `sanitizedString()`, `gameCodeString()`, `hostTokenString()` from `src/lib/validation.ts` for Zod schemas.
- Use `generateGameCode()` and `generateToken()` from `src/lib/utils.ts`.
- API responses follow `{ success: true }` or `{ error: string }` pattern with appropriate HTTP status codes.
- Supabase client in API routes: `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)` at module level.
- Format all files with `npx prettier --write <file>` before committing.
- Do NOT add `Co-Authored-By` or `Generated with Claude Code` to commits.

## File Structure

**Create:**
- `supabase/migrations/088_tournaments.sql` — DB migration: 3 tables, FK, RLS, realtime
- `src/types/tournament.ts` — Tournament, TournamentPlayer, TournamentGame interfaces
- `src/lib/tournament-validation.ts` — Zod schemas for tournament API inputs
- `src/lib/tournament-scoring.ts` — `computePlacementPoints()`, `computeTriviaPlacements()`
- `src/app/api/tournaments/route.ts` — POST: create tournament
- `src/app/api/tournaments/[code]/route.ts` — GET: tournament state, PATCH: update settings
- `src/app/api/tournaments/[code]/players/route.ts` — POST: join tournament
- `src/app/api/tournaments/[code]/games/route.ts` — POST: add next game
- `src/app/api/tournaments/[code]/finish/route.ts` — POST: end tournament
- `src/app/tournament/create/page.tsx` — Tournament creation page
- `src/app/tournament/[code]/page.tsx` — Tournament lobby/hub page
- `src/hooks/useTournamentRealtime.ts` — Realtime subscriptions for tournament tables

**Modify:**
- `src/app/api/games/[code]/finish-game/route.ts` — Hook tournament placement computation after `markGameFinished()`
- `src/app/game/[code]/page.tsx` — Add "Back to Tournament" link when game has `tournament_id`

---

### Task 1: DB Migration + TypeScript Types

**Files:**
- Create: `supabase/migrations/088_tournaments.sql`
- Create: `src/types/tournament.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Tournament`, `TournamentPlayer`, `TournamentGame` interfaces used by all subsequent tasks. DB tables used by all API routes.

- [ ] **Step 1: Create the DB migration**

Create `supabase/migrations/088_tournaments.sql`:

```sql
-- Tournament mode tables

create table if not exists tournaments (
  id text primary key,
  host_token text not null,
  title text not null,
  status text not null default 'waiting',
  placement_points jsonb not null default '[10, 7, 5, 3, 2, 1]'::jsonb,
  target_game_count integer,
  created_at timestamptz default now()
);

create table if not exists tournament_players (
  id uuid primary key default gen_random_uuid(),
  tournament_id text not null references tournaments(id) on delete cascade,
  player_name text not null,
  total_points integer not null default 0,
  games_played integer not null default 0,
  joined_at timestamptz default now(),
  unique (tournament_id, player_name)
);

create index if not exists idx_tournament_players_tournament
  on tournament_players(tournament_id);

create table if not exists tournament_games (
  id uuid primary key default gen_random_uuid(),
  tournament_id text not null references tournaments(id) on delete cascade,
  game_id text not null references games(id) on delete cascade,
  game_order integer not null,
  status text not null default 'pending',
  placements jsonb,
  unique (tournament_id, game_order)
);

create index if not exists idx_tournament_games_tournament
  on tournament_games(tournament_id);

alter table games add column if not exists tournament_id text references tournaments(id);

-- RLS (fully permissive, matching existing pattern)
alter table tournaments enable row level security;
create policy "tournaments_all" on tournaments for all using (true) with check (true);

alter table tournament_players enable row level security;
create policy "tournament_players_all" on tournament_players for all using (true) with check (true);

alter table tournament_games enable row level security;
create policy "tournament_games_all" on tournament_games for all using (true) with check (true);

-- Realtime
alter publication supabase_realtime add table tournaments;
alter publication supabase_realtime add table tournament_players;
alter publication supabase_realtime add table tournament_games;
```

- [ ] **Step 2: Create TypeScript types**

Create `src/types/tournament.ts`:

```typescript
export interface Tournament {
  id: string
  host_token: string
  title: string
  status: 'waiting' | 'active' | 'finished'
  placement_points: number[]
  target_game_count: number | null
  created_at: string
}

export interface TournamentPlayer {
  id: string
  tournament_id: string
  player_name: string
  total_points: number
  games_played: number
  joined_at: string
}

export interface TournamentGame {
  id: string
  tournament_id: string
  game_id: string
  game_order: number
  status: 'pending' | 'active' | 'finished'
  placements: Record<string, number> | null
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors from the new files.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/088_tournaments.sql src/types/tournament.ts
git commit -m "feat(tournament): add DB migration and TypeScript types"
```

---

### Task 2: Validation Schemas + Tournament CRUD API

**Files:**
- Create: `src/lib/tournament-validation.ts`
- Create: `src/app/api/tournaments/route.ts`
- Create: `src/app/api/tournaments/[code]/route.ts`

**Interfaces:**
- Consumes: `Tournament`, `TournamentPlayer`, `TournamentGame` from `src/types/tournament.ts`. `generateGameCode()`, `generateToken()` from `src/lib/utils.ts`. `sanitizedString()`, `hostTokenString()` from `src/lib/validation.ts`.
- Produces: `createTournamentSchema`, `updateTournamentSchema` Zod schemas. `POST /api/tournaments` endpoint returning `{ tournamentCode, hostToken }`. `GET /api/tournaments/[code]` returning full tournament state. `PATCH /api/tournaments/[code]` for settings updates.

- [ ] **Step 1: Create validation schemas**

Create `src/lib/tournament-validation.ts`:

```typescript
import { z } from 'zod/v4'
import { sanitizedString, hostTokenString } from './validation'

export const createTournamentSchema = z.object({
  title: sanitizedString(1, 100),
  placementPoints: z
    .array(z.number().int().min(0))
    .min(1)
    .max(20)
    .optional(),
  targetGameCount: z.coerce.number().int().min(1).max(100).optional().nullable(),
})

export const updateTournamentSchema = z.object({
  hostToken: hostTokenString(),
  title: sanitizedString(1, 100).optional(),
  placementPoints: z
    .array(z.number().int().min(0))
    .min(1)
    .max(20)
    .optional(),
  targetGameCount: z.coerce.number().int().min(1).max(100).optional().nullable(),
})

export const joinTournamentSchema = z.object({
  playerName: sanitizedString(1, 50),
})

export const tournamentHostActionSchema = z.object({
  hostToken: hostTokenString(),
})

export const addTournamentGameSchema = z.object({
  hostToken: hostTokenString(),
  gameType: z.string().min(1),
  gameSettings: z
    .object({
      rounds_count: z.coerce.number().int().min(1).max(100).optional(),
      timer_seconds: z.coerce.number().optional(),
    })
    .optional(),
})

export const TOURNAMENT_ELIGIBLE_TYPES = [
  'trivia',
  'scrabble',
  'yahtzee',
  'ludo',
  'whot',
  'monopoly',
  'word-hunt',
  'i-call-on',
  'chess',
  'bingo',
  'who-said-this',
  'describe-it',
  'codewords',
] as const
```

- [ ] **Step 2: Create POST /api/tournaments**

Create `src/app/api/tournaments/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateGameCode, generateToken } from '@/lib/utils'
import { createTournamentSchema } from '@/lib/tournament-validation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = createTournamentSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    )
  }

  const { title, placementPoints, targetGameCount } = parsed.data
  const hostToken = generateToken()

  let tournamentCode = ''
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateGameCode()
    const { data: existing } = await supabase
      .from('tournaments')
      .select('id')
      .eq('id', candidate)
      .maybeSingle()
    if (!existing) {
      tournamentCode = candidate
      break
    }
  }

  if (!tournamentCode) {
    return NextResponse.json(
      { error: 'Failed to generate unique code' },
      { status: 500 }
    )
  }

  const { error } = await supabase.from('tournaments').insert({
    id: tournamentCode,
    host_token: hostToken,
    title,
    placement_points: placementPoints ?? [10, 7, 5, 3, 2, 1],
    target_game_count: targetGameCount ?? null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ tournamentCode, hostToken })
}
```

- [ ] **Step 3: Create GET + PATCH /api/tournaments/[code]**

Create `src/app/api/tournaments/[code]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { updateTournamentSchema } from '@/lib/tournament-validation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const { data: tournament, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournamentId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })

  const [playersRes, gamesRes] = await Promise.all([
    supabase
      .from('tournament_players')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('total_points', { ascending: false }),
    supabase
      .from('tournament_games')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('game_order', { ascending: true }),
  ])

  return NextResponse.json({
    tournament,
    players: playersRes.data ?? [],
    games: gamesRes.data ?? [],
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const raw = await req.json()
  const parsed = updateTournamentSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    )
  }

  const { hostToken, title, placementPoints, targetGameCount } = parsed.data

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('host_token')
    .eq('id', tournamentId)
    .maybeSingle()

  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  if (tournament.host_token !== hostToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const updates: Record<string, unknown> = {}
  if (title !== undefined) updates.title = title
  if (placementPoints !== undefined) updates.placement_points = placementPoints
  if (targetGameCount !== undefined) updates.target_game_count = targetGameCount

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from('tournaments')
      .update(updates)
      .eq('id', tournamentId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write src/lib/tournament-validation.ts src/app/api/tournaments/route.ts src/app/api/tournaments/\[code\]/route.ts
git add src/lib/tournament-validation.ts src/app/api/tournaments/
git commit -m "feat(tournament): add validation schemas and CRUD API routes"
```

---

### Task 3: Player Join + Game Creation + Finish API Routes

**Files:**
- Create: `src/app/api/tournaments/[code]/players/route.ts`
- Create: `src/app/api/tournaments/[code]/games/route.ts`
- Create: `src/app/api/tournaments/[code]/finish/route.ts`

**Interfaces:**
- Consumes: `joinTournamentSchema`, `addTournamentGameSchema`, `tournamentHostActionSchema`, `TOURNAMENT_ELIGIBLE_TYPES` from `src/lib/tournament-validation.ts`. `generateGameCode()`, `generateToken()` from `src/lib/utils.ts`.
- Produces: `POST /api/tournaments/[code]/players` returning `{ player }`. `POST /api/tournaments/[code]/games` returning `{ gameCode }`. `POST /api/tournaments/[code]/finish` returning `{ success: true }`.

- [ ] **Step 1: Create player join route**

Create `src/app/api/tournaments/[code]/players/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { joinTournamentSchema } from '@/lib/tournament-validation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const raw = await req.json()
  const parsed = joinTournamentSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    )
  }

  const { playerName } = parsed.data

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, status')
    .eq('id', tournamentId)
    .maybeSingle()

  if (!tournament) {
    return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  }
  if (tournament.status === 'finished') {
    return NextResponse.json({ error: 'Tournament has ended' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('tournament_players')
    .select('id')
    .eq('tournament_id', tournamentId)
    .ilike('player_name', playerName)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Name already taken' }, { status: 409 })
  }

  const { data: player, error } = await supabase
    .from('tournament_players')
    .insert({
      tournament_id: tournamentId,
      player_name: playerName,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ player })
}
```

- [ ] **Step 2: Create game addition route**

Create `src/app/api/tournaments/[code]/games/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateGameCode, generateToken } from '@/lib/utils'
import {
  addTournamentGameSchema,
  TOURNAMENT_ELIGIBLE_TYPES,
} from '@/lib/tournament-validation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const raw = await req.json()
  const parsed = addTournamentGameSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    )
  }

  const { hostToken, gameType, gameSettings } = parsed.data

  if (
    !TOURNAMENT_ELIGIBLE_TYPES.includes(
      gameType as (typeof TOURNAMENT_ELIGIBLE_TYPES)[number]
    )
  ) {
    return NextResponse.json(
      { error: `Game type "${gameType}" is not eligible for tournaments` },
      { status: 400 }
    )
  }

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournamentId)
    .maybeSingle()

  if (!tournament) {
    return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  }
  if (tournament.host_token !== hostToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  if (tournament.status === 'finished') {
    return NextResponse.json({ error: 'Tournament has ended' }, { status: 400 })
  }

  const { data: activeGame } = await supabase
    .from('tournament_games')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('status', 'active')
    .maybeSingle()

  if (activeGame) {
    return NextResponse.json(
      { error: 'A game is already in progress' },
      { status: 400 }
    )
  }

  let gameCode = ''
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateGameCode()
    const { data: existing } = await supabase
      .from('games')
      .select('id')
      .eq('id', candidate)
      .maybeSingle()
    if (!existing) {
      gameCode = candidate
      break
    }
  }

  if (!gameCode) {
    return NextResponse.json(
      { error: 'Failed to generate unique game code' },
      { status: 500 }
    )
  }

  const gameHostToken = generateToken()

  const { error: gameError } = await supabase.from('games').insert({
    id: gameCode,
    host_token: gameHostToken,
    title: `${tournament.title} - Game`,
    game_type: gameType,
    rounds_count: gameSettings?.rounds_count ?? 10,
    timer_seconds: gameSettings?.timer_seconds ?? 30,
    tournament_id: tournamentId,
  })

  if (gameError) {
    return NextResponse.json({ error: gameError.message }, { status: 500 })
  }

  const { data: lastGame } = await supabase
    .from('tournament_games')
    .select('game_order')
    .eq('tournament_id', tournamentId)
    .order('game_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrder = (lastGame?.game_order ?? 0) + 1

  const { error: tgError } = await supabase.from('tournament_games').insert({
    tournament_id: tournamentId,
    game_id: gameCode,
    game_order: nextOrder,
    status: 'active',
  })

  if (tgError) {
    return NextResponse.json({ error: tgError.message }, { status: 500 })
  }

  if (tournament.status === 'waiting') {
    await supabase
      .from('tournaments')
      .update({ status: 'active' })
      .eq('id', tournamentId)
  }

  return NextResponse.json({ gameCode, gameHostToken })
}
```

- [ ] **Step 3: Create tournament finish route**

Create `src/app/api/tournaments/[code]/finish/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { tournamentHostActionSchema } from '@/lib/tournament-validation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const raw = await req.json()
  const parsed = tournamentHostActionSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    )
  }

  const { hostToken } = parsed.data

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('host_token, status')
    .eq('id', tournamentId)
    .maybeSingle()

  if (!tournament) {
    return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  }
  if (tournament.host_token !== hostToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  if (tournament.status === 'finished') {
    return NextResponse.json({ error: 'Tournament already finished' }, { status: 400 })
  }

  await supabase
    .from('tournament_games')
    .update({ status: 'finished' })
    .eq('tournament_id', tournamentId)
    .eq('status', 'active')

  const { error } = await supabase
    .from('tournaments')
    .update({ status: 'finished' })
    .eq('id', tournamentId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write src/app/api/tournaments/\[code\]/players/route.ts src/app/api/tournaments/\[code\]/games/route.ts src/app/api/tournaments/\[code\]/finish/route.ts
git add src/app/api/tournaments/\[code\]/players/ src/app/api/tournaments/\[code\]/games/ src/app/api/tournaments/\[code\]/finish/
git commit -m "feat(tournament): add player join, game creation, and finish API routes"
```

---

### Task 4: Placement Adapter + Finish-Game Integration

**Files:**
- Create: `src/lib/tournament-scoring.ts`
- Modify: `src/app/api/games/[code]/finish-game/route.ts`

**Interfaces:**
- Consumes: `tallyTriviaPlayerScores(answers: TriviaAnswer[], players: Player[]): TriviaPlayerScore[]` from `src/lib/trivia.ts`. `TriviaAnswer` and `Player` from `src/types/index.ts`. `TournamentGame` from `src/types/tournament.ts`.
- Produces: `computePlacementPoints(placements: Record<string, number>, pointsArray: number[]): Record<string, number>` — maps tournament_player_id to points earned. `computeTriviaPlacements(supabase, gameId, playerMap): Record<string, number>` — maps tournament_player_id to rank. `awardTournamentPlacements(supabase, gameId): void` — full integration function called from finish-game.

- [ ] **Step 1: Create tournament scoring module**

Create `src/lib/tournament-scoring.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import { tallyTriviaPlayerScores } from './trivia'
import type { TriviaAnswer, Player } from '@/types'

type SupabaseClient = ReturnType<typeof createClient>

export function computePlacementPoints(
  placements: Record<string, number>,
  pointsArray: number[]
): Record<string, number> {
  const fallback = pointsArray[pointsArray.length - 1] ?? 0
  const result: Record<string, number> = {}
  for (const [playerId, rank] of Object.entries(placements)) {
    result[playerId] = pointsArray[rank - 1] ?? fallback
  }
  return result
}

async function computeTriviaPlacements(
  supabase: SupabaseClient,
  gameId: string,
  playerMap: Map<string, string>
): Promise<Record<string, number>> {
  const [answersRes, playersRes] = await Promise.all([
    supabase.from('trivia_answers').select('*').eq('game_id', gameId),
    supabase.from('players').select('*').eq('game_id', gameId),
  ])

  const answers = (answersRes.data ?? []) as TriviaAnswer[]
  const players = (playersRes.data ?? []) as Player[]

  const scores = tallyTriviaPlayerScores(answers, players)

  const placements: Record<string, number> = {}
  let rank = 1
  for (let i = 0; i < scores.length; i++) {
    if (i > 0 && scores[i].score < scores[i - 1].score) {
      rank = i + 1
    }
    const tournamentPlayerId = playerMap.get(scores[i].id)
    if (tournamentPlayerId) {
      placements[tournamentPlayerId] = rank
    }
  }

  return placements
}

export async function awardTournamentPlacements(
  supabase: SupabaseClient,
  gameId: string
): Promise<void> {
  const { data: game } = await supabase
    .from('games')
    .select('tournament_id, game_type')
    .eq('id', gameId)
    .maybeSingle()

  if (!game?.tournament_id) return

  const tournamentId = game.tournament_id

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('placement_points')
    .eq('id', tournamentId)
    .maybeSingle()

  if (!tournament) return

  const { data: gamePlayers } = await supabase
    .from('players')
    .select('id, name')
    .eq('game_id', gameId)

  const { data: tournamentPlayers } = await supabase
    .from('tournament_players')
    .select('id, player_name')
    .eq('tournament_id', tournamentId)

  if (!gamePlayers?.length || !tournamentPlayers?.length) {
    await supabase
      .from('tournament_games')
      .update({ status: 'finished', placements: {} })
      .eq('tournament_id', tournamentId)
      .eq('game_id', gameId)
    return
  }

  const playerMap = new Map<string, string>()
  for (const gp of gamePlayers) {
    const tp = tournamentPlayers.find(
      (t) => t.player_name.toLowerCase() === gp.name.toLowerCase()
    )
    if (tp) playerMap.set(gp.id, tp.id)
  }

  let placements: Record<string, number> = {}

  const gameType = game.game_type?.toLowerCase() ?? ''
  if (gameType === 'trivia') {
    placements = await computeTriviaPlacements(supabase, gameId, playerMap)
  }

  if (Object.keys(placements).length === 0) {
    await supabase
      .from('tournament_games')
      .update({ status: 'finished', placements: {} })
      .eq('tournament_id', tournamentId)
      .eq('game_id', gameId)
    return
  }

  const points = computePlacementPoints(
    placements,
    tournament.placement_points as number[]
  )

  await supabase
    .from('tournament_games')
    .update({ status: 'finished', placements })
    .eq('tournament_id', tournamentId)
    .eq('game_id', gameId)

  for (const [tpId, earned] of Object.entries(points)) {
    await supabase.rpc('increment_tournament_points', {
      p_player_id: tpId,
      p_points: earned,
    })
  }

  const { data: tournamentState } = await supabase
    .from('tournaments')
    .select('target_game_count')
    .eq('id', tournamentId)
    .maybeSingle()

  if (tournamentState?.target_game_count) {
    const { count } = await supabase
      .from('tournament_games')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .eq('status', 'finished')

    if (count && count >= tournamentState.target_game_count) {
      await supabase
        .from('tournaments')
        .update({ status: 'finished' })
        .eq('id', tournamentId)
    }
  }
}
```

- [ ] **Step 2: Add the RPC function to the migration**

Append to `supabase/migrations/088_tournaments.sql`:

```sql
-- Atomic point increment
create or replace function increment_tournament_points(
  p_player_id uuid,
  p_points integer
) returns void as $$
begin
  update tournament_players
  set total_points = total_points + p_points,
      games_played = games_played + 1
  where id = p_player_id;
end;
$$ language plpgsql;
```

- [ ] **Step 3: Hook into finish-game route**

Modify `src/app/api/games/[code]/finish-game/route.ts`. Add the import at the top of the file alongside existing imports:

```typescript
import { awardTournamentPlacements } from '@/lib/tournament-scoring'
```

Then add the tournament hook after the `markGameFinished()` call (just before the final `return NextResponse.json({ success: true })`). Find this block near the end of the file:

```typescript
  const { error } = await markGameFinished(supabase, gameId, now)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
```

Replace it with:

```typescript
  const { error } = await markGameFinished(supabase, gameId, now)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    await awardTournamentPlacements(supabase, gameId)
  } catch {
    // Tournament scoring is best-effort — never block game finish
  }

  return NextResponse.json({ success: true })
```

Note: The game-type-specific finish paths (anonymous, secret message, codewords, monopoly) each have their own early `return` before reaching `markGameFinished()`. Those game types are not tournament-eligible in Phase 1, so we only need the hook on the default path. If those types become eligible in Phase 2, their paths will need the same hook.

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write src/lib/tournament-scoring.ts src/app/api/games/\[code\]/finish-game/route.ts
git add src/lib/tournament-scoring.ts src/app/api/games/\[code\]/finish-game/route.ts supabase/migrations/088_tournaments.sql
git commit -m "feat(tournament): add trivia placement adapter and finish-game hook"
```

---

### Task 5: Tournament Create Page

**Files:**
- Create: `src/app/tournament/create/page.tsx`

**Interfaces:**
- Consumes: `POST /api/tournaments` returning `{ tournamentCode, hostToken }`. `TOURNAMENT_ELIGIBLE_TYPES` from `src/lib/tournament-validation.ts`.
- Produces: `/tournament/create` page. On success, redirects to `/tournament/[code]` and stores `hostToken` in `localStorage` under key `tournament_host_[CODE]`.

- [ ] **Step 1: Create the tournament create page**

Create `src/app/tournament/create/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const DEFAULT_POINTS = [10, 7, 5, 3, 2, 1]

export default function TournamentCreatePage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [targetGameCount, setTargetGameCount] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!title.trim()) {
      setError('Enter a tournament title')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        placementPoints: DEFAULT_POINTS,
      }
      const count = parseInt(targetGameCount, 10)
      if (!isNaN(count) && count > 0) {
        body.targetGameCount = count
      }

      const res = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to create tournament')
        return
      }

      localStorage.setItem(
        `tournament_host_${data.tournamentCode}`,
        data.hostToken
      )
      router.push(`/tournament/${data.tournamentCode}`)
    } catch {
      setError('Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-6 space-y-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black text-heading">Create Tournament</h1>
          <p className="text-muted text-sm">
            Set up a multi-game competition for your group
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-body mb-1">
              Tournament Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Friday Game Night"
              maxLength={100}
              className="w-full rounded-xl border border-theme bg-surface px-4 py-3 text-body placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-body mb-1">
              Target Games (optional)
            </label>
            <input
              type="number"
              value={targetGameCount}
              onChange={(e) => setTargetGameCount(e.target.value)}
              placeholder="Leave empty for unlimited"
              min={1}
              max={100}
              className="w-full rounded-xl border border-theme bg-surface px-4 py-3 text-body placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <p className="text-faint text-xs mt-1">
              Tournament ends after this many games, or you can end it manually
            </p>
          </div>

          <div className="glass-card p-4 space-y-2">
            <p className="text-sm font-medium text-body">Placement Points</p>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_POINTS.map((pts, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent"
                >
                  {i + 1}
                  {i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'}:{' '}
                  {pts}pts
                </span>
              ))}
              <span className="inline-flex items-center rounded-full bg-surface-inset px-3 py-1 text-xs text-faint">
                7th+: 1pt
              </span>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}

        <button
          onClick={handleCreate}
          disabled={submitting}
          className="w-full rounded-2xl bg-accent px-6 py-4 text-lg font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create Tournament'}
        </button>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Format and commit**

```bash
npx prettier --write src/app/tournament/create/page.tsx
git add src/app/tournament/create/
git commit -m "feat(tournament): add tournament creation page"
```

---

### Task 6: Tournament Lobby Page + Realtime

**Files:**
- Create: `src/hooks/useTournamentRealtime.ts`
- Create: `src/app/tournament/[code]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/tournaments/[code]` returning `{ tournament, players, games }`. `POST /api/tournaments/[code]/players` returning `{ player }`. `POST /api/tournaments/[code]/games` returning `{ gameCode, gameHostToken }`. `POST /api/tournaments/[code]/finish` returning `{ success: true }`. `Tournament`, `TournamentPlayer`, `TournamentGame` from `src/types/tournament.ts`. `TOURNAMENT_ELIGIBLE_TYPES` from `src/lib/tournament-validation.ts`.
- Produces: `/tournament/[code]` page with join form, player list, host controls (game picker, start game, end tournament), leaderboard, and game status.

- [ ] **Step 1: Create realtime hook**

Create `src/hooks/useTournamentRealtime.ts`:

```typescript
'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export function useTournamentRealtime(
  tournamentId: string,
  onUpdate: () => void
) {
  useEffect(() => {
    if (!tournamentId) return

    const channel = supabase
      .channel(`tournament-${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tournaments',
          filter: `id=eq.${tournamentId}`,
        },
        onUpdate
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tournament_players',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        onUpdate
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tournament_games',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        onUpdate
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tournamentId, onUpdate])
}
```

- [ ] **Step 2: Create tournament lobby page**

Create `src/app/tournament/[code]/page.tsx`:

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTournamentRealtime } from '@/hooks/useTournamentRealtime'
import type { Tournament, TournamentPlayer, TournamentGame } from '@/types/tournament'
import { TOURNAMENT_ELIGIBLE_TYPES } from '@/lib/tournament-validation'

const GAME_TYPE_LABELS: Record<string, string> = {
  trivia: 'Trivia',
  scrabble: 'Scrabble',
  yahtzee: 'Yahtzee',
  ludo: 'Ludo',
  whot: 'Whot',
  monopoly: 'Monopoly',
  'word-hunt': 'Word Hunt',
  'i-call-on': 'I Call On',
  chess: 'Chess',
  bingo: 'Bingo',
  'who-said-this': 'Who Said This',
  'describe-it': 'Describe It',
  codewords: 'Codewords',
}

export default function TournamentLobbyPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const tournamentId = (Array.isArray(code) ? code[0] : code).toUpperCase()

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [players, setPlayers] = useState<TournamentPlayer[]>([])
  const [games, setGames] = useState<TournamentGame[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [playerName, setPlayerName] = useState('')
  const [joined, setJoined] = useState(false)
  const [joinError, setJoinError] = useState('')

  const [selectedGameType, setSelectedGameType] = useState('trivia')
  const [roundsCount, setRoundsCount] = useState('10')
  const [timerSeconds, setTimerSeconds] = useState('30')
  const [actionLoading, setActionLoading] = useState(false)

  const hostToken =
    typeof window !== 'undefined'
      ? localStorage.getItem(`tournament_host_${tournamentId}`)
      : null
  const isHost = Boolean(hostToken)

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}`)
      if (!res.ok) {
        setError('Tournament not found')
        return
      }
      const data = await res.json()
      setTournament(data.tournament)
      setPlayers(data.players)
      setGames(data.games)
    } catch {
      setError('Failed to load tournament')
    } finally {
      setLoading(false)
    }
  }, [tournamentId])

  useEffect(() => {
    fetchState()
  }, [fetchState])

  useTournamentRealtime(tournamentId, fetchState)

  useEffect(() => {
    const savedName = localStorage.getItem(
      `tournament_player_${tournamentId}`
    )
    if (savedName) {
      setPlayerName(savedName)
      setJoined(true)
    }
  }, [tournamentId])

  async function handleJoin() {
    if (!playerName.trim()) return
    setJoinError('')

    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName: playerName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setJoinError(data.error ?? 'Failed to join')
        return
      }
      localStorage.setItem(
        `tournament_player_${tournamentId}`,
        playerName.trim()
      )
      setJoined(true)
      fetchState()
    } catch {
      setJoinError('Something went wrong')
    }
  }

  async function handleStartGame() {
    if (!hostToken) return
    setActionLoading(true)

    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostToken,
          gameType: selectedGameType,
          gameSettings: {
            rounds_count: parseInt(roundsCount, 10) || 10,
            timer_seconds: parseInt(timerSeconds, 10) || 30,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to start game')
        return
      }
      localStorage.setItem(
        `host_token_${data.gameCode}`,
        data.gameHostToken
      )
      fetchState()
    } catch {
      setError('Something went wrong')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleEndTournament() {
    if (!hostToken) return
    setActionLoading(true)

    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to end tournament')
      }
      fetchState()
    } catch {
      setError('Something went wrong')
    } finally {
      setActionLoading(false)
    }
  }

  function handleJoinGame(gameCode: string) {
    const name = localStorage.getItem(`tournament_player_${tournamentId}`)
    if (name) {
      router.push(`/game/${gameCode}?name=${encodeURIComponent(name)}&tournament=${tournamentId}`)
    } else {
      router.push(`/game/${gameCode}`)
    }
  }

  if (loading) {
    return (
      <main className="min-h-dvh flex items-center justify-center">
        <p className="text-muted">Loading tournament...</p>
      </main>
    )
  }

  if (error && !tournament) {
    return (
      <main className="min-h-dvh flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </main>
    )
  }

  if (!tournament) return null

  const activeGame = games.find((g) => g.status === 'active')
  const finishedGames = games.filter((g) => g.status === 'finished')
  const isFinished = tournament.status === 'finished'

  return (
    <main className="min-h-dvh p-6 space-y-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-black text-heading">{tournament.title}</h1>
        <p className="text-faint text-sm">
          Code: <span className="font-mono font-bold text-accent">{tournament.id}</span>
          {tournament.target_game_count && (
            <span>
              {' '}
              &middot; {finishedGames.length}/{tournament.target_game_count} games
            </span>
          )}
        </p>
        {isFinished && (
          <span className="inline-block mt-2 rounded-full bg-green-500/20 px-3 py-1 text-xs font-bold text-green-400">
            Tournament Complete
          </span>
        )}
      </div>

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      {/* Join Form */}
      {!joined && !isHost && !isFinished && (
        <div className="glass-card p-4 space-y-3">
          <p className="text-sm font-medium text-body">Join Tournament</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Your name"
              maxLength={50}
              className="flex-1 rounded-xl border border-theme bg-surface px-4 py-2 text-body placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent"
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
            <button
              onClick={handleJoin}
              className="rounded-xl bg-accent px-4 py-2 font-bold text-white"
            >
              Join
            </button>
          </div>
          {joinError && (
            <p className="text-red-400 text-xs">{joinError}</p>
          )}
        </div>
      )}

      {/* Active Game Banner */}
      {activeGame && (
        <div className="glass-card border-2 border-accent p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-accent">Game In Progress</p>
            <span className="text-xs text-faint">
              Game {activeGame.game_order}
            </span>
          </div>
          {joined && (
            <button
              onClick={() => handleJoinGame(activeGame.game_id)}
              className="w-full rounded-xl bg-accent px-4 py-3 font-bold text-white transition hover:brightness-110"
            >
              Join Game
            </button>
          )}
          {isHost && (
            <button
              onClick={() => router.push(`/host/${activeGame.game_id}`)}
              className="w-full rounded-xl bg-accent/20 px-4 py-2 text-sm font-bold text-accent"
            >
              Host Dashboard
            </button>
          )}
        </div>
      )}

      {/* Leaderboard */}
      <div className="glass-card p-4 space-y-3">
        <p className="text-sm font-bold text-body uppercase tracking-wider">
          Leaderboard
        </p>
        {players.length === 0 ? (
          <p className="text-faint text-sm">No players yet</p>
        ) : (
          <div className="space-y-2">
            {players.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl bg-surface px-4 py-2"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`text-lg font-black ${
                      i === 0
                        ? 'text-yellow-400'
                        : i === 1
                          ? 'text-gray-300'
                          : i === 2
                            ? 'text-amber-600'
                            : 'text-faint'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="font-medium text-body">
                    {p.player_name}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-accent">
                    {p.total_points}pts
                  </span>
                  <span className="text-faint text-xs ml-2">
                    {p.games_played}g
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Game History */}
      {finishedGames.length > 0 && (
        <div className="glass-card p-4 space-y-3">
          <p className="text-sm font-bold text-body uppercase tracking-wider">
            Game History
          </p>
          <div className="space-y-2">
            {finishedGames.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between rounded-xl bg-surface px-4 py-2"
              >
                <span className="text-sm text-body">
                  Game {g.game_order}
                </span>
                <span className="text-xs text-faint">
                  {g.placements
                    ? `${Object.keys(g.placements).length} players`
                    : 'No results'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Host Controls */}
      {isHost && !isFinished && !activeGame && (
        <div className="glass-card p-4 space-y-4">
          <p className="text-sm font-bold text-body uppercase tracking-wider">
            Start Next Game
          </p>

          <div>
            <label className="block text-xs text-muted mb-1">Game Type</label>
            <select
              value={selectedGameType}
              onChange={(e) => setSelectedGameType(e.target.value)}
              className="w-full rounded-xl border border-theme bg-surface px-4 py-2 text-body focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {TOURNAMENT_ELIGIBLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {GAME_TYPE_LABELS[t] ?? t}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Rounds</label>
              <input
                type="number"
                value={roundsCount}
                onChange={(e) => setRoundsCount(e.target.value)}
                min={1}
                max={100}
                className="w-full rounded-xl border border-theme bg-surface px-4 py-2 text-body focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Timer (s)</label>
              <input
                type="number"
                value={timerSeconds}
                onChange={(e) => setTimerSeconds(e.target.value)}
                min={5}
                max={300}
                className="w-full rounded-xl border border-theme bg-surface px-4 py-2 text-body focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>

          <button
            onClick={handleStartGame}
            disabled={actionLoading}
            className="w-full rounded-2xl bg-accent px-6 py-3 font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-50"
          >
            {actionLoading ? 'Starting...' : 'Start Game'}
          </button>

          <button
            onClick={handleEndTournament}
            disabled={actionLoading}
            className="w-full rounded-2xl border border-red-500/50 px-6 py-2 text-sm font-bold text-red-400 transition hover:bg-red-500/10"
          >
            End Tournament
          </button>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Format and commit**

```bash
npx prettier --write src/hooks/useTournamentRealtime.ts src/app/tournament/\[code\]/page.tsx
git add src/hooks/useTournamentRealtime.ts src/app/tournament/
git commit -m "feat(tournament): add tournament lobby page with realtime leaderboard"
```

---

### Task 7: "Back to Tournament" Link + PR

**Files:**
- Modify: `src/app/game/[code]/page.tsx`

**Interfaces:**
- Consumes: `game.tournament_id` from the `Game` interface (already exists in DB after migration). The game page already fetches the game object.
- Produces: A "Back to Tournament" link visible on game results when the game has a `tournament_id`. PR created targeting `dev`.

- [ ] **Step 1: Check how the game page renders the finished state**

Read `src/app/game/[code]/page.tsx` to understand the current structure. The page renders `<PollGamePlayerExperience gameCode={gameCode} />`. The "Back to Tournament" link needs to be added inside the player experience component or in the game page wrapper.

Since the game page is a thin wrapper (`useParams` → `PollGamePlayerExperience`), and the tournament_id comes from the game object which is fetched inside the player experience component, the cleanest approach is to pass `tournament_id` through. However, modifying `PollGamePlayerExperience` is risky (it's a large component used by all game types).

Instead, add the link at the game page level by fetching the game's `tournament_id` separately:

Modify `src/app/game/[code]/page.tsx`. Read the current file first, then add a tournament link component. The current file is approximately:

```typescript
export default function GamePage() {
  const { code } = useParams<{ code: string }>()
  const gameCode = (Array.isArray(code) ? code[0] : code).toUpperCase()
  return <PollGamePlayerExperience gameCode={gameCode} />
}
```

Replace with:

```typescript
'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import PollGamePlayerExperience from '@/components/poll-game/PollGamePlayerExperience'

function TournamentBanner({ gameCode }: { gameCode: string }) {
  const [tournamentId, setTournamentId] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('games')
      .select('tournament_id')
      .eq('id', gameCode)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.tournament_id) setTournamentId(data.tournament_id)
      })
  }, [gameCode])

  if (!tournamentId) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <a
        href={`/tournament/${tournamentId}`}
        className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-bold text-white shadow-lg transition hover:brightness-110"
      >
        ← Back to Tournament
      </a>
    </div>
  )
}

export default function GamePage() {
  const { code } = useParams<{ code: string }>()
  const gameCode = (Array.isArray(code) ? code[0] : code).toUpperCase()

  return (
    <>
      <PollGamePlayerExperience gameCode={gameCode} />
      <TournamentBanner gameCode={gameCode} />
    </>
  )
}
```

Note: Check the existing file first — it may already have `'use client'` and imports. Preserve any existing imports and only add what's new. If `PollGamePlayerExperience` is imported differently (named vs default), match the existing import.

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Format and commit**

```bash
npx prettier --write src/app/game/\[code\]/page.tsx
git add src/app/game/\[code\]/page.tsx
git commit -m "feat(tournament): add Back to Tournament link on game page"
```

- [ ] **Step 4: Create PR**

```bash
git push -u origin feat/tournament-mode
gh pr create --base dev --title "feat: Tournament Mode (Phase 1 — core + trivia)" --body "$(cat <<'EOF'
## Summary
- Adds tournament system: host creates a multi-game competition, players join with a code, play trivia games in sequence, earn placement-based points
- Three new DB tables (tournaments, tournament_players, tournament_games) + tournament_id FK on games
- Full CRUD API: create/join/update tournament, add games, finish tournament
- Tournament create page and lobby page with realtime leaderboard
- Trivia placement adapter hooks into finish-game flow
- "Back to Tournament" floating link on game pages

## Phase 1 Scope
Only trivia is supported as a tournament game type. Phase 2 will add 12 more game types and pre-planned playlists.

## Test plan
- [ ] Create tournament from /tournament/create
- [ ] Join tournament as a player
- [ ] Host starts a trivia game from the tournament lobby
- [ ] Player joins the game via the "Join Game" button
- [ ] Complete the trivia game
- [ ] Verify placements are computed and leaderboard updates
- [ ] Verify "Back to Tournament" link appears on the game page
- [ ] Host can start another game
- [ ] Host can end the tournament
- [ ] Late join: new player joins between games, starts at 0 points
- [ ] Run migration 088_tournaments.sql in Supabase SQL editor
EOF
)"
```

---
