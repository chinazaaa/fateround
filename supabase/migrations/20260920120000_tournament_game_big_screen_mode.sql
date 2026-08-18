-- Per-tournament-game "display mode" — does the projector show the game's
-- current state (question/letter/etc.) or just the tournament leaderboard?
--   'phone_only'  → today's default; the big screen shows only the leaderboard
--                    and everyone plays from their phone
--   'projector'   → the big screen also renders a spectator view of the
--                    current game (giant Trivia question, giant I Call On
--                    letter, etc.). Players still interact from their phones.
--
-- Frozen once the game is spawned: switching mid-game would flap the
-- projector between two very different renders, so the host chooses at
-- spawn time and it stays fixed for that game. Different games in the same
-- tournament can each carry their own mode (e.g. Trivia on projector, I
-- Call On on phones), which is why this lives on tournament_games rather
-- than tournaments.
alter table tournament_games add column if not exists big_screen_mode text not null default 'phone_only';

alter table tournament_games drop constraint if exists tournament_games_big_screen_mode_check;
alter table tournament_games add constraint tournament_games_big_screen_mode_check
  check (big_screen_mode in ('phone_only', 'projector'));
