alter table question_packs add column if not exists tags TEXT[] NOT NULL DEFAULT '{}';
create index if not exists question_packs_tags ON question_packs USING GIN (tags);
