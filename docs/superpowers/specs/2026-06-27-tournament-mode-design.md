# Tournament Mode — Design Spec

## Overview

Tournament Mode lets a host run a multi-game "game night playlist" across competitive game types. Players join with a tournament code, play a series of games, earn placement-based points after each game, and compete on a running leaderboard. The host can pre-plan a playlist or pick games on the fly.

Tournaments wrap existing games — individual games don't know they're in a tournament. The tournament layer creates games, tracks placements, and aggregates scores.

## Eligible Game Types

Only game types that produce a rankable player list are eligible. 13 game types across 4 categories:

**Per-player scoring (8):**
- Trivia — `tallyTriviaPlayerScores()` → score-based ranking
- Scrabble — `finalizeScores()` → per-player scores
- Yahtzee — `yahtzee_player_scores` table → category totals
- Ludo — `buildLudoStandings()` → `.rank` field
- Whot — `buildWhotStandings()` → `.rank` field
- Monopoly — `buildMonopolyStandings()` → net worth ranking
- Word Hunt — `tallyWordHuntScores()` → points-based ranking
- I Call On — `tallyNpatScores()` → score-based ranking

**Guess accuracy (1):**
- Who Said This — `tallyWstPlayerScores()` → correct guesses ranking

**Single winner (2):**
- Chess — `chess_sessions.winner_player_id` → winner=1st, loser=2nd, draw=tied 1st
- Bingo — `bingo_claims` (status='approved') → winner=1st, everyone else tied 2nd

**Team-based (2):**
- Describe-It — `computeDescribeItScores()` + `describe_it_players` for team→player mapping. All team members get the team's placement.
- Codewords — `winnerFromRevealedBoard()` + `codewords_player_roles` for team→player mapping. Winning team=1st, losing team=2nd.

**Excluded (no player ranking):** SMK, Red Flag/Green Flag, Smash or Pass, Parent Approval, Hot Seat, Custom, WYR, MLT, NHIE, PAN, TOT, Anonymous, Secret Message, Two Truths, Tic-Tac-Toe, Sudoku.

## Scoring System

Placement-based points. Default array: `[10, 7, 5, 3, 2, 1]`.

| Placement | Points |
|-----------|--------|
| 1st       | 10     |
| 2nd       | 7      |
| 3rd       | 5      |
| 4th       | 3      |
| 5th       | 2      |
| 6th+      | 1      |

- Players beyond the array length receive the last element (1 point — participation).
- Ties: players sharing a rank all receive that rank's points. Next rank is skipped (e.g., two 1st place = both get 10pts, next player gets 5pts for 3rd).
- The `placement_points` array is stored as JSONB on the tournament and is host-configurable at creation time.

## Data Model

### `tournaments` table

```sql
create table tournaments (
  id text primary key,                    -- 6-char code, same generator as games
  host_token text not null,               -- 40-char hex, same as games
  title text not null,
  status text not null default 'waiting', -- waiting | active | finished
  placement_points jsonb not null default '[10, 7, 5, 3, 2, 1]'::jsonb,
  target_game_count integer,              -- optional, null = unlimited
  created_at timestamptz default now()
);
```

### `tournament_players` table

```sql
create table tournament_players (
  id uuid primary key default gen_random_uuid(),
  tournament_id text not null references tournaments(id) on delete cascade,
  player_name text not null,
  total_points integer not null default 0,
  games_played integer not null default 0,
  joined_at timestamptz default now(),
  unique (tournament_id, player_name)
);
```

- `id` (UUID) is the stable identity used to track scores across games.
- `player_name` must be unique within a tournament (enforced by unique constraint).

### `tournament_games` table

```sql
create table tournament_games (
  id uuid primary key default gen_random_uuid(),
  tournament_id text not null references tournaments(id) on delete cascade,
  game_id text not null references games(id) on delete cascade,
  game_order integer not null,
  status text not null default 'pending', -- pending | active | finished
  placements jsonb,                       -- { "tp_id_1": 1, "tp_id_2": 2, ... }
  unique (tournament_id, game_order)
);
```

- `placements` JSONB maps `tournament_player_id` → rank (integer).

### `games` table modification

```sql
alter table games add column tournament_id text references tournaments(id);
```

Nullable FK. When set, the game is part of a tournament. Games don't need to know about tournament logic — this is purely for lookup/association.

### Realtime

```sql
alter publication supabase_realtime add table tournaments;
alter publication supabase_realtime add table tournament_players;
alter publication supabase_realtime add table tournament_games;
```

### RLS

Fully permissive (anon access), same pattern as all other tables in the app.

## Placement Adapter

A server-side function that computes placements when a tournament game finishes:

```typescript
async function computeTournamentPlacements(
  supabase: SupabaseClient,
  gameId: string,
  gameType: string,
  tournamentPlayerMap: Map<string, string> // game player_id → tournament_player_id
): Promise<Record<string, number>> // tournament_player_id → rank
```

Internally dispatches to game-type-specific logic:

| Game Type | Data Source | Ranking Logic |
|-----------|------------|---------------|
| trivia | `trivia_answers` + players | Sort by score desc, then avg response time asc |
| scrabble | `scrabble_player_state` + `scrabble_sessions` | Sort by final score desc |
| yahtzee | `yahtzee_player_scores` | Sum all categories, sort desc |
| ludo | `ludo_player_state` + `ludo_sessions` | Use `buildLudoStandings()` rank |
| whot | `whot_player_hands` + `whot_sessions` | Use `buildWhotStandings()` rank |
| monopoly | `monopoly_player_state` + `monopoly_boards` | Use `buildMonopolyStandings()` rank |
| word-hunt | `word_hunt_submissions` + players | Sort by points desc |
| i-call-on | `npat_answers` + players | Sort by score desc |
| chess | `chess_sessions` | winner=1, loser=2, draw=tied 1 |
| bingo | `bingo_claims` | approved claimer=1, all others=2 |
| who-said-this | rounds + votes + players | Sort by correct guesses desc |
| describe-it | `describe_it_players` + scores | Team rank → all members get rank |
| codewords | `codewords_player_roles` + board | Winning team=1, losing team=2 |

## API Routes

### `POST /api/tournaments`

Create a tournament.

**Request:**
```json
{
  "title": "Friday Game Night",
  "placementPoints": [10, 7, 5, 3, 2, 1],
  "targetGameCount": 5
}
```

**Response:**
```json
{
  "tournamentCode": "ABCD12",
  "hostToken": "abc123..."
}
```

### `GET /api/tournaments/[code]`

Get tournament state including players, games, and leaderboard.

**Response:**
```json
{
  "tournament": { "id": "ABCD12", "title": "...", "status": "active", ... },
  "players": [{ "id": "uuid", "player_name": "Alice", "total_points": 17, "games_played": 2 }],
  "games": [{ "game_id": "XYZ789", "game_order": 1, "status": "finished", "placements": {...} }]
}
```

### `PATCH /api/tournaments/[code]`

Update tournament settings. Host token required.

**Request:**
```json
{
  "hostToken": "abc123...",
  "title": "Saturday Game Night",
  "placementPoints": [10, 7, 5, 3, 2, 1],
  "targetGameCount": 8
}
```

All fields except `hostToken` are optional. Returns `{ success: true }`. Returns 403 if host token doesn't match.

### `POST /api/tournaments/[code]/games`

Add the next game to the tournament. Host token required.

**Request:**
```json
{
  "hostToken": "abc123...",
  "gameType": "trivia",
  "gameSettings": { "rounds_count": 10, "timer_seconds": 30 }
}
```

Creates a new game via the same logic as `POST /api/games`, sets `tournament_id` on it, creates a `tournament_games` record, and returns the game code. Game settings beyond `gameType` are optional (defaults apply).

### `POST /api/tournaments/[code]/finish`

End the tournament. Host token required. Sets status to `finished`.

### `POST /api/tournaments/[code]/players`

Join the tournament. Returns the tournament player record.

**Request:**
```json
{ "playerName": "Alice" }
```

## UX Flow

### Tournament Creation (`/tournament/create`)

1. Host enters tournament title
2. Optionally configures placement points (or uses defaults)
3. Optionally sets a target game count
4. Optionally pre-plans a playlist: picks game types in order, with basic settings per game
5. Submits → gets a tournament code to share

### Tournament Lobby (`/tournament/[code]`)

The hub for the entire tournament. Players and host both use this page.

**For players joining:**
- Enter name → `POST /api/tournaments/[code]/players`
- See: tournament title, player list, leaderboard (empty initially), current/next game status

**For host (authenticated via `host_token` in localStorage):**
- See everything players see, plus controls:
  - "Start Next Game" button — either launches next pre-planned game or opens inline game picker
  - Inline game picker: game type dropdown (13 eligible types) + basic settings (rounds, timer)
  - "End Tournament" button

### Game Flow

1. Host clicks "Start Next Game" → `POST /api/tournaments/[code]/games`
2. Tournament page updates via Realtime — shows "Game starting!" with a "Join Game" button
3. Players click "Join Game" → auto-calls `POST /api/players` with their tournament name and the new game code
4. Players are redirected to `/game/[gameCode]` for normal gameplay
5. Game finishes → placement adapter computes rankings → points awarded → leaderboard updated
6. Players see game results as normal, plus a "Back to Tournament" link
7. Players return to `/tournament/[code]` — leaderboard shows updated standings

### Tournament End

- Host clicks "End Tournament" or target game count is reached
- Final leaderboard with winner announcement
- Per-game breakdown showing placements and points earned per game

### Late Join

- Players can join the tournament between games at any time
- They start with 0 points and `games_played = 0`
- Leaderboard shows games played count so late joiners' scores have context

### Player Dropout

- If a player doesn't join a particular game, they get 0 points for it
- Their `games_played` doesn't increment
- They keep all previously accumulated points
- They remain on the leaderboard

## Integration with Game Finish

The placement computation hooks into the existing `finish-game` API route. After `markGameFinished()` is called, if the game has a `tournament_id`:

1. Fetch tournament players and the game's player list
2. Build a map: game `player_id` → `tournament_player_id` (matched by case-insensitive name via `player_name.toLowerCase()`. Players must join games with their exact tournament name — the auto-join button enforces this.)
3. Call `computeTournamentPlacements()` for the game type
4. Store placements in `tournament_games.placements`
5. Calculate points from placements using the tournament's `placement_points` array
6. Update `tournament_players.total_points` and `games_played` for each participant
7. If `target_game_count` is set and reached, set tournament status to `finished`

## Implementation Phases

### Phase 1: Core Tournament + Trivia

- DB migration: all 3 tables + `tournament_id` FK on games
- Tournament CRUD API routes
- Tournament create page
- Tournament lobby page (join, player list, host controls)
- Placement adapter for trivia only
- Integration with finish-game hook
- Leaderboard display
- "Back to Tournament" link on game results

### Phase 2: Full Game Support + Playlist

- Placement adapters for remaining 12 game types
- Pre-planned playlist UI (add/reorder games at creation)
- Tournament leaderboard overlay on game results screen
- Per-game breakdown on final results
- Polish: animations, transitions between games

## Edge Cases

- **Name collision:** Unique constraint on `(tournament_id, player_name)` prevents duplicates. Join API returns 409 with `{ error: "Name already taken" }`.
- **Host leaves:** Tournament persists in DB. Any holder of the `host_token` can resume control.
- **Game abandoned:** If a game is finished early via "End Game," placements are still computed from whatever data exists (partial results are better than no results).
- **Empty game:** If no tournament players join a game, `tournament_games.placements` is set to `{}` (empty object). The game still counts toward `target_game_count`.
- **Concurrent games:** Tournaments are strictly sequential — one active game at a time. A game is considered "active" if `tournament_games.status` is `'active'` (covers both `game.status = 'waiting'` and `game.status = 'active'`). The `POST /api/tournaments/[code]/games` route returns 400 with `{ error: "A game is already in progress" }` if an active tournament game exists.
- **Team game placements:** For Describe-It, the adapter fetches `describe_it_players` to get each player's `team` assignment, computes team scores via `computeDescribeItScores()`, then assigns each player their team's rank. For Codewords, the adapter fetches `codewords_player_roles` for team mapping and `codewords_boards.winner` for the winning team.

## DB Migration

File: `supabase/migrations/088_tournaments.sql`

Creates all 3 tables, adds `tournament_id` to `games`, sets up RLS policies, and adds tables to `supabase_realtime` publication.
