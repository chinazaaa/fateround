-- Play Again · Same Settings — ready-up ring (piloted on Whot).
--
-- After a game finishes the host can tap "Play again · same settings". This reopens the
-- game as an OPEN lobby (status = waiting) — so previous spectators and new people can
-- join — but flagged so the UI shows a ready-up ring instead of the standard lobby:
-- each player taps "get ready" (they take a seat) and the host taps "Start game" once
-- enough players are ready. "Return to lobby" reopens the plain lobby (flag off).
--
--   games.replay_pending — true while the ready-up ring should show for this waiting lobby.
--                          Set by "Play again · same settings", cleared on start / return-to-lobby.
--
-- Readiness itself reuses the existing seat mechanic (players.spectator = false), so no
-- extra per-player column is needed.

alter table games add column if not exists replay_pending boolean not null default false;

-- Re-grant column-level SELECT on games to the public roles so anon/authenticated reads
-- keep working after adding the column (see 20260705120000 for why this block is required —
-- a missing column-level grant surfaces as "permission denied for table games"). Idempotent.
do $$
declare
  game_cols text;
  role_name text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into game_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'games' and column_name <> 'host_token';

  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('revoke select on public.games from %I', role_name);
    execute format('grant select (%s) on public.games to %I', game_cols, role_name);
  end loop;
end $$;
