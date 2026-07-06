-- In-game synced Spotify music.
--
-- Adds three things:
--   1. games.music_enabled — per-room feature flag (host toggles it; default off so the
--      feature ships dark and only appears where a host turns it on).
--   2. music_sessions — the shared "now playing" state for a game. The host writes it
--      (via the /api/music/control service-role route); every player receives changes
--      through Supabase Realtime, exactly like the other per-game side tables
--      (monopoly_boards, whot_sessions, …). Clients only READ it, so RLS is enabled with
--      a SELECT-only public policy — no anon writes — while writes flow through the
--      service role. Position is stored as (position_ms, updated_at) so clients can
--      extrapolate the live position rather than the host broadcasting every second.
--   3. spotify_accounts — per-listener OAuth tokens, keyed by the caller's secret identity
--      (a player UUID or a `host-*` id). Contains refresh tokens, so like push_subscriptions
--      it is server-only: RLS on with NO policies and NOT in the realtime publication. Only
--      the Spotify server routes touch it, via the service role.

-- 1. Feature flag on games ---------------------------------------------------
alter table games add column if not exists music_enabled boolean not null default false;

-- 2. Shared music state ------------------------------------------------------
create table if not exists public.music_sessions (
  game_id text primary key references public.games(id) on delete cascade,
  track_uri text,
  track_name text,
  artist text,
  album_art text,
  duration_ms integer,
  is_playing boolean not null default false,
  position_ms integer not null default 0,
  -- Bumped every time the host changes playback; clients extrapolate the live
  -- position from (position_ms + now() - updated_at) while is_playing is true.
  updated_at timestamptz not null default now()
);

alter table public.music_sessions enable row level security;
drop policy if exists "public_read_music_sessions" on public.music_sessions;
create policy "public_read_music_sessions" on public.music_sessions for select using (true);

do $$ begin alter publication supabase_realtime add table music_sessions; exception when duplicate_object then null; end $$;

-- 3. Per-listener Spotify OAuth tokens (server-only) -------------------------
create table if not exists public.spotify_accounts (
  identity text primary key,
  spotify_user_id text,
  display_name text,
  -- 'premium' | 'free' | 'open' — the Web Playback SDK only streams full tracks
  -- for 'premium'; we surface a "Premium required" note otherwise.
  product text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.spotify_accounts enable row level security;

-- 4. Re-grant column-level SELECT on games -----------------------------------
-- 0122 switched anon/authenticated to COLUMN-level SELECT on games (every column except
-- the secret host_token). Any column added afterwards — like games.music_enabled above —
-- must re-run this grant or client/anon reads of `games` break with "permission denied for
-- table games" (42501), which the host page surfaces as a bogus "Access Denied". Idempotent.
do $$
declare
  game_cols text;
  role_name text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into game_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'games' and column_name <> 'host_token';

  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('revoke select on public.games from %I', role_name);
    execute format('grant select (%s) on public.games to %I', game_cols, role_name);
  end loop;
end $$;
