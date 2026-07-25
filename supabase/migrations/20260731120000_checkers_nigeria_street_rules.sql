-- Nigerian Draughts "Street Rules" — an opt-in, off-by-default room setting.
--
-- Standard/competitive play (Street Rules off, the default everywhere) enforces mandatory
-- capture exactly like International: if a capture is available you must take it. Street
-- Rules relaxes that: a player MAY decline an available capture and make a simple move
-- instead. When they do, every one of their pieces that could have captured becomes
-- "huffable" — on the very next turn, the opponent may spend their turn removing one of
-- those pieces from the board (the classic "huffing" penalty) instead of making a move.
--
-- huffable_squares holds the mover's own pieces that had a capture available but went
-- unplayed; NULL/empty means nothing is currently huffable.

ALTER TABLE games ADD COLUMN IF NOT EXISTS checkers_nigeria_street_rules boolean NOT NULL DEFAULT false;

-- games uses COLUMN-level SELECT grants for the public roles (migration 0122). ADD COLUMN does
-- not extend them, so grant read on this non-secret setting or GAME_SELECT errors 42501.
GRANT SELECT (checkers_nigeria_street_rules) ON public.games TO anon, authenticated;

ALTER TABLE checkers10_sessions ADD COLUMN IF NOT EXISTS huffable_squares text[] NOT NULL DEFAULT '{}';
