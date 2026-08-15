-- Bots-in-room, Phase 1 — see docs/bots-in-room-plan.md.
--
-- Adds `players.is_bot` so a bot player can occupy a real seat in a real
-- multiplayer room. The rest of the machinery (ticker driver, "Add bot" UI,
-- late-join displacement) sits on top of this column.
--
-- Design decisions this migration commits to:
--   - Bots are REAL players.id rows. Every game route already assumes the
--     current player is a real row; special-casing "virtual" bots would
--     bleed into every play/draw/choose/roll path. One column instead.
--   - `is_bot` is NOT the resume_token style secret — it's public. The client
--     needs to see it to render the 🤖 chip in the roster, so it lives inside
--     the anon column-level SELECT (see the re-grant block below).
--   - Default false, so every existing row (all humans) stays a human. No
--     backfill needed.

alter table players add column if not exists is_bot boolean not null default false;

-- Column-level SELECT grants have to be re-run whenever a column is added to
-- `players` or `games`, per the games-column-grants gotcha (memory:
-- games-column-grants-gotcha). Skipping this means anon reads of the new
-- column silently fail with 42501 and the roster can't tell bots from humans.
-- Copies the pattern from 20260629170000_regrant_games_players_select.sql.
do $$
declare
  game_cols text;
  player_cols text;
  role_name text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into game_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'games' and column_name <> 'host_token';

  select string_agg(quote_ident(column_name), ', ')
    into player_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'players' and column_name <> 'resume_token';

  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('revoke select on public.games from %I', role_name);
    execute format('grant select (%s) on public.games to %I', game_cols, role_name);
    execute format('revoke select on public.players from %I', role_name);
    execute format('grant select (%s) on public.players to %I', player_cols, role_name);
  end loop;
end $$;

-- Partial index for the ticker's "does this game have any bots?" check. Only
-- rows with is_bot=true are indexed, so the index stays small; a game with
-- zero bots does one indexed lookup returning nothing rather than scanning
-- the whole players table on every tick.
create index if not exists idx_players_bot_by_game on public.players (game_id) where is_bot = true;

comment on column public.players.is_bot is
  'True when this player row is a bot. Bots are seated in real rooms and take turns via the API, driven by the in-process game-tick loop (src/lib/game-tick.ts). Load-bearing invariant: bots never keep a human out of a room — a human joining a full-of-bots room evicts the newest bot instead of hitting a "room full" error. See docs/bots-in-room-plan.md.';
