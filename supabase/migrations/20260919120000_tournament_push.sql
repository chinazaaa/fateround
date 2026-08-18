-- Per-tournament push subscriptions + dispatch bookkeeping for scheduled events.
--
-- Runs in parallel with the existing `push_subscriptions` table (games): keeping
-- them separate avoids a schema change on the games table and lets tournament
-- push evolve independently. Same on-disk shape as push_subscriptions so the
-- fanout code can be near-identical.
--
-- One row per (browser endpoint, tournament) so a single device subscribed to
-- three tournaments has three rows and receives three separate reminders.
create table if not exists tournament_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tournament_id text not null references tournaments(id) on delete cascade,
  -- Whichever secret authorised the subscribe call — a tournament_player resume
  -- token OR the tournament host_token. Stored so we could revoke by role if
  -- ever needed (not used today; upsert on (tournament_id, endpoint) is the
  -- primary key for freshness).
  role_key text not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (tournament_id, endpoint)
);

create index if not exists idx_tournament_push_by_tournament on tournament_push_subscriptions(tournament_id);

-- Service-role only: subscriptions carry a browser secret and are never written or read from anon clients.
alter table tournament_push_subscriptions enable row level security;

-- Dispatch bookkeeping: the cron fanout marks these once per tournament so a
-- second poll doesn't re-fire the same reminder. Nullable = "hasn't fired yet".
alter table tournaments add column if not exists push_sent_t15_at timestamptz;
alter table tournaments add column if not exists push_sent_t0_at timestamptz;
