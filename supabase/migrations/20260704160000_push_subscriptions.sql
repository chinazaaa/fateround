-- Web push subscriptions for game lifecycle notifications (start / play-again / end).
--
-- Players opt in from the lobby; the browser hands us a PushSubscription (an endpoint
-- URL + two keys) which we store here keyed to (game_id, player_id). There is no auth
-- in this app — the subscription itself is the identity, and the subscribe endpoint
-- authorizes the caller with the player's secret resume_token (same boundary as
-- /api/players/resume) before inserting as the service role.
--
-- Only server routes touch this table: the subscribe endpoint (writes) and the sender
-- in src/lib/push.ts (reads + prunes dead endpoints). It is never read from the client,
-- so RLS is enabled with NO public policies — anon/authenticated get no access, matching
-- the RLS-hardening boundary where all writes flow through service-role server routes.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_game_id on public.push_subscriptions(game_id);

alter table public.push_subscriptions enable row level security;
