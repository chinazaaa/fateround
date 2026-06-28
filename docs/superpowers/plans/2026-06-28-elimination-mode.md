# Elimination Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-round elimination and lives mode to trivia, npat (I Call On), and two-truths games, plus tournament-level lives.

**Architecture:** An elimination engine (`src/lib/elimination.ts`) provides `applyEliminationRule()` and per-game round-score adapters. Each game's advance handler calls the engine after the reveal phase. A new `is_eliminated` boolean on players (separate from `spectator`) is the authoritative elimination flag. Existing spectator-reset code is guarded to never re-activate eliminated players. Tournament lives hook into the existing `awardTournamentPlacements` flow.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (Postgres + Realtime), TypeScript, Zod v4, Tailwind CSS 4

## Global Constraints

- No test runner — verify via `npx tsc --noEmit`
- All DB field names use `snake_case`. TypeScript interfaces mirror DB column names.
- Supabase client: `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)` at module level in API routes.
- API responses follow `{ success: true }` or `{ error: string }` pattern.
- Format all files with `npx prettier --write <file>` before committing.
- Do NOT add `Co-Authored-By` or `Generated with Claude Code` to commits.
- Zod import: `import { z } from 'zod/v4'` (this project uses Zod v4 with the /v4 import path).
- CSS classes use existing design tokens: `text-heading`, `text-muted`, `text-body`, `text-faint`, `text-accent`, `bg-surface`, `bg-accent`, `border-theme`, `glass-card`, `surface-inset`.
- `text-red-400` is acceptable for error/elimination states.

---

### Task 1: DB Migration + TypeScript Types

**Files:**
- Create: `supabase/migrations/088_elimination.sql`
- Modify: `src/types/index.ts` (add `is_eliminated`, `eliminated_at`, `lives_remaining` to `Player` interface)
- Create: `src/types/elimination.ts` (EliminationConfig, EliminationEvent interfaces)

**Interfaces:**
- Consumes: nothing
- Produces: `EliminationConfig` and `EliminationEvent` types used by all later tasks; DB columns `is_eliminated`, `eliminated_at`, `lives_remaining` on `players` and `tournament_players`; `elimination_config` JSONB on `games` and `tournaments`; `elimination_events` table

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/088_elimination.sql`:

```sql
-- Add elimination columns to players
alter table players add column if not exists is_eliminated boolean not null default false;
alter table players add column if not exists eliminated_at timestamptz;
alter table players add column if not exists lives_remaining integer;

-- Add elimination columns to tournament_players
alter table tournament_players add column if not exists is_eliminated boolean not null default false;
alter table tournament_players add column if not exists eliminated_at timestamptz;
alter table tournament_players add column if not exists lives_remaining integer;

-- Add elimination_config to games
alter table games add column if not exists elimination_config jsonb;

-- Add elimination_config to tournaments
alter table tournaments add column if not exists elimination_config jsonb;

-- Elimination events table
create table if not exists elimination_events (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  round_number integer,
  reason text not null,
  eliminated_at timestamptz default now()
);

create index if not exists idx_elimination_events_game_round
  on elimination_events(game_id, round_number);

-- RLS: fully permissive (same as all other tables)
alter table elimination_events enable row level security;

create policy "Allow all reads on elimination_events"
  on elimination_events for select using (true);

create policy "Allow all inserts on elimination_events"
  on elimination_events for insert with check (true);

create policy "Allow all updates on elimination_events"
  on elimination_events for update using (true);

create policy "Allow all deletes on elimination_events"
  on elimination_events for delete using (true);

-- Realtime
alter publication supabase_realtime add table elimination_events;
```

- [ ] **Step 2: Add fields to Player interface**

In `src/types/index.ts`, add three fields to the `Player` interface (after `resume_token` at ~line 752):

```typescript
  /** True when player has been eliminated (elimination mode). */
  is_eliminated?: boolean
  /** When the player was eliminated. */
  eliminated_at?: string | null
  /** Remaining lives (lives mode only, null otherwise). */
  lives_remaining?: number | null
```

- [ ] **Step 3: Create elimination types**

Create `src/types/elimination.ts`:

```typescript
export interface EliminationConfig {
  mode: 'per-round' | 'lives'
  rule?: 'bottom-n' | 'score-threshold'
  eliminateCount?: number
  threshold?: number
  startingLives?: number
  livesLostRule?: 'bottom-n'
}

export interface EliminationEvent {
  id: string
  game_id: string
  player_id: string
  round_number: number | null
  reason: 'bottom-n' | 'score-threshold' | 'no-lives'
  eliminated_at: string
}

export const ELIMINATION_COMPATIBLE_TYPES = ['trivia', 'npat', 'two-truths'] as const
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
npx prettier --write supabase/migrations/088_elimination.sql src/types/index.ts src/types/elimination.ts
git add supabase/migrations/088_elimination.sql src/types/index.ts src/types/elimination.ts
git commit -m "feat(elimination): add DB migration and TypeScript types"
```

---

### Task 2: Elimination Engine — Core + Adapters

**Files:**
- Create: `src/lib/elimination.ts`

**Interfaces:**
- Consumes: `EliminationConfig` from `src/types/elimination.ts`; `SupabaseClient` from `@supabase/supabase-js`
- Produces: `applyEliminationRule(supabase, gameId, gameType, roundNumber, config): Promise<{ eliminated: string[], gameFinished: boolean }>` and `getRoundScores(supabase, gameId, gameType, roundNumber): Promise<Array<{ playerId: string, score: number }>>` — both used by advance handler hooks in Tasks 3-5

- [ ] **Step 1: Create the elimination engine file**

Create `src/lib/elimination.ts` with the following functions:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EliminationConfig } from '@/types/elimination'

export async function getRoundScores(
  supabase: SupabaseClient,
  gameId: string,
  gameType: string,
  roundNumber: number
): Promise<Array<{ playerId: string; score: number }>> {
  const gt = gameType.toLowerCase()

  if (gt === 'trivia') {
    return getTriviaRoundScores(supabase, gameId, roundNumber)
  }
  if (gt === 'npat') {
    return getNpatRoundScores(supabase, gameId, roundNumber)
  }
  if (gt === 'two-truths') {
    return getTwoTruthsRoundScores(supabase, gameId, roundNumber)
  }

  return []
}

async function getTriviaRoundScores(
  supabase: SupabaseClient,
  gameId: string,
  roundNumber: number
): Promise<Array<{ playerId: string; score: number }>> {
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('game_id', gameId)
    .eq('round_number', roundNumber)
    .maybeSingle()

  if (!round) return []

  const { data: answers } = await supabase
    .from('trivia_answers')
    .select('player_id, points')
    .eq('round_id', round.id)

  if (!answers?.length) return []

  const totals = new Map<string, number>()
  for (const a of answers) {
    totals.set(a.player_id, (totals.get(a.player_id) ?? 0) + (a.points ?? 0))
  }

  return [...totals.entries()]
    .map(([playerId, score]) => ({ playerId, score }))
    .sort((a, b) => b.score - a.score)
}

async function getNpatRoundScores(
  supabase: SupabaseClient,
  gameId: string,
  roundNumber: number
): Promise<Array<{ playerId: string; score: number }>> {
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('game_id', gameId)
    .eq('round_number', roundNumber)
    .maybeSingle()

  if (!round) return []

  const { data: answers } = await supabase
    .from('npat_answers')
    .select('player_id, score_name, score_animal, score_place, score_thing, score_food')
    .eq('round_id', round.id)

  if (!answers?.length) return []

  const totals = new Map<string, number>()
  for (const a of answers) {
    const score =
      (a.score_name ?? 0) +
      (a.score_animal ?? 0) +
      (a.score_place ?? 0) +
      (a.score_thing ?? 0) +
      (a.score_food ?? 0)
    totals.set(a.player_id, (totals.get(a.player_id) ?? 0) + score)
  }

  return [...totals.entries()]
    .map(([playerId, score]) => ({ playerId, score }))
    .sort((a, b) => b.score - a.score)
}

async function getTwoTruthsRoundScores(
  supabase: SupabaseClient,
  gameId: string,
  roundNumber: number
): Promise<Array<{ playerId: string; score: number }>> {
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('game_id', gameId)
    .eq('round_number', roundNumber)
    .maybeSingle()

  if (!round) return []

  const { data: guesses } = await supabase
    .from('ttl_guesses')
    .select('player_id, is_correct')
    .eq('round_id', round.id)

  if (!guesses?.length) return []

  const totals = new Map<string, number>()
  for (const g of guesses) {
    if (g.is_correct) {
      totals.set(g.player_id, (totals.get(g.player_id) ?? 0) + 1)
    } else {
      if (!totals.has(g.player_id)) totals.set(g.player_id, 0)
    }
  }

  return [...totals.entries()]
    .map(([playerId, score]) => ({ playerId, score }))
    .sort((a, b) => b.score - a.score)
}

export async function applyEliminationRule(
  supabase: SupabaseClient,
  gameId: string,
  gameType: string,
  roundNumber: number,
  config: EliminationConfig
): Promise<{ eliminated: string[]; gameFinished: boolean }> {
  const scores = await getRoundScores(supabase, gameId, gameType, roundNumber)
  if (scores.length === 0) return { eliminated: [], gameFinished: false }

  const { data: activePlayers } = await supabase
    .from('players')
    .select('id')
    .eq('game_id', gameId)
    .eq('is_eliminated', false)
    .eq('spectator', false)

  const activeIds = new Set((activePlayers ?? []).map((p) => p.id))
  const activeScores = scores.filter((s) => activeIds.has(s.playerId))

  if (activeScores.length <= 1) return { eliminated: [], gameFinished: false }

  let toEliminate: string[] = []

  if (config.mode === 'per-round') {
    if (config.rule === 'bottom-n') {
      toEliminate = findBottomN(activeScores, config.eliminateCount ?? 1)
    } else if (config.rule === 'score-threshold') {
      toEliminate = activeScores
        .filter((s) => s.score < (config.threshold ?? 0))
        .map((s) => s.playerId)
    }
  } else if (config.mode === 'lives') {
    toEliminate = findBottomN(activeScores, config.eliminateCount ?? 1)
  }

  if (toEliminate.length >= activeScores.length) {
    return { eliminated: [], gameFinished: true }
  }

  const eliminated: string[] = []
  const now = new Date().toISOString()

  if (config.mode === 'lives') {
    for (const playerId of toEliminate) {
      const { data: player } = await supabase
        .from('players')
        .select('lives_remaining')
        .eq('id', playerId)
        .maybeSingle()

      const newLives = (player?.lives_remaining ?? 1) - 1

      if (newLives <= 0) {
        await supabase
          .from('players')
          .update({ is_eliminated: true, eliminated_at: now, spectator: true, lives_remaining: 0 })
          .eq('id', playerId)
        eliminated.push(playerId)

        await supabase.from('elimination_events').insert({
          game_id: gameId,
          player_id: playerId,
          round_number: roundNumber,
          reason: 'no-lives',
          eliminated_at: now,
        })
      } else {
        await supabase
          .from('players')
          .update({ lives_remaining: newLives })
          .eq('id', playerId)

        await supabase.from('elimination_events').insert({
          game_id: gameId,
          player_id: playerId,
          round_number: roundNumber,
          reason: 'bottom-n',
          eliminated_at: now,
        })
      }
    }
  } else {
    for (const playerId of toEliminate) {
      await supabase
        .from('players')
        .update({ is_eliminated: true, eliminated_at: now, spectator: true })
        .eq('id', playerId)
      eliminated.push(playerId)

      const reason: 'bottom-n' | 'score-threshold' =
        config.rule === 'score-threshold' ? 'score-threshold' : 'bottom-n'

      await supabase.from('elimination_events').insert({
        game_id: gameId,
        player_id: playerId,
        round_number: roundNumber,
        reason,
        eliminated_at: now,
      })
    }
  }

  const { count } = await supabase
    .from('players')
    .select('*', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .eq('is_eliminated', false)
    .eq('spectator', false)

  const gameFinished = (count ?? 0) <= 1

  return { eliminated, gameFinished }
}

function findBottomN(
  scores: Array<{ playerId: string; score: number }>,
  n: number
): string[] {
  if (scores.length <= 1) return []

  const sorted = [...scores].sort((a, b) => a.score - b.score)

  const cutoffScore = sorted[Math.min(n, sorted.length) - 1].score

  const atCutoff = sorted.filter((s) => s.score === cutoffScore)
  const belowCutoff = sorted.filter((s) => s.score < cutoffScore)

  if (belowCutoff.length >= n) {
    return belowCutoff.slice(0, n).map((s) => s.playerId)
  }

  if (atCutoff.length > 1) {
    return belowCutoff.map((s) => s.playerId)
  }

  return sorted.slice(0, n).map((s) => s.playerId)
}
```

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit
npx prettier --write src/lib/elimination.ts
git add src/lib/elimination.ts
git commit -m "feat(elimination): add elimination engine with round score adapters"
```

---

### Task 3: Spectator Reset Guards

**Files:**
- Modify: `src/lib/npat.ts:802-807`
- Modify: `src/lib/two-truths.ts:189-194`
- Modify: `src/lib/viewers.ts:119-120` and `src/lib/viewers.ts:211-215`
- Modify: `src/lib/npat-advance.ts:46-48`

**Interfaces:**
- Consumes: `is_eliminated` column on `players` table (from Task 1)
- Produces: guarded queries that never re-activate eliminated players — required before advance hooks in Tasks 4-5

- [ ] **Step 1: Guard npat.ts spectator reset**

In `src/lib/npat.ts`, find the spectator reset at ~line 802-807:

```typescript
// BEFORE (lines 802-807):
  const { error: spectatorError } = await supabase
    .from('players')
    .update({ spectator: false })
    .eq('game_id', gameId)
    .eq('spectator', true)
```

Change to:

```typescript
// AFTER:
  const { error: spectatorError } = await supabase
    .from('players')
    .update({ spectator: false })
    .eq('game_id', gameId)
    .eq('spectator', true)
    .eq('is_eliminated', false)
```

- [ ] **Step 2: Guard two-truths.ts spectator reset**

In `src/lib/two-truths.ts`, find the spectator reset at ~line 189-194:

```typescript
// BEFORE (lines 189-194):
  const { error: spectatorError } = await supabase
    .from('players')
    .update({ spectator: false })
    .eq('game_id', gameId)
    .eq('spectator', true)
```

Change to:

```typescript
// AFTER:
  const { error: spectatorError } = await supabase
    .from('players')
    .update({ spectator: false })
    .eq('game_id', gameId)
    .eq('spectator', true)
    .eq('is_eliminated', false)
```

- [ ] **Step 3: Guard viewers.ts playerIsViewer**

In `src/lib/viewers.ts`, find `playerIsViewer` at ~line 115-124. The function signature accepts `Pick<Player, 'joined_at' | 'spectator'>`. Update the signature and add an `is_eliminated` check:

```typescript
// BEFORE (line 116):
  player: Pick<Player, 'joined_at' | 'spectator'>,

// AFTER:
  player: Pick<Player, 'joined_at' | 'spectator' | 'is_eliminated'>,
```

And add after line 119 (`if (player.spectator === true) return true`):

```typescript
  if (player.is_eliminated) return true
```

- [ ] **Step 4: Guard viewers.ts resetSpectatorsForLobby**

In `src/lib/viewers.ts`, find `resetSpectatorsForLobby` at ~line 211-215:

```typescript
// BEFORE (lines 211-215):
  const { error: readyError } = await supabase
    .from('players')
    .update({ spectator: false })
    .eq('game_id', gameId)
    .in('id', exceptPlayerIds)
```

Change to:

```typescript
// AFTER:
  const { error: readyError } = await supabase
    .from('players')
    .update({ spectator: false })
    .eq('game_id', gameId)
    .eq('is_eliminated', false)
    .in('id', exceptPlayerIds)
```

- [ ] **Step 5: Guard npat-advance.ts countActivePlayers**

In `src/lib/npat-advance.ts`, find `countActivePlayers` at ~line 46-48:

```typescript
// BEFORE:
async function countActivePlayers(supabase: SupabaseClient, gameId: string): Promise<string[]> {
  const { data } = await supabase.from('players').select('id').eq('game_id', gameId).eq('spectator', false)
  return (data ?? []).map((p) => p.id)
}
```

Change to:

```typescript
// AFTER:
async function countActivePlayers(supabase: SupabaseClient, gameId: string): Promise<string[]> {
  const { data } = await supabase
    .from('players')
    .select('id')
    .eq('game_id', gameId)
    .eq('spectator', false)
    .eq('is_eliminated', false)
  return (data ?? []).map((p) => p.id)
}
```

- [ ] **Step 6: Verify and commit**

```bash
npx tsc --noEmit
npx prettier --write src/lib/npat.ts src/lib/two-truths.ts src/lib/viewers.ts src/lib/npat-advance.ts
git add src/lib/npat.ts src/lib/two-truths.ts src/lib/viewers.ts src/lib/npat-advance.ts
git commit -m "feat(elimination): add is_eliminated guards to spectator resets"
```

---

### Task 4: Advance Handler Hooks — Trivia + Npat

**Files:**
- Modify: `src/lib/trivia-advance.ts:94-115`
- Modify: `src/lib/npat-advance.ts:340-378`

**Interfaces:**
- Consumes: `applyEliminationRule` from `src/lib/elimination.ts` (Task 2); `markGameFinished` from `src/lib/game-finish.ts`; `EliminationConfig` from `src/types/elimination.ts`
- Produces: elimination-aware advance handlers for trivia and npat

- [ ] **Step 1: Hook trivia advance handler**

In `src/lib/trivia-advance.ts`, add import at the top:

```typescript
import { applyEliminationRule } from './elimination'
import type { EliminationConfig } from '@/types/elimination'
```

In `advanceAfterReveal`, after the reveal deadline check (line 94, after the `}` closing the reveal_pending guard) and BEFORE the `isLastRound` check (line 96), insert:

```typescript
  // Elimination hook: apply elimination rule after reveal
  const { data: gameForElim } = await supabase
    .from('games')
    .select('elimination_config, game_type')
    .eq('id', code)
    .maybeSingle()

  if (gameForElim?.elimination_config) {
    const elimConfig = gameForElim.elimination_config as EliminationConfig
    const result = await applyEliminationRule(
      supabase,
      code,
      gameForElim.game_type ?? 'trivia',
      game.current_round_number,
      elimConfig
    )
    if (result.gameFinished) {
      await markGameFinished(supabase, code)
      return { ok: true, code: 'advanced_finish' }
    }
  }
```

- [ ] **Step 2: Hook npat advance handler**

In `src/lib/npat-advance.ts`, add import at the top:

```typescript
import { applyEliminationRule } from './elimination'
import type { EliminationConfig } from '@/types/elimination'
```

In `startNextLetterCycle`, after the `shouldFinishNpatSession` guard (line 356, after `return { ok: true, code: 'advanced_finish' }` and its closing `}`) and BEFORE `const nextRoundNumber` (line 358), insert:

```typescript
  // Elimination hook
  const { data: gameForElim } = await supabase
    .from('games')
    .select('elimination_config')
    .eq('id', code)
    .maybeSingle()

  if (gameForElim?.elimination_config) {
    const elimConfig = gameForElim.elimination_config as EliminationConfig
    const result = await applyEliminationRule(
      supabase,
      code,
      'npat',
      finishedRound.round_number,
      elimConfig
    )
    if (result.gameFinished) {
      await markGameFinished(supabase, code)
      return { ok: true, code: 'advanced_finish' }
    }

    // Strip eliminated players from caller_order
    const eliminatedSet = new Set(result.eliminated)
    const filteredPlayerIds = playerIds.filter((id) => !eliminatedSet.has(id))
    // Re-assign playerIds for the rest of this function
    playerIds = filteredPlayerIds
  }
```

Note: `playerIds` is a parameter of `startNextLetterCycle`. Since it's passed to `buildNpatNextRound` which uses it for `caller_order` (via `syncCallerOrder`), filtering out eliminated IDs here ensures they're removed from the caller rotation.

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
npx prettier --write src/lib/trivia-advance.ts src/lib/npat-advance.ts
git add src/lib/trivia-advance.ts src/lib/npat-advance.ts
git commit -m "feat(elimination): hook elimination into trivia and npat advance handlers"
```

---

### Task 5: Advance Handler Hook — Two Truths + Submitter Skip

**Files:**
- Modify: `src/lib/two-truths-advance.ts:130-143`

**Interfaces:**
- Consumes: `applyEliminationRule` from `src/lib/elimination.ts` (Task 2); `markGameFinished` from `src/lib/game-finish.ts`
- Produces: elimination-aware two-truths advance handler with eliminated-submitter skipping

- [ ] **Step 1: Hook two-truths advance handler**

In `src/lib/two-truths-advance.ts`, add import at the top:

```typescript
import { applyEliminationRule } from './elimination'
import type { EliminationConfig } from '@/types/elimination'
```

In `syncTwoTruthsGameState`, after the `pointerRound.status === 'finished'` block's `isLast` check (line 134, after the `markGameFinished` return) and BEFORE the `nextRound` lookup (line 137), insert:

```typescript
    // Elimination hook
    const { data: gameForElim } = await supabase
      .from('games')
      .select('elimination_config')
      .eq('id', gameId)
      .maybeSingle()

    if (gameForElim?.elimination_config) {
      const elimConfig = gameForElim.elimination_config as EliminationConfig
      const result = await applyEliminationRule(
        supabase,
        gameId,
        'two-truths',
        pointerRound.round_number,
        elimConfig
      )
      if (result.gameFinished) {
        await markGameFinished(supabase, gameId)
        return { ok: true, code: 'advanced_finish' }
      }
    }
```

After the existing `const nextRound = roundList.find(...)` line (~line 137), add submitter-skip logic:

```typescript
    if (!nextRound) return { ok: false, code: 'not_finished' }

    // Skip eliminated submitters
    if (nextRound.submitter_player_id) {
      const { data: submitter } = await supabase
        .from('players')
        .select('is_eliminated')
        .eq('id', nextRound.submitter_player_id)
        .maybeSingle()

      if (submitter?.is_eliminated) {
        // Find the next non-eliminated round in sequence
        const laterRounds = roundList
          .filter((r) => r.round_number > pointerRound.round_number)
          .sort((a, b) => a.round_number - b.round_number)

        let replacement: typeof nextRound | undefined
        for (const r of laterRounds) {
          if (!r.submitter_player_id) continue
          const { data: sub } = await supabase
            .from('players')
            .select('is_eliminated')
            .eq('id', r.submitter_player_id)
            .maybeSingle()
          if (!sub?.is_eliminated) {
            replacement = r
            break
          }
        }

        if (!replacement) {
          await markGameFinished(supabase, gameId)
          return { ok: true, code: 'advanced_finish' }
        }

        const activated = await activateRound(supabase, replacement.id)
        if (!activated) return { ok: false, code: 'not_finished' }
        await syncGamePointer(supabase, gameId, replacement.round_number)
        return { ok: true, code: 'advanced_next', nextRound: replacement.round_number }
      }
    }
```

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit
npx prettier --write src/lib/two-truths-advance.ts
git add src/lib/two-truths-advance.ts
git commit -m "feat(elimination): hook elimination into two-truths advance with submitter skip"
```

---

### Task 6: Game Creation API + Lives Initialization

**Files:**
- Modify: `src/app/api/games/route.ts:452-561` (add `elimination_config` to insert)
- Modify: `src/app/api/games/[code]/start/route.ts` (initialize `lives_remaining` on game start)
- Modify: `src/lib/tournament-validation.ts` (add `eliminationConfig` to `createTournamentSchema`)
- Modify: `src/app/api/tournaments/route.ts` (pass `elimination_config` through in POST insert)

**Interfaces:**
- Consumes: `EliminationConfig` from `src/types/elimination.ts`; `ELIMINATION_COMPATIBLE_TYPES` from `src/types/elimination.ts`
- Produces: API routes that accept and store `elimination_config`; lives initialization on game start

- [ ] **Step 1: Add elimination_config to game creation insert**

In `src/app/api/games/route.ts`, find the insert block starting at ~line 452. The block ends with a closing `})` around line 580+. Before the closing `})`, add:

```typescript
    elimination_config: body.elimination_config ?? null,
```

Also, near the top where the body is destructured, extract `elimination_config`:

Find the line where body fields are read (search for `const {` or `body.` patterns near the top of the POST handler). Add reading `elimination_config` from the request body. The simplest approach: after the existing body parsing, add:

```typescript
  const eliminationConfig = body.elimination_config ?? null
```

And use `eliminationConfig` in the insert instead of `body.elimination_config`.

- [ ] **Step 2: Initialize lives_remaining on game start**

In `src/app/api/games/[code]/start/route.ts`, after the game status is set to `'active'` and `session_started_at` is written, add lives initialization. Find the section that handles trivia/npat/two-truths game starts (the sections that set `status: 'active'`).

After each relevant game type's `update({ status: 'active', ... })` succeeds, add:

```typescript
    // Initialize lives for elimination mode
    const { data: gameConfig } = await supabase
      .from('games')
      .select('elimination_config')
      .eq('id', code.toUpperCase())
      .maybeSingle()

    if (gameConfig?.elimination_config) {
      const elimConfig = gameConfig.elimination_config as EliminationConfig
      if (elimConfig.mode === 'lives' && elimConfig.startingLives) {
        await supabase
          .from('players')
          .update({ lives_remaining: elimConfig.startingLives })
          .eq('game_id', code.toUpperCase())
          .eq('spectator', false)
      }
    }
```

Add at the top of the file:

```typescript
import type { EliminationConfig } from '@/types/elimination'
```

- [ ] **Step 3: Add elimination_config to tournament creation**

In `src/lib/tournament-validation.ts`, add to `createTournamentSchema`:

```typescript
  eliminationConfig: z
    .object({
      mode: z.literal('lives'),
      startingLives: z.coerce.number().int().min(1).max(10),
      livesLostRule: z.literal('bottom-n'),
      eliminateCount: z.coerce.number().int().min(1).max(10),
    })
    .optional(),
```

In `src/app/api/tournaments/route.ts`, add `elimination_config` to the insert at ~line 31-37:

```typescript
  const { error } = await supabase.from('tournaments').insert({
    id: tournamentCode,
    host_token: hostToken,
    title,
    placement_points: placementPoints ?? [10, 7, 5, 3, 2, 1],
    target_game_count: targetGameCount ?? null,
    elimination_config: eliminationConfig ?? null,
  })
```

And destructure it from `parsed.data`:

```typescript
  const { title, placementPoints, targetGameCount, eliminationConfig } = parsed.data
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
npx prettier --write src/app/api/games/route.ts src/app/api/games/[code]/start/route.ts src/lib/tournament-validation.ts src/app/api/tournaments/route.ts
git add src/app/api/games/route.ts src/app/api/games/[code]/start/route.ts src/lib/tournament-validation.ts src/app/api/tournaments/route.ts
git commit -m "feat(elimination): wire elimination_config through game and tournament creation"
```

---

### Task 7: Tournament Lives Hook

**Files:**
- Modify: `src/lib/tournament-scoring.ts` (add lives decrement after placement scoring, extend for npat + two-truths)

**Interfaces:**
- Consumes: `EliminationConfig` from `src/types/elimination.ts`; existing `awardTournamentPlacements` function; `computePlacementPoints` function
- Produces: tournament-level lives decrement + early tournament finish when 1 player remains

- [ ] **Step 1: Add npat and two-truths placement adapters**

In `src/lib/tournament-scoring.ts`, after the existing `computeTriviaPlacements` function (~line 45), add:

```typescript
async function computeNpatPlacements(
  supabase: SupabaseClient,
  gameId: string,
  playerMap: Map<string, string>
): Promise<Record<string, number>> {
  const { data: answers } = await supabase
    .from('npat_answers')
    .select('player_id, score_name, score_animal, score_place, score_thing, score_food')
    .eq('game_id', gameId)

  if (!answers?.length) return {}

  const totals = new Map<string, number>()
  for (const a of answers) {
    const score =
      (a.score_name ?? 0) + (a.score_animal ?? 0) + (a.score_place ?? 0) + (a.score_thing ?? 0) + (a.score_food ?? 0)
    const existing = totals.get(a.player_id) ?? 0
    totals.set(a.player_id, existing + score)
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])

  const placements: Record<string, number> = {}
  let rank = 1
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i][1] < sorted[i - 1][1]) rank = i + 1
    const tournamentPlayerId = playerMap.get(sorted[i][0])
    if (tournamentPlayerId) placements[tournamentPlayerId] = rank
  }
  return placements
}

async function computeTwoTruthsPlacements(
  supabase: SupabaseClient,
  gameId: string,
  playerMap: Map<string, string>
): Promise<Record<string, number>> {
  const { data: guesses } = await supabase
    .from('ttl_guesses')
    .select('player_id, is_correct')
    .eq('game_id', gameId)

  if (!guesses?.length) return {}

  const totals = new Map<string, number>()
  for (const g of guesses) {
    const existing = totals.get(g.player_id) ?? 0
    totals.set(g.player_id, existing + (g.is_correct ? 1 : 0))
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])

  const placements: Record<string, number> = {}
  let rank = 1
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i][1] < sorted[i - 1][1]) rank = i + 1
    const tournamentPlayerId = playerMap.get(sorted[i][0])
    if (tournamentPlayerId) placements[tournamentPlayerId] = rank
  }
  return placements
}
```

- [ ] **Step 2: Wire new adapters into the gameType dispatch**

In `awardTournamentPlacements`, find the gameType dispatch (~line 94-97):

```typescript
// BEFORE:
  if (gameType === 'trivia') {
    placements = await computeTriviaPlacements(supabase, gameId, playerMap)
  }
```

Change to:

```typescript
// AFTER:
  if (gameType === 'trivia') {
    placements = await computeTriviaPlacements(supabase, gameId, playerMap)
  } else if (gameType === 'npat') {
    placements = await computeNpatPlacements(supabase, gameId, playerMap)
  } else if (gameType === 'two-truths') {
    placements = await computeTwoTruthsPlacements(supabase, gameId, playerMap)
  }
```

- [ ] **Step 3: Add tournament lives decrement after points are awarded**

After the `for...of` loop that increments tournament points (~line 127, after the closing `}`), and BEFORE the `target_game_count` check (~line 129), insert:

```typescript
  // Tournament lives: decrement lives for bottom-N players
  const { data: tournamentForElim } = await supabase
    .from('tournaments')
    .select('elimination_config')
    .eq('id', tournamentId)
    .maybeSingle()

  if (tournamentForElim?.elimination_config) {
    const elimConfig = tournamentForElim.elimination_config as EliminationConfig
    if (elimConfig.mode === 'lives') {
      const sortedByPlacement = Object.entries(placements).sort((a, b) => b[1] - a[1])
      const bottomN = sortedByPlacement.slice(0, elimConfig.eliminateCount ?? 1)

      for (const [tpId] of bottomN) {
        const { data: tp } = await supabase
          .from('tournament_players')
          .select('lives_remaining')
          .eq('id', tpId)
          .maybeSingle()

        const newLives = (tp?.lives_remaining ?? 1) - 1

        if (newLives <= 0) {
          await supabase
            .from('tournament_players')
            .update({ is_eliminated: true, eliminated_at: new Date().toISOString(), lives_remaining: 0 })
            .eq('id', tpId)
        } else {
          await supabase
            .from('tournament_players')
            .update({ lives_remaining: newLives })
            .eq('id', tpId)
        }
      }

      // Check if only 1 player remains — finish tournament early
      const { count: remaining } = await supabase
        .from('tournament_players')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .eq('is_eliminated', false)

      if (remaining != null && remaining <= 1) {
        await supabase.from('tournaments').update({ status: 'finished' }).eq('id', tournamentId)
        return
      }
    }
  }
```

Add import at the top of the file:

```typescript
import type { EliminationConfig } from '@/types/elimination'
```

- [ ] **Step 4: Initialize tournament player lives when tournament has lives config**

In `src/app/api/tournaments/[code]/players/route.ts`, after the player is inserted, check if the tournament has lives config and set `lives_remaining`:

Find the player insert and after it succeeds, add:

```typescript
    // Initialize lives if tournament has lives elimination
    if (tournament.elimination_config) {
      const elimConfig = tournament.elimination_config as EliminationConfig
      if (elimConfig.mode === 'lives' && elimConfig.startingLives && player) {
        await supabase
          .from('tournament_players')
          .update({ lives_remaining: elimConfig.startingLives })
          .eq('id', player.id)
      }
    }
```

This requires fetching `elimination_config` alongside the tournament data. Update the tournament query to include `elimination_config`:

```typescript
// Ensure the tournament select includes elimination_config
.select('id, status, elimination_config')
```

Add import:

```typescript
import type { EliminationConfig } from '@/types/elimination'
```

- [ ] **Step 5: Block eliminated tournament players from joining games**

In `src/app/api/tournaments/[code]/players/route.ts`, add a check when a player tries to join: if the tournament player already exists and `is_eliminated = true`, return 403:

After the existing name-collision check, add:

```typescript
    // Check if player was previously eliminated
    if (existingPlayer?.is_eliminated) {
      return NextResponse.json({ error: 'You have been eliminated from this tournament' }, { status: 403 })
    }
```

This requires the existing player query to also select `is_eliminated`.

- [ ] **Step 6: Verify and commit**

```bash
npx tsc --noEmit
npx prettier --write src/lib/tournament-scoring.ts src/app/api/tournaments/[code]/players/route.ts
git add src/lib/tournament-scoring.ts src/app/api/tournaments/[code]/players/route.ts
git commit -m "feat(elimination): add tournament lives hook and npat/two-truths placement adapters"
```

---

### Task 8: Host UI — Elimination Config on Game Creation

**Files:**
- Modify: `src/components/PlayAgainSetup.tsx` (add elimination config section)

**Interfaces:**
- Consumes: `ELIMINATION_COMPATIBLE_TYPES` from `src/types/elimination.ts`; `isTriviaGame`, `isICallOnGame`, `isTwoTruthsGame` from `src/lib/game-types.ts`
- Produces: UI that lets hosts enable and configure elimination when creating trivia, npat, or two-truths games

- [ ] **Step 1: Add elimination config UI**

In `src/components/PlayAgainSetup.tsx`, add state variables near the other state declarations:

```typescript
const [eliminationEnabled, setEliminationEnabled] = useState(false)
const [eliminationMode, setEliminationMode] = useState<'per-round' | 'lives'>('per-round')
const [eliminationRule, setEliminationRule] = useState<'bottom-n' | 'score-threshold'>('bottom-n')
const [eliminateCount, setEliminateCount] = useState(1)
const [scoreThreshold, setScoreThreshold] = useState(50)
const [startingLives, setStartingLives] = useState(3)
```

Add an import:

```typescript
import { ELIMINATION_COMPATIBLE_TYPES } from '@/types/elimination'
```

Add a helper to check compatibility:

```typescript
const isEliminationCompatible = ELIMINATION_COMPATIBLE_TYPES.includes(
  gameType as (typeof ELIMINATION_COMPATIBLE_TYPES)[number]
)
```

Add the UI section after other game settings (e.g., after the rounds count / timer section). Only render when `isEliminationCompatible`:

```tsx
{isEliminationCompatible && (
  <div className="space-y-3">
    <label className="flex items-center gap-2 text-body text-sm">
      <input
        type="checkbox"
        checked={eliminationEnabled}
        onChange={(e) => setEliminationEnabled(e.target.checked)}
        className="accent-accent"
      />
      Enable elimination
    </label>

    {eliminationEnabled && (
      <div className="surface-inset rounded-xl p-4 space-y-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEliminationMode('per-round')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              eliminationMode === 'per-round' ? 'bg-accent text-white' : 'bg-surface text-muted'
            }`}
          >
            Per-Round
          </button>
          <button
            type="button"
            onClick={() => setEliminationMode('lives')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              eliminationMode === 'lives' ? 'bg-accent text-white' : 'bg-surface text-muted'
            }`}
          >
            Lives
          </button>
        </div>

        {eliminationMode === 'per-round' && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEliminationRule('bottom-n')}
                className={`px-3 py-1.5 rounded-lg text-xs ${
                  eliminationRule === 'bottom-n' ? 'bg-accent text-white' : 'bg-surface text-muted'
                }`}
              >
                Bottom N
              </button>
              <button
                type="button"
                onClick={() => setEliminationRule('score-threshold')}
                className={`px-3 py-1.5 rounded-lg text-xs ${
                  eliminationRule === 'score-threshold' ? 'bg-accent text-white' : 'bg-surface text-muted'
                }`}
              >
                Score Threshold
              </button>
            </div>

            {eliminationRule === 'bottom-n' ? (
              <Field label="Eliminate per round">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={eliminateCount}
                  onChange={(e) => setEliminateCount(Number(e.target.value) || 1)}
                  className="w-20 rounded-lg bg-surface border border-theme px-3 py-1.5 text-body text-sm"
                />
              </Field>
            ) : (
              <Field label="Score threshold">
                <input
                  type="number"
                  min={0}
                  value={scoreThreshold}
                  onChange={(e) => setScoreThreshold(Number(e.target.value) || 0)}
                  className="w-20 rounded-lg bg-surface border border-theme px-3 py-1.5 text-body text-sm"
                />
              </Field>
            )}
          </div>
        )}

        {eliminationMode === 'lives' && (
          <div className="space-y-2">
            <Field label="Starting lives">
              <input
                type="number"
                min={1}
                max={10}
                value={startingLives}
                onChange={(e) => setStartingLives(Number(e.target.value) || 3)}
                className="w-20 rounded-lg bg-surface border border-theme px-3 py-1.5 text-body text-sm"
              />
            </Field>
            <Field label="Lose life (bottom N)">
              <input
                type="number"
                min={1}
                max={10}
                value={eliminateCount}
                onChange={(e) => setEliminateCount(Number(e.target.value) || 1)}
                className="w-20 rounded-lg bg-surface border border-theme px-3 py-1.5 text-body text-sm"
              />
            </Field>
          </div>
        )}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 2: Include elimination_config in the game creation request body**

Find the fetch/POST call that creates the game (search for `fetch('/api/games'` or the body construction). Add `elimination_config` to the request body:

```typescript
elimination_config: eliminationEnabled && isEliminationCompatible
  ? eliminationMode === 'per-round'
    ? {
        mode: 'per-round' as const,
        rule: eliminationRule,
        ...(eliminationRule === 'bottom-n'
          ? { eliminateCount }
          : { threshold: scoreThreshold }),
      }
    : {
        mode: 'lives' as const,
        startingLives,
        livesLostRule: 'bottom-n' as const,
        eliminateCount,
      }
  : undefined,
```

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
npx prettier --write src/components/PlayAgainSetup.tsx
git add src/components/PlayAgainSetup.tsx
git commit -m "feat(elimination): add elimination config UI to game creation"
```

---

### Task 9: Eliminated Player UX — Banner + Spectator Gating

**Files:**
- Modify: `src/components/trivia/TriviaPlayerView.tsx`
- Modify: `src/components/npat/NpatPlayerView.tsx` (or equivalent)
- Modify: `src/components/two-truths/TwoTruthsPlayerView.tsx` (or equivalent)
- Create: `src/components/EliminationBanner.tsx`

**Interfaces:**
- Consumes: `Player.is_eliminated`, `Player.eliminated_at`, `Player.lives_remaining` from `src/types/index.ts`
- Produces: elimination banner component + gating in player views

- [ ] **Step 1: Create the EliminationBanner component**

Create `src/components/EliminationBanner.tsx`:

```tsx
'use client'

import type { Player } from '@/types'

interface EliminationBannerProps {
  player: Pick<Player, 'is_eliminated' | 'eliminated_at' | 'lives_remaining'>
}

export function EliminationBanner({ player }: EliminationBannerProps) {
  if (!player.is_eliminated) {
    if (player.lives_remaining != null && player.lives_remaining > 0) {
      return (
        <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 px-4 py-2 text-center text-sm text-yellow-400">
          {'❤️'.repeat(player.lives_remaining)} {player.lives_remaining}{' '}
          {player.lives_remaining === 1 ? 'life' : 'lives'} remaining
        </div>
      )
    }
    return null
  }

  return (
    <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-center">
      <p className="text-red-400 font-semibold text-sm">You have been eliminated</p>
      <p className="text-faint text-xs mt-1">You can still watch and chat</p>
    </div>
  )
}

export function LivesDisplay({ livesRemaining }: { livesRemaining: number | null | undefined }) {
  if (livesRemaining == null || livesRemaining <= 0) return null
  return (
    <span className="text-xs text-yellow-400">
      {'❤️'.repeat(livesRemaining)}
    </span>
  )
}
```

- [ ] **Step 2: Add banner to player views**

In each of the three player view components (`TriviaPlayerView.tsx`, the npat player view, and the two-truths player view), find where the player's `me` object is available and add:

```tsx
import { EliminationBanner } from '@/components/EliminationBanner'
```

At the top of the component's return, before the main content:

```tsx
{me && <EliminationBanner player={me} />}
```

The exact file paths and component names must be found by reading the actual files. Search for the component that renders when `me?.spectator` is checked — that's where the banner goes.

Additionally, where these components check `me?.spectator === true` to show spectator mode, add `|| me?.is_eliminated` to the condition:

```typescript
// BEFORE:
if (me?.spectator === true) { /* show spectator view */ }

// AFTER:
if (me?.spectator === true || me?.is_eliminated) { /* show spectator view */ }
```

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
npx prettier --write src/components/EliminationBanner.tsx src/components/trivia/TriviaPlayerView.tsx
git add src/components/EliminationBanner.tsx src/components/trivia/TriviaPlayerView.tsx
git commit -m "feat(elimination): add elimination banner and spectator gating in player views"
```

---

### Task 10: Tournament Elimination UI + PR

**Files:**
- Modify: `src/app/tournament/create/page.tsx` (add lives config)
- Modify: `src/app/tournament/[code]/page.tsx` (show lives remaining, eliminated state)

**Interfaces:**
- Consumes: `EliminationConfig` from `src/types/elimination.ts`; tournament API routes with `elimination_config`
- Produces: tournament UI that shows lives and eliminated state; PR

- [ ] **Step 1: Add lives config to tournament create page**

In `src/app/tournament/create/page.tsx`, add state for lives config:

```typescript
const [livesEnabled, setLivesEnabled] = useState(false)
const [startingLives, setStartingLives] = useState(3)
const [eliminateCount, setEliminateCount] = useState(1)
```

Add UI after the placement points section:

```tsx
<div className="space-y-3">
  <label className="flex items-center gap-2 text-body text-sm">
    <input
      type="checkbox"
      checked={livesEnabled}
      onChange={(e) => setLivesEnabled(e.target.checked)}
      className="accent-accent"
    />
    Enable lives mode
  </label>

  {livesEnabled && (
    <div className="surface-inset rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <label className="text-muted text-sm">Starting lives</label>
        <input
          type="number"
          min={1}
          max={10}
          value={startingLives}
          onChange={(e) => setStartingLives(Number(e.target.value) || 3)}
          className="w-20 rounded-lg bg-surface border border-theme px-3 py-1.5 text-body text-sm"
        />
      </div>
      <div className="flex items-center gap-3">
        <label className="text-muted text-sm">Lose life (bottom N per game)</label>
        <input
          type="number"
          min={1}
          max={10}
          value={eliminateCount}
          onChange={(e) => setEliminateCount(Number(e.target.value) || 1)}
          className="w-20 rounded-lg bg-surface border border-theme px-3 py-1.5 text-body text-sm"
        />
      </div>
    </div>
  )}
</div>
```

Include in the POST body:

```typescript
eliminationConfig: livesEnabled
  ? { mode: 'lives', startingLives, livesLostRule: 'bottom-n', eliminateCount }
  : undefined,
```

- [ ] **Step 2: Show lives and eliminated state in tournament lobby**

In `src/app/tournament/[code]/page.tsx`, in the leaderboard section where players are rendered, add lives display next to each player's name:

```tsx
{player.lives_remaining != null && (
  <span className="text-xs text-yellow-400 ml-1">
    {'❤️'.repeat(Math.max(0, player.lives_remaining))}
  </span>
)}
{player.is_eliminated && (
  <span className="text-xs text-red-400 ml-1">Eliminated</span>
)}
```

Also, when rendering the player list, visually dim eliminated players:

```tsx
<div className={`... ${player.is_eliminated ? 'opacity-50' : ''}`}>
```

- [ ] **Step 3: Verify, format, and commit**

```bash
npx tsc --noEmit
npx prettier --write src/app/tournament/create/page.tsx src/app/tournament/[code]/page.tsx
git add src/app/tournament/create/page.tsx src/app/tournament/[code]/page.tsx
git commit -m "feat(elimination): add tournament lives UI"
```

- [ ] **Step 4: Create PR**

```bash
gh pr create --base dev --title "feat(elimination): per-round elimination and lives mode" --body "## Summary
- Per-round elimination (bottom-N or score threshold) for trivia, npat, two-truths
- Lives mode: standalone (per-game) and tournament-level
- Elimination engine with per-game round score adapters
- Spectator reset guards to prevent re-activation of eliminated players
- Host UI for configuring elimination at game/tournament creation
- Eliminated player banner with spectator + chat access
- Tournament lives: bottom-N lose a life per game, early tournament finish

## Test plan
- [ ] Create trivia game with per-round elimination (bottom-1), play 3+ rounds, verify bottom player eliminated each round
- [ ] Create trivia game with lives mode (3 lives), verify lives decrement and elimination on 0
- [ ] Verify eliminated players see spectator view + banner
- [ ] Verify ties at elimination boundary: all tied players survive
- [ ] Verify last-player-standing auto-finishes game
- [ ] Create tournament with lives enabled, play 2+ games, verify lives decrement across games
- [ ] Verify eliminated tournament player cannot join future games
- [ ] Verify npat caller_order skips eliminated players
- [ ] Verify two-truths skips eliminated submitters"
```
