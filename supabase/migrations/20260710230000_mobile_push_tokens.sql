-- Expo push tokens for native mobile lifecycle + turn notifications.
--
-- Players opt in from the mobile app; we store the Expo push token keyed to
-- (game_id, player_id). The subscribe endpoint authorizes with resume_token
-- (same boundary as /api/players/resume) before upserting as service role.
--
-- Only server routes touch this table. RLS enabled with no public policies.

create table if not exists public.mobile_push_tokens (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios', 'android', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mobile_push_tokens_game_id on public.mobile_push_tokens(game_id);
create index if not exists idx_mobile_push_tokens_player_id on public.mobile_push_tokens(player_id);

alter table public.mobile_push_tokens enable row level security;
