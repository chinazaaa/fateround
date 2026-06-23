CREATE TABLE question_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  game_type TEXT NOT NULL CHECK (game_type IN ('trivia', 'would_you_rather', 'most_likely_to')),
  author_name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  question_count INT NOT NULL DEFAULT 0,
  questions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ
);

ALTER TABLE question_packs ENABLE ROW LEVEL SECURITY;
-- Public can read approved packs and insert new ones; no public update/delete
CREATE POLICY "public_read_approved" ON question_packs FOR SELECT USING (status = 'approved');
CREATE POLICY "public_insert" ON question_packs FOR INSERT WITH CHECK (true);

CREATE INDEX question_packs_status_game_type ON question_packs (status, game_type);
