-- Add AI question columns to games table
alter table games add column if not exists ai_questions_enabled boolean default false;
alter table games add column if not exists ai_questions_config jsonb default '{}'::jsonb;
alter table games add column if not exists ai_generated_questions jsonb default '[]'::jsonb;
