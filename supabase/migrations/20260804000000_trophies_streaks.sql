-- Trophies & streaks — the data layer. See docs/trophies-and-streaks.md §3–§5.
--
-- Batch 2 of docs/platform-features-master-plan.md. Depends on `profiles`
-- (20260803000000_profiles_identity.sql), which already carries the trophy/streak columns
-- (trophy_points, trophy_level, current_streak, longest_streak, last_active_date,
-- streak_freezes) so this migration only adds what hangs off them.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY POSTURE: these tables are SERVICE-ROLE ONLY. No exceptions.
-- ─────────────────────────────────────────────────────────────────────────────
-- Trophies and streaks underpin the paid tiers, so a client that can write them can
-- self-grant entitlements. The previous migration in this feature learned that the hard way:
-- audit finding C2 (docs/security-audit-2026-08.md) — `public_profiles` was created as a
-- "narrow read view" whose comment reasoned carefully about reads and never considered
-- writes. A simple view is auto-updatable, Supabase's defaults granted the public roles
-- INSERT/UPDATE/DELETE on it, and without `security_invoker` it ran with definer rights. An
-- anonymous browser console set another account's trophy_level to 999, write-through to
-- `profiles` confirmed. The reasoning in the comment was correct and the object was still a
-- critical hole.
--
-- So, deliberately, this migration:
--   * creates NO views (that entire class is avoided rather than mitigated);
--   * grants the public roles NOTHING — not even SELECT. Every read is served by an API
--     route holding the service role, which is also what lets us filter `hidden` trophies
--     and inactive catalog rows server-side instead of shipping them and hoping;
--   * enables RLS on every table with no policies, so if a grant is ever restored by
--     accident the rows are still denied — two independent controls, not one;
--   * revokes TRUNCATE/TRIGGER/REFERENCES explicitly. TRUNCATE is NOT subject to RLS, so no
--     policy written here could stop it; the data API never issues it, so nothing is lost.
--
-- 20260803160000_default_privileges_lockdown.sql already makes new tables SELECT-only for the
-- public roles. The explicit revokes below are belt-and-braces: default privileges apply per
-- granting role, and this file must be correct even if it is replayed somewhere that lockdown
-- never reached.

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
-- Seeded from src/lib/trophies/catalog.ts and editable by the admin panel (§6A).
create table if not exists trophies (
  id          text primary key,
  game_type   text,                                  -- null = cross-game / platform trophy
  tier        text not null check (tier in ('bronze', 'silver', 'gold', 'platinum')),
  title       text not null check (length(title) <= 80),
  description text not null check (length(description) <= 300),
  criteria    jsonb not null,                        -- the DSL (§3.10)
  points      integer not null check (points >= 0 and points <= 1000),
  -- Hidden trophies must not be discoverable before they're earned, which is precisely why
  -- this table is not client-readable: the filtering happens server-side, not in the client.
  hidden      boolean not null default false,
  sort_order  integer not null default 0,
  is_active   boolean not null default true
);

-- Cached rarity, refreshed by a job. Never computed per request.
create table if not exists trophy_rarity (
  trophy_id        text primary key references trophies(id) on delete cascade,
  earned_count     integer not null default 0,
  eligible_players integer not null default 0,
  pct              numeric not null default 0,
  refreshed_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Per-profile progression
-- ---------------------------------------------------------------------------
-- Counters feeding the `counter` criteria. `counters` holds scalars only — sets live in
-- player_distinct, where the PK dedupes them and count(*) is the value.
create table if not exists player_stats (
  profile_id   uuid not null references profiles(id) on delete cascade,
  game_type    text not null,                        -- '__global__' for cross-game counters
  games_played integer not null default 0 check (games_played >= 0),
  games_won    integer not null default 0 check (games_won >= 0),
  counters     jsonb not null default '{}',
  updated_at   timestamptz not null default now(),
  primary key (profile_id, game_type)
);

-- Canonical storage for `distinct` criteria (modes_played, opponents, …). One row per
-- (profile, set, member): the PK gives free dedupe and count(*) is the value. Deliberately
-- NOT a jsonb array on player_stats — arrays can't be deduped, indexed or counted cheaply,
-- and grow unbounded.
create table if not exists player_distinct (
  profile_id    uuid not null references profiles(id) on delete cascade,
  key           text not null check (length(key) <= 64),
  member        text not null check (length(member) <= 128),
  first_seen_at timestamptz not null default now(),
  primary key (profile_id, key, member)
);
create index if not exists idx_player_distinct_lookup on player_distinct (profile_id, key);

-- Trophies a profile has earned.
create table if not exists player_trophies (
  profile_id uuid not null references profiles(id) on delete cascade,
  -- RESTRICT, deliberately, while `profile_id` cascades. Deleting a person should take their
  -- award records with them; deleting a CATALOG ROW must never erase what other people earned.
  -- Cascade here would also silently desync `profiles.trophy_points` / `trophy_level`, which
  -- are cached aggregates this migration has no trigger to recompute — so an admin tidying up
  -- the catalog would leave every affected player's level wrong with no error anywhere.
  -- Retire a trophy with `is_active = false` instead; that is what the flag is for.
  trophy_id  text not null references trophies(id) on delete restrict,
  earned_at  timestamptz not null default now(),
  primary key (profile_id, trophy_id)
);
create index if not exists idx_player_trophies_trophy on player_trophies (trophy_id);

-- Processed-session markers making the award transaction idempotent (§3.8).
--
-- This is the control that stops a replayed finish from paying out twice. The award engine
-- must insert here inside the same transaction as the award and treat a PK conflict as
-- "already done" — never derive the payout from anything the caller sends. A client that can
-- influence how much it earned is the recurring failure this whole posture exists to prevent.
create table if not exists awarded_sessions (
  profile_id uuid not null references profiles(id) on delete cascade,
  session_id text not null check (length(session_id) <= 128),
  awarded_at timestamptz not null default now(),
  primary key (profile_id, session_id)
);

-- ---------------------------------------------------------------------------
-- Lock every one of them down, in this same file.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'trophies', 'trophy_rarity', 'player_stats', 'player_distinct',
    'player_trophies', 'awarded_sessions'
  ] loop
    -- RLS with no policies: deny-all for anything that isn't the service role, which bypasses
    -- RLS by design. This is the second of the two controls — the grants below are the first.
    execute format('alter table public.%I enable row level security', t);
    -- Belt to the default-privileges braces. Also drops SELECT: nothing reads these directly,
    -- and "no grant" is a stronger statement than "a policy denies it".
    execute format('revoke all on public.%I from anon, authenticated', t);
    -- Privileges in Postgres are CUMULATIVE: a role holds what it was granted directly, plus
    -- what it inherits, plus anything granted to PUBLIC. Revoking from anon/authenticated
    -- alone therefore proves nothing — a PUBLIC grant would still reach them. Revoke that too.
    execute format('revoke all on public.%I from public', t);
    -- TRUNCATE is not subject to RLS, so no policy above could stop it. TRIGGER and REFERENCES
    -- are equally never issued by the data API. Default grants hand out all three.
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- ROLLBACK (drafted). Apply as a NEW forward migration; do NOT edit this file
-- after it has shipped.
--
--   drop table if exists awarded_sessions;
--   drop table if exists player_trophies;
--   drop table if exists player_distinct;
--   drop table if exists player_stats;
--   drop table if exists trophy_rarity;
--   drop table if exists trophies;
--
-- `profiles` keeps its trophy/streak columns — they were created with the identity
-- migration and are not owned by this one.
-- ----------------------------------------------------------------------------
