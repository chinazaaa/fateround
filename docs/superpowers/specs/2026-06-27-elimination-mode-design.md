# Elimination Mode — Design Spec

## Overview

Elimination Mode adds two player-elimination mechanics to competitive games: **per-round elimination** (players knocked out after each round) and **lives mode** (players start with N lives, lose lives on poor performance). Both work as standalone game settings and lives mode also works at the tournament level.

Elimination is an opt-in game setting — the host enables it at creation time. When enabled, eliminated players become spectators with chat access. Games auto-finish when only 1 player remains.

Bracket mode (group-stage matchups with advancement) is deferred to a future spec.

## Compatible Game Types

Only game types with per-round scoring data support elimination. Three game types qualify:

| Game Type | Round Score Source | Ranking Logic |
|-----------|-------------------|---------------|
| Trivia | `trivia_answers` table, `points` column per answer | Sum points for the round, rank desc |
| I Call On (npat) | `npat_answers` table, 5 score columns (`score_name`, `score_animal`, `score_place`, `score_thing`, `score_food`) | Sum all 5 columns per player for the round, rank desc |
| Two Truths | `ttl_guesses` table, per-guess correctness | Count correct guesses for the round, rank desc |

Other rankable game types (scrabble, yahtzee, ludo, whot, monopoly, word-hunt, chess, bingo, who-said-this, describe-it, codewords) don't have per-round scoring breakdowns and are not eligible.

## Elimination Modes

### Per-Round Elimination

After each round's reveal phase ends, the elimination rule fires:

**Bottom-N rule:** The bottom N players (by round score) are eliminated. Host configures N at game creation (default: 1).

**Score-threshold rule:** Players scoring below a threshold in the round are eliminated. Host sets the threshold at game creation.

Ties at the elimination boundary: if multiple players tie at the cutoff position, all tied players survive that round. Example: bottom-1 with scores [10, 7, 5, 5] — both players with 5 survive; nobody is eliminated that round.

### Lives Mode

**Standalone (per-game):** Players start with N lives (host-configured, default: 3). After each round, the bottom-N players (by round score) lose a life. When `lives_remaining` hits 0, the player is eliminated. Same tie-breaking rule: ties at the boundary survive.

**Tournament-level:** Tournament players start with N lives. After each tournament game finishes, the bottom-N players in the final placement rankings lose a life. When `lives_remaining` hits 0, the player is eliminated from the tournament and cannot join future tournament games. The tournament ends early if only 1 player remains, regardless of `target_game_count`.

## Data Model

### Player table changes

```sql
alter table players add column if not exists is_eliminated boolean not null default false;
alter table players add column if not exists eliminated_at timestamptz;
alter table players add column if not exists lives_remaining integer;
```

- `is_eliminated`: authoritative elimination flag. Game libs never touch this — only the elimination engine writes it. Decoupled from `spectator` to avoid conflicts with game libs that blanket-reset `spectator = false` each round.
- `eliminated_at`: timestamp for display ("eliminated in round 3").
- `lives_remaining`: only populated when lives mode is active. `NULL` means "not in lives mode."

### Tournament player table changes

```sql
alter table tournament_players add column if not exists is_eliminated boolean not null default false;
alter table tournament_players add column if not exists eliminated_at timestamptz;
alter table tournament_players add column if not exists lives_remaining integer;
```

### Games table changes

```sql
alter table games add column if not exists elimination_config jsonb;
```

### Tournaments table changes

```sql
alter table tournaments add column if not exists elimination_config jsonb;
```

### `elimination_config` JSONB shape

```typescript
// Per-round, bottom-N
{ mode: 'per-round', rule: 'bottom-n', eliminateCount: number }

// Per-round, score threshold
{ mode: 'per-round', rule: 'score-threshold', threshold: number }

// Lives (standalone game)
{ mode: 'lives', startingLives: number, livesLostRule: 'bottom-n', eliminateCount: number }

// Lives (tournament-level)
{ mode: 'lives', startingLives: number, livesLostRule: 'bottom-n', eliminateCount: number }
```

### Elimination events table

```sql
create table elimination_events (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  round_number integer,
  reason text not null,  -- 'bottom-n' | 'score-threshold' | 'no-lives'
  eliminated_at timestamptz default now()
);

create index idx_elimination_events_game_round on elimination_events(game_id, round_number);
```

Records each elimination event for history display ("You lost a life in round 3", "Eliminated in round 5").

### RLS

Fully permissive (anon access), same pattern as all other tables in the app.

### Realtime

```sql
alter publication supabase_realtime add table elimination_events;
```

Players table is already in realtime publication — `is_eliminated` changes propagate automatically.

## Elimination Engine

### Core function

```typescript
async function applyEliminationRule(
  supabase: SupabaseClient,
  gameId: string,
  gameType: string,
  roundNumber: number,
  config: EliminationConfig
): Promise<{ eliminated: string[], gameFinished: boolean }>
```

This function:
1. Calls a per-game adapter to get ranked players for the round
2. Applies the elimination rule (bottom-N or score-threshold)
3. Handles ties at the boundary (all tied players survive)
4. For lives mode: decrements `lives_remaining`, only eliminates when it hits 0
5. Sets `is_eliminated = true`, `eliminated_at = now()`, `spectator = true` on eliminated players
6. Inserts `elimination_events` records
7. Checks if only 1 non-eliminated player remains → returns `gameFinished: true`

### Per-game round score adapters

```typescript
async function getRoundScores(
  supabase: SupabaseClient,
  gameId: string,
  gameType: string,
  roundNumber: number
): Promise<Array<{ playerId: string, score: number }>>
```

Internally dispatches to game-specific logic:

**Trivia adapter:**
- Query `trivia_answers` where `round_id` matches the current round
- Sum `points` per player
- Return sorted desc

**Npat adapter:**
- Query `npat_answers` where `round_id` matches the current round
- Sum `score_name + score_animal + score_place + score_thing + score_food` per player
- Return sorted desc

**Two-truths adapter:**
- Query `ttl_guesses` where `round_id` matches the current round
- Count correct guesses (where `is_correct = true`) per player
- Return sorted desc

### Tournament lives hook

After `awardTournamentPlacements` computes final game placements in `tournament-scoring.ts`:

1. Check if `tournaments.elimination_config` has `mode: 'lives'`
2. If so, identify bottom-N players from the placement rankings
3. Decrement their `tournament_players.lives_remaining`
4. If any player's `lives_remaining` hits 0, set `is_eliminated = true`, `eliminated_at = now()`
5. Check if only 1 non-eliminated tournament player remains → finish tournament early

This requires extending `awardTournamentPlacements` to support npat and two-truths placement adapters (currently trivia only).

## Trigger Points

Elimination does NOT have its own API route. It hooks into existing advance handlers:

### Trivia
File: `src/lib/trivia-advance.ts`, function `advanceAfterReveal`
Hook point: after reveal deadline check (~line 94), before next round number computation (~line 115).
If `applyEliminationRule` returns `gameFinished: true`, call `markGameFinished` and return instead of advancing.

### I Call On (npat)
File: `src/lib/npat-advance.ts`, function `startNextLetterCycle`
Hook point: after `shouldFinishNpatSession` guard (~line 353), before `buildNpatNextRound` (~line 358).

### Two Truths
File: `src/lib/two-truths-advance.ts`, function `syncTwoTruthsGameState`
Hook point: after `revealPending` guard (~line 126), before `activateRound` (~line 140).

## Game-Specific Integration Notes

### Npat: caller_order

`metadata.caller_order` in npat round metadata is an ordered list of player IDs determining who picks the next letter. `buildNpatNextRound` uses this to select the next caller. When a player is eliminated, their ID must be stripped from `caller_order` — otherwise the game assigns an eliminated player as caller and stalls until timer expiry.

### Npat: countActivePlayers

`countActivePlayers` in `npat-advance.ts` (~line 46-48) queries `spectator = false` to determine active players. Since `is_eliminated` is separate from `spectator`, this query must add `.eq('is_eliminated', false)` to exclude eliminated players from the active count. Otherwise the game waits for eliminated players' answers before advancing phases.

### Two Truths: submitter selection

Each round has a `submitter_player_id`. When building the next round, if the next submitter in rotation is eliminated, skip to the next non-eliminated player.

### All three: spectator reset guards

The following locations reset `spectator = false` and must add `.eq('is_eliminated', false)` to avoid re-activating eliminated players:

- `npat.ts` — round participant reset
- `two-truths.ts` — round participant reset (~line 191)
- `viewers.ts` — spectator-to-player conversion (~line 121, add `|| player.is_eliminated` guard)
- `viewers.ts` — `resetSpectatorsForLobby` (~line 213, add `.eq('is_eliminated', false)` to the update query)

## Host UI

### Game creation

When creating a game (trivia, npat, or two-truths), the host sees an optional "Elimination" section:

- Toggle: "Enable elimination" (off by default)
- When enabled, choose mode:
  - "Per-round elimination" → choose rule (bottom-N with count input, or score threshold with threshold input)
  - "Lives mode" → set starting lives count + bottom-N per round
- Config stored as `elimination_config` JSONB on the game

### Tournament creation

When creating a tournament, the host sees an optional "Lives" section:

- Toggle: "Enable lives" (off by default)
- When enabled: set starting lives count + bottom-N per game
- Config stored as `elimination_config` JSONB on the tournament

### Game creation API

The `POST /api/games` route (`src/app/api/games/route.ts`) must accept `elimination_config` in the request body and pass it through to the games table insert. Currently the insert block (~line 452) does not include this field — it must be added as `elimination_config: body.elimination_config ?? null`.

Similarly, `POST /api/tournaments` must accept and store `elimination_config` on the tournaments table.

### Elimination-compatible game type utility

A utility constant or function is needed to gate the host UI:

```typescript
const ELIMINATION_COMPATIBLE_TYPES = ['trivia', 'npat', 'two-truths'] as const;
```

The host UI only shows the elimination config section when the selected game type is in this list.

### Lock after start

`elimination_config` is set at creation time and cannot be changed once the game/tournament is active.

## Eliminated Player UX

- **Visual indicator:** Eliminated player sees a banner: "You were eliminated in Round N" (or "You lost your last life in Round N")
- **Spectator access:** Can see the game state, see other players' answers during reveal, see the leaderboard
- **Chat access:** Can still use chat/reactions
- **Cannot participate:** Cannot submit answers, cannot be assigned as caller/submitter
- **Realtime update:** Elimination state propagates via Supabase Realtime on the `players` table. Client checks `is_eliminated` to toggle between player and spectator views.

## Edge Cases

- **Last player standing:** When only 1 non-eliminated player remains, the game auto-finishes via `markGameFinished`. The surviving player wins.
- **All players eliminated in one round:** If the elimination rule would eliminate everyone (e.g., all players score 0), the game finishes with no winner rather than eliminating the last player.
- **Ties at boundary:** Players tied at the elimination cutoff all survive. Nobody is eliminated that round.
- **Play again:** Creates fresh player rows. All elimination state (`is_eliminated`, `lives_remaining`, `eliminated_at`) starts fresh. No carryover.
- **Eliminated player tries to rejoin:** `viewers.ts` spectator-to-player conversion checks `is_eliminated` and blocks re-entry.
- **Tournament: eliminated player joins game:** When tournament games auto-join players, skip players with `is_eliminated = true` on `tournament_players`.
- **Tournament: early finish:** If only 1 tournament player has `is_eliminated = false`, finish the tournament regardless of `target_game_count`.
- **Elimination in last round:** If elimination fires on the final round (round N of N), the game finishes normally — eliminated players are still marked but the game ends anyway.

## Implementation Phases

### Phase 1: Core Elimination (this spec)

- DB migration: new columns on `players`, `tournament_players`, `games`, `tournaments` + `elimination_events` table
- Elimination engine: `applyEliminationRule` + per-game round score adapters (trivia, npat, two-truths)
- Advance handler hooks: trivia, npat, two-truths
- Game-specific guards: npat caller_order, npat countActivePlayers, two-truths submitter, spectator reset guards
- Host UI: elimination config on game creation (trivia, npat, two-truths only)
- Tournament lives: hook in `awardTournamentPlacements`, extend placement adapters for npat + two-truths
- Eliminated player UX: banner, spectator view, chat access

### Phase 2: Bracket Mode (future spec)

- Group-stage bracket with advancement
- `bracket_state` JSONB on games
- Works with all 13 rankable game types
- Tournament bracket (groups play separate games)

## TypeScript Types

```typescript
interface EliminationConfig {
  mode: 'per-round' | 'lives';
  rule?: 'bottom-n' | 'score-threshold';  // per-round only
  eliminateCount?: number;                  // bottom-n count
  threshold?: number;                       // score-threshold value
  startingLives?: number;                   // lives mode
  livesLostRule?: 'bottom-n';              // lives mode
}

interface EliminationEvent {
  id: string;
  game_id: string;
  player_id: string;
  round_number: number | null;
  reason: 'bottom-n' | 'score-threshold' | 'no-lives';
  eliminated_at: string;
}
```

## DB Migration

File: `supabase/migrations/20260628131324_elimination.sql`

Adds columns to `players`, `tournament_players`, `games`, `tournaments`. Creates `elimination_events` table with index. Adds to realtime publication. Fully permissive RLS.
