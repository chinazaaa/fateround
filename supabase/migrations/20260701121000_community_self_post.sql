-- Community leaderboard: let in-app game WINNERS self-report their win.
--
-- Until now the leaderboard was populated only by the community manager typing
-- winners at /input (recorded_by = 'manager'). This adds a second, lower-trust
-- path: the winner of an in-app game sees a "Post to community leaderboard"
-- button on their end screen, enters the current weekly access code (the "post
-- code", separate from the manager code), and their win is recorded for today.
--
-- Two schema changes:
--   1. community_games gains `game_type` so each leaderboard game maps to a real
--      in-app GameType (e.g. 'whot', 'checkers'). The admin picks this from a
--      dropdown instead of free text, so the self-post endpoint can resolve
--      "this game result -> this leaderboard row" exactly.
--   2. community_self_posts is a dedupe ledger: one match (in-app game) can only
--      be self-posted once per player, so a winner can't spam the button to
--      inflate their win count. The manager entry path is unaffected.
--
-- The post code and WhatsApp invite URL reuse the existing community_settings
-- key/value store, so no schema is needed for them.

-- 1. Map each leaderboard game to an in-app game type.
alter table community_games
  add column if not exists game_type text;

-- Auto-map existing rows so nothing breaks: the starter slugs (whot, trivia,
-- scrabble) are already valid game-type ids. Rows whose slug isn't a real game
-- type get a harmless value the self-post endpoint simply won't match; the admin
-- can correct them from the dropdown.
update community_games set game_type = slug where game_type is null;

-- 2. Dedupe ledger for self-posted wins. source_game_id is the in-app game code.
create table if not exists community_self_posts (
  id uuid primary key default gen_random_uuid(),
  source_game_id text not null,
  player_id uuid not null references community_players(id) on delete cascade,
  community_game_id uuid not null references community_games(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (source_game_id, player_id)
);

create index if not exists community_self_posts_source_idx on community_self_posts (source_game_id);

-- Service-role-only, consistent with the other community tables.
alter table community_self_posts enable row level security;
