-- Discovery Phase B — per-game-type push subscriptions.
--
-- The app has no accounts, so "subscriber" is a device: the Expo push token
-- (mobile) or the browser PushSubscription (web). One device_id row per device;
-- one subscription row per (device, game_type) pair. When a game flips to
-- is_public=true, the server fans out to every device subscribed to that type
-- (rate-limited via notification_dispatches so a burst of create/PATCH toggles
-- can't spam the same device).
--
-- Load-bearing invariants (see docs/mobile-discovery-plan.md § Phase B):
--   - Per-game-type subscription — never all-games at once.
--   - Quiet/available hours DROP pushes, they never queue.
--   - Times stored in the user's local timezone (IANA).

create table if not exists public.notification_subscriber_devices (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('mobile', 'web')),
  -- Mobile: the Expo push token (ExponentPushToken[…]). Web: the browser
  -- PushSubscription endpoint URL. Unique across the whole table because a
  -- given token/endpoint IS the device — a duplicate would fan out twice.
  token_key text not null unique,
  -- Web-only VAPID keys (mobile leaves both null; Expo handles the crypto).
  web_p256dh text,
  web_auth text,
  -- Mobile-only platform hint ('ios' | 'android' | 'unknown').
  platform text,
  -- IANA timezone (e.g. "America/Los_Angeles") for quiet-hours evaluation.
  timezone text,
  quiet_mode text not null default 'off' check (quiet_mode in ('off', 'quiet', 'available')),
  -- Minutes since local midnight (0..1439). Null when quiet_mode='off'.
  quiet_start_minutes int check (quiet_start_minutes is null or (quiet_start_minutes >= 0 and quiet_start_minutes <= 1439)),
  quiet_end_minutes int check (quiet_end_minutes is null or (quiet_end_minutes >= 0 and quiet_end_minutes <= 1439)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_subscriptions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.notification_subscriber_devices(id) on delete cascade,
  game_type text not null,
  created_at timestamptz not null default now(),
  unique (device_id, game_type)
);

create index if not exists notification_subscriptions_game_type_idx
  on public.notification_subscriptions (game_type);

-- Rate-limit log. A row per delivered push. Enqueue reads the most recent row
-- for (device_id, game_type) and skips if < 30 min old — that keeps a host
-- toggling public/private repeatedly from spamming subscribers.
create table if not exists public.notification_dispatches (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.notification_subscriber_devices(id) on delete cascade,
  game_type text not null,
  game_id text references public.games(id) on delete set null,
  sent_at timestamptz not null default now()
);

create index if not exists notification_dispatches_ratelimit_idx
  on public.notification_dispatches (device_id, game_type, sent_at desc);

-- Only server routes touch these tables (writes via service role, reads never
-- from the client — the /api/notifications endpoint returns just this device's
-- subscriptions). RLS enabled with no public policies, same shape as the
-- game-scoped push tables (migrations 0089 + 20260710230000).
alter table public.notification_subscriber_devices enable row level security;
alter table public.notification_subscriptions enable row level security;
alter table public.notification_dispatches enable row level security;

-- Housekeeping: drop dispatch rows older than 24 hours every hour via pg_cron
-- (they only matter for the 30-minute rate-limit window; anything older is
-- dead weight). Skip cleanly when pg_cron isn't available in this env.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'notification_dispatches_gc';
    perform cron.schedule(
      'notification_dispatches_gc',
      '17 * * * *',
      $sql$ delete from public.notification_dispatches where sent_at < now() - interval '24 hours'; $sql$
    );
  end if;
end
$$;
