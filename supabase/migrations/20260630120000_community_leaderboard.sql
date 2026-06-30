-- Community public leaderboard: manual-entry winners for the WhatsApp community.
--
-- These tables are entirely separate from the in-app game engine. The community
-- games are played on WhatsApp every night; the community manager records ONE
-- winner per game per day, and the public /leaderboard aggregates those daily
-- wins into Today / This Week / This Month views.
--
-- Access model (consistent with the Phase 5 RLS lockdown): every read and write
-- goes through server routes using the service role, which BYPASSES RLS. We enable
-- RLS with NO policies, so the anon/authenticated keys can neither read nor write
-- these tables directly. No column grants are needed because nothing public-facing
-- touches them outside the trusted server boundary.

-- Curated list of games shown on the leaderboard (admin-managed via /admin/community).
create table if not exists community_games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  accent text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Canonical player identity so name variants ("John" / " john ") don't split the
-- leaderboard. normalized_name = lower(trim(display_name)); used for dedupe + autocomplete.
create table if not exists community_players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  normalized_name text not null unique,
  created_at timestamptz not null default now()
);

-- One winner per game per day. Re-entry upserts on (game_id, result_date).
create table if not exists community_results (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references community_games(id) on delete cascade,
  player_id uuid not null references community_players(id) on delete cascade,
  result_date date not null,
  recorded_by text not null default 'manager',
  recorded_at timestamptz not null default now(),
  unique (game_id, result_date)
);

create index if not exists community_results_date_idx on community_results (result_date);
create index if not exists community_results_player_idx on community_results (player_id);

-- Small key/value store. Holds the hashed community-manager access code
-- (key = 'manager_code_hash'); the plaintext code is never stored.
create table if not exists community_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

-- Enable RLS with no policies => service-role-only access.
do $$
declare
  tbl text;
  tables text[] := array['community_games', 'community_players', 'community_results', 'community_settings'];
begin
  foreach tbl in array tables loop
    execute format('alter table public.%I enable row level security', tbl);
  end loop;
end $$;

-- Starter game list — the admin renames/reorders/adds to these via /admin/community.
insert into community_games (name, slug, accent, sort_order) values
  ('Whot', 'whot', '#f43f5e', 1),
  ('Trivia', 'trivia', '#22c55e', 2),
  ('Scrabble', 'scrabble', '#fb923c', 3)
on conflict (slug) do nothing;
