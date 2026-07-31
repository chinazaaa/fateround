-- Identity foundation: `profiles` keyed on auth.uid().
--
-- See `docs/accounts-and-identity-plan.md` (Slice 2) and `docs/trophies-and-streaks.md` §2/§5.
-- This is the row a subscription, a streak, a trophy or a club membership can hang off. Nothing
-- in the app calls it yet — the client libs land dormant in this slice and are wired up in Slice 3.
--
-- TWO IDENTITY WORLDS — the load-bearing rule for this whole feature:
--   * Gameplay keeps authorizing on the secret token IN THE REQUEST (games.host_token,
--     players.resume_token, rooms.creator_token). Unchanged. See `docs/rls-hardening.md`.
--   * Progression authorizes on auth.uid(). New, and additive only.
-- The only join between them is `players.profile_id`, which is NULLABLE FOREVER: an
-- un-attributed guest is a permanently supported state, not a migration to finish. No gameplay
-- path may ever require a profile.
--
-- DEPLOY NOTES (dashboard config, not SQL):
--   1. Enable anonymous sign-ins.
--   2. RAISE THE ANONYMOUS SIGN-IN RATE LIMIT — the default is 30/hour per IP, which breaks a
--      NAT'd 40-student classroom or two 20-person parties on one WiFi. Size it to the biggest
--      room we support.
--   3. Point Auth's custom SMTP at Resend and set the OTP template to emit {{ .Token }}
--      (a 6-digit code, not a magic link).
--   4. Supabase does NOT prune anonymous users automatically — schedule the 90-day job
--      (see the note by `profiles.is_anonymous` below).

-- ---------------------------------------------------------------------------
-- profiles — one row per identity, anonymous OR email. id == auth.users.id.
-- ---------------------------------------------------------------------------
-- The trophy/streak/pref columns are deliberately created NOW, ahead of the features that use
-- them, so later batches extend behaviour without re-migrating this table (per the master plan).
create table if not exists profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  handle           text,                        -- display name; non-unique by design, null for a fresh anon
  avatar_url       text,
  is_anonymous     boolean not null default true,  -- false once an email identity is attached (Case A)
  -- Trophies (see trophies-and-streaks.md §3). Cached aggregates, recomputed on award.
  trophy_points    integer not null default 0,
  trophy_level     integer not null default 1,
  -- Streaks (§4). `last_active_date` is a WAT calendar date, not a timestamp.
  current_streak   integer not null default 0,
  longest_streak   integer not null default 0,
  last_active_date date,
  streak_freezes   integer not null default 0,
  -- Profile-backed defaults, so we stop re-asking signed-in players (master plan "Batch 1").
  default_voice_on boolean,
  preferred_theme  text,
  created_at       timestamptz not null default now()
);

-- Supports the 90-day anonymous prune:
--   delete from auth.users u using profiles p
--    where p.id = u.id and p.is_anonymous and p.created_at < now() - interval '90 days';
-- Deleting the auth.users row cascades to profiles. Never prune a profile carrying progression —
-- gate the job on the streak/trophy counters still being at their defaults.
create index if not exists idx_profiles_anon_prune on profiles (is_anonymous, created_at);

-- ---------------------------------------------------------------------------
-- profile_merges — audit for Case-B merges (trophies-and-streaks.md §2.7).
-- ---------------------------------------------------------------------------
-- `from_profile` is intentionally NOT a foreign key: the anonymous profile it names is deleted
-- as part of the merge, and the audit row has to outlive it.
--
-- Case B is a NO-OP for now, and that is the point of shipping identity before trophies: with no
-- progression data in existence there is nothing to reconcile. The real mergeProfiles() lands
-- with the trophies batch. Log the merge from day one anyway so the history is complete.
create table if not exists profile_merges (
  id           uuid primary key default gen_random_uuid(),
  from_profile uuid not null,
  into_profile uuid not null,
  merged_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- players.profile_id — the single join between the two identity worlds.
-- ---------------------------------------------------------------------------
-- Set on the finish path when the request carried a valid JWT; left null otherwise.
-- `on delete set null` so pruning an anonymous profile never destroys game history.
alter table players add column if not exists profile_id uuid references profiles(id) on delete set null;

create index if not exists idx_players_profile on players (profile_id);

-- ⚠️ REQUIRED — the column-GRANT gotcha. 0122 revoked table-level SELECT on `players` from the
-- public roles and re-granted it column-by-column, so a NEW column is unreadable (42501) until
-- it is granted explicitly. This is not optional boilerplate.
grant select (profile_id) on public.players to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS — a different convention from the rest of this schema, on purpose.
-- ---------------------------------------------------------------------------
-- Gameplay tables are "anon reads everything, server writes everything". Identity tables are
-- "you read your own row, server writes everything". Keep the two worlds cleanly separated.
alter table profiles enable row level security;
drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own" on profiles
  for select to authenticated
  using (auth.uid() = id);

-- No INSERT/UPDATE/DELETE policy anywhere in this file, deliberately: every write goes through
-- the server using getSupabaseAdmin(), so counters and trophies cannot be forged by a client
-- holding the anon key. Mirrors the pattern in docs/rls-hardening.md.

alter table profile_merges enable row level security;
-- No policies at all — service-role only. The audit log is never client-readable.

-- ---------------------------------------------------------------------------
-- public_profiles — the narrow view public boards read.
-- ---------------------------------------------------------------------------
-- Leaderboards need other people's handles, which owner-only RLS forbids. This view is the
-- sanctioned hole: it runs with the definer's rights (the Postgres default, i.e. it bypasses the
-- policy above) and exposes ONLY these columns. Columns are enumerated explicitly, so adding a
-- sensitive column to `profiles` later cannot leak through here by accident.
-- There is no email or other PII in `profiles` at all — email lives in auth.users.
create or replace view public_profiles as
  select id, handle, avatar_url, trophy_level, current_streak
    from profiles;

grant select on public.public_profiles to anon, authenticated;

-- ----------------------------------------------------------------------------
-- ROLLBACK (drafted). Apply as a NEW forward migration; do NOT edit this file
-- after it has shipped.
--
--   drop view if exists public.public_profiles;
--   alter table players drop column if exists profile_id;
--   drop table if exists profile_merges;
--   drop table if exists profiles;
--
-- Note: dropping `profiles` does NOT remove the auth.users rows created by anonymous
-- sign-in. Disable anonymous sign-ins in the dashboard first, then prune auth.users.
-- ----------------------------------------------------------------------------
