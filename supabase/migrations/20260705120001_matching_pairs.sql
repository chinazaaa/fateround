-- ── Matching Pairs (Memory Match) ────────────────────────────────────────────
-- Adds round metadata column and a per-flip submission table that mirrors
-- the sudoku_submissions / word_hunt_submissions pattern exactly.
-- Final per-player results (placement, bonuses, etc.) are computed from
-- memory_match_submissions rows rather than a separate results table.

-- 1. Store game configuration (icon set, pair colours) in round metadata.
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS memory_match_metadata jsonb;

-- 2. Per-flip submission table.
--    One row per card-flip attempt (correct = matched pair; incorrect = wrong attempt).
--    pair_index identifies which pair (0-based) was involved in the flip.
--    is_match is true when BOTH cards of the pair have been correctly flipped in sequence.
CREATE TABLE IF NOT EXISTS memory_match_submissions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        text        NOT NULL REFERENCES games(id)   ON DELETE CASCADE,
  round_id       uuid        NOT NULL REFERENCES rounds(id)  ON DELETE CASCADE,
  player_id      uuid        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- pair_index: which pair (0-based) was matched or missed
  pair_index     integer     NOT NULL,
  -- is_match: true = pair was successfully matched, false = wrong attempt (mismatch)
  is_match       boolean     NOT NULL,
  -- current_streak at the moment of this event (after incrementing / resetting)
  streak_at_time integer     NOT NULL DEFAULT 0,
  -- streak bonus awarded for THIS event (>0 only when streak_at_time % 3 == 0 and is_match)
  streak_bonus   integer     NOT NULL DEFAULT 0,
  -- cumulative points for this player after this event
  points_after   integer     NOT NULL DEFAULT 0,
  submitted_at   timestamptz NOT NULL DEFAULT now()
);

-- Progress counters broadcast via realtime so opponents can see "X has matched N/M pairs"
-- without syncing full board state.
CREATE TABLE IF NOT EXISTS memory_match_progress (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        text        NOT NULL REFERENCES games(id)   ON DELETE CASCADE,
  round_id       uuid        NOT NULL REFERENCES rounds(id)  ON DELETE CASCADE,
  player_id      uuid        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  pairs_matched  integer     NOT NULL DEFAULT 0,
  wrong_attempts integer     NOT NULL DEFAULT 0,
  finished       boolean     NOT NULL DEFAULT false,
  finish_rank    integer,                              -- set when finished=true
  finished_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(round_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_match_submissions_game_id  ON memory_match_submissions(game_id);
CREATE INDEX IF NOT EXISTS idx_memory_match_submissions_round_id ON memory_match_submissions(round_id);
CREATE INDEX IF NOT EXISTS idx_memory_match_submissions_player_id ON memory_match_submissions(player_id);

CREATE INDEX IF NOT EXISTS idx_memory_match_progress_game_id   ON memory_match_progress(game_id);
CREATE INDEX IF NOT EXISTS idx_memory_match_progress_round_id  ON memory_match_progress(round_id);
CREATE INDEX IF NOT EXISTS idx_memory_match_progress_player_id ON memory_match_progress(player_id);

-- RLS (open during game – the service-role API enforces auth, not DB policies)
ALTER TABLE memory_match_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_memory_match_submissions" ON memory_match_submissions;
CREATE POLICY "public_memory_match_submissions"
  ON memory_match_submissions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE memory_match_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_memory_match_progress" ON memory_match_progress;
CREATE POLICY "public_memory_match_progress"
  ON memory_match_progress FOR ALL USING (true) WITH CHECK (true);

-- Realtime publication
do $$ begin
  alter publication supabase_realtime add table memory_match_submissions;
  exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table memory_match_progress;
  exception when duplicate_object then null;
end $$;

-- 3. Extend games.game_type CHECK constraint to include 'matching_pairs'.
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_type_check;
ALTER TABLE games ADD CONSTRAINT games_game_type_check CHECK (game_type IN (
  'smash_marry_kill',
  'red_flag_green_flag',
  'smash_or_pass',
  'parent_approval',
  'would_you_rather',
  'never_have_i_ever',
  'pick_a_number',
  'this_or_that',
  'most_likely_to',
  'who_said_this',
  'hot_seat',
  'custom',
  'anonymous_messages',
  'secret_message',
  'bingo',
  'codewords',
  'trivia',
  'two_truths',
  'monopoly',
  'yahtzee',
  'whot',
  'crazy_eights',
  'ludo',
  'i_call_on',
  'sudoku',
  'tic_tac_toe',
  'word_hunt',
  'chess',
  'describe_it',
  'scrabble',
  'snake_and_ladder',
  'checkers',
  'mahjong',
  'mafia',
  'matching_pairs'
));

-- 4. Extend app_feedback.game_type CHECK constraint.
ALTER TABLE app_feedback DROP CONSTRAINT IF EXISTS app_feedback_game_type_check;
ALTER TABLE app_feedback ADD CONSTRAINT app_feedback_game_type_check CHECK (game_type IN (
  'general',
  'smash_marry_kill',
  'red_flag_green_flag',
  'smash_or_pass',
  'parent_approval',
  'would_you_rather',
  'never_have_i_ever',
  'pick_a_number',
  'this_or_that',
  'most_likely_to',
  'who_said_this',
  'hot_seat',
  'custom',
  'anonymous_messages',
  'secret_message',
  'bingo',
  'codewords',
  'trivia',
  'two_truths',
  'monopoly',
  'yahtzee',
  'whot',
  'crazy_eights',
  'ludo',
  'i_call_on',
  'sudoku',
  'tic_tac_toe',
  'word_hunt',
  'chess',
  'describe_it',
  'scrabble',
  'snake_and_ladder',
  'checkers',
  'mahjong',
  'mafia',
  'matching_pairs'
));

-- 5. Extend game_player_limits CHECK constraint and seed default limit.
ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN (
    'anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths',
    'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo', 'i_call_on',
    'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'checkers', 'scrabble',
    'describe_it', 'snake_and_ladder', 'mahjong', 'mafia', 'matching_pairs'
  )
);

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('matching_pairs', 20)
ON CONFLICT (game_type) DO NOTHING;

-- 6. Re-grant column-level SELECT on games/players so new columns are readable.
do $$
declare
  game_cols   text;
  player_cols text;
  role_name   text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into game_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'games'
     and column_name <> 'host_token';

  select string_agg(quote_ident(column_name), ', ')
    into player_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'players'
     and column_name <> 'resume_token';

  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('revoke select on public.games from %I', role_name);
    execute format('grant select (%s) on public.games to %I', game_cols, role_name);
    execute format('revoke select on public.players from %I', role_name);
    execute format('grant select (%s) on public.players to %I', player_cols, role_name);
  end loop;
end $$;
