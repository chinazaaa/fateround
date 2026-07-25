-- Mafia: remember last round's Mafia-team player ids so Play Again can bias role
-- assignment away from handing the exact same person(s) the Mafia team again.
ALTER TABLE games
ADD COLUMN IF NOT EXISTS mafia_last_team_player_ids uuid[];
