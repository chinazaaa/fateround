-- Coins & Shop — Phase 1 foundation (schema only; no player-visible UI yet).
--
-- Everything the earn / spend / migrate / adjust paths need to hang off. Kept
-- deliberately additive: no existing column is renamed and no existing row
-- semantically changes. Server-authoritative writes go through the RPC
-- functions in the sibling migration (…_coins_functions.sql). RLS on every
-- new table is default-deny; nothing on this list should be readable by anon
-- or the authenticated player role except the profile-scoped rows explicitly
-- policied below.
--
-- Reference: docs/coins-and-shop-plan.md § "Launch sequencing" → Phase 1.

-- ---------------------------------------------------------------------------
-- profiles.coins — the balance, cached from coin_ledger for cheap reads.
-- ---------------------------------------------------------------------------
-- The ledger is the source of truth; this column is the running total the
-- award_coins / spend_coins functions maintain in the same transaction as
-- the ledger row. Never trust a client-supplied delta or balance.
alter table profiles add column if not exists coins bigint not null default 0
  check (coins >= 0);

-- Equipped cosmetics — the currently active pick per slot. Nullable; the
-- default (unequipped) render is what every player has today, so no back-
-- fill needed. Slugs are validated in the app layer against the catalog
-- (game_themes / owned tables). We deliberately don't foreign-key these to
-- the catalog: a retired cosmetic must degrade gracefully to the default
-- rather than blocking a profile update.
alter table profiles add column if not exists equipped_frame          text;
alter table profiles add column if not exists equipped_name_color     text;
alter table profiles add column if not exists equipped_animation      text;
alter table profiles add column if not exists equipped_card_template  text;

-- ---------------------------------------------------------------------------
-- coin_ledger — every credit/debit, forever. Balance is derived from the sum
-- of `delta`; `balance_after` is stored for auditability and for cheap
-- history rendering without re-summing on every page load.
-- ---------------------------------------------------------------------------
-- Reasons match the plan doc. Deliberately a CHECK constraint (not a lookup
-- table) so a new reason is a migration, forcing a review of who's calling
-- it. `ref_id` is free-form text — a game id, tournament id, shop purchase
-- id, or grant version key — the meaning is per-reason.
create table if not exists coin_ledger (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references profiles(id) on delete cascade,
  delta           bigint not null check (delta <> 0),
  balance_after   bigint not null check (balance_after >= 0),
  reason          text not null check (reason in (
    'win', 'daily_challenge', 'streak_multiplier',
    'tournament_placement', 'host_bounty', 'first_mode_bonus',
    'launch_grant_v1', 'welcome_v1', 'guest_migration',
    'shop_purchase', 'refund', 'admin_adjustment'
  )),
  ref_id          text,
  admin_id        text,        -- email of the admin, when reason = admin_adjustment
  admin_note      text,        -- HUMAN-authored prose from an admin adjustment
  admin_category  text check (admin_category in (
    'bug_reimbursement', 'support_goodwill', 'promotion',
    'correction', 'other'
  )),
  -- MACHINE-authored structured detail for a row (per-reason itemization,
  -- migration provenance, refund pointers, …). Deliberately separate from
  -- admin_note so the Coin History UI can render admin_note as prose and
  -- render this bag as a details expander — keeps automated grants from
  -- flashing raw JSON at players. Nullable; jsonb so shape can vary per
  -- reason without a schema change.
  metadata        jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_coin_ledger_profile
  on coin_ledger (profile_id, created_at desc);
create index if not exists idx_coin_ledger_reason
  on coin_ledger (reason, created_at desc);

-- One-shot per-profile grants (launch_grant_v1 and the welcome bonus) are
-- enforced at the DB so a re-run of the backfill or a double-fire welcome
-- path can't double-credit.
create unique index if not exists uq_coin_ledger_one_shot_grant
  on coin_ledger (profile_id, reason)
  where reason in ('launch_grant_v1', 'welcome_v1');

-- guest_migration is one-shot PER DEVICE rather than per profile: a player
-- who earned as a guest on Device A, signed up on A, then later signed in
-- on Device B needs Device B's pending grants credited too. A per-profile
-- unique here would swallow that second migration silently — the reason
-- this constraint is scoped to (profile_id, ref_id). Total coins the
-- profile can pull in from any number of guest migrations is capped at
-- 500 inside migrate_guest_grants(), so the anti-abuse posture is still
-- what the plan §"Anti-abuse" specifies.
create unique index if not exists uq_coin_ledger_guest_migration_device
  on coin_ledger (profile_id, ref_id)
  where reason = 'guest_migration';

alter table coin_ledger enable row level security;
-- Players read their own history; nothing else. Writes are service-role only
-- (award_coins / spend_coins run as SECURITY DEFINER).
drop policy if exists "coin_ledger_self_select" on coin_ledger;
create policy "coin_ledger_self_select" on coin_ledger
  for select to authenticated
  using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- guest_pending_grants — held earnings for un-signed-up players, keyed on
-- the device id we already stamp on guest players. Materialized into
-- coin_ledger by migrate_guest_grants() at signup.
-- ---------------------------------------------------------------------------
-- No FK to games or profiles here on purpose: guests don't have a profile
-- yet, and the game row can be pruned before signup happens. The row is a
-- promise, not a link.
create table if not exists guest_pending_grants (
  id         uuid primary key default gen_random_uuid(),
  device_id  text not null,
  session_id text,
  game_id    text,
  delta      bigint not null check (delta > 0),
  reason     text not null check (reason in (
    'win', 'daily_challenge', 'streak_multiplier',
    'host_bounty', 'first_mode_bonus'
  )),
  created_at timestamptz not null default now()
);

create index if not exists idx_guest_pending_grants_device
  on guest_pending_grants (device_id, created_at desc);

alter table guest_pending_grants enable row level security;
-- Deliberately NO policy — service-role only. Guests can't read their own
-- pending balance (the plan's rule: no running total shown to guests).

-- ---------------------------------------------------------------------------
-- profile_owned_* — permanent ownership of each shop category.
-- ---------------------------------------------------------------------------
-- One table per category rather than one polymorphic table. Cheaper joins
-- from the equip/render path, and a mistake in one category can't corrupt
-- the others. Slug is text so the shop catalog can live half in code, half
-- in the game_editions / game_themes tables without a lookup.
--
-- Every table has (profile_id, <slug>) as PK, so a repeat purchase is a
-- guaranteed no-op at the DB layer.

create table if not exists profile_owned_editions (
  profile_id    uuid not null references profiles(id) on delete cascade,
  edition_slug  text not null,
  acquired_at   timestamptz not null default now(),
  primary key (profile_id, edition_slug)
);
alter table profile_owned_editions enable row level security;
drop policy if exists "owned_editions_self_select" on profile_owned_editions;
create policy "owned_editions_self_select" on profile_owned_editions
  for select to authenticated using (profile_id = auth.uid());

create table if not exists profile_owned_themes (
  profile_id  uuid not null references profiles(id) on delete cascade,
  theme_slug  text not null,
  acquired_at timestamptz not null default now(),
  primary key (profile_id, theme_slug)
);
alter table profile_owned_themes enable row level security;
drop policy if exists "owned_themes_self_select" on profile_owned_themes;
create policy "owned_themes_self_select" on profile_owned_themes
  for select to authenticated using (profile_id = auth.uid());

create table if not exists profile_owned_frames (
  profile_id  uuid not null references profiles(id) on delete cascade,
  frame_slug  text not null,
  acquired_at timestamptz not null default now(),
  primary key (profile_id, frame_slug)
);
alter table profile_owned_frames enable row level security;
drop policy if exists "owned_frames_self_select" on profile_owned_frames;
create policy "owned_frames_self_select" on profile_owned_frames
  for select to authenticated using (profile_id = auth.uid());

create table if not exists profile_owned_name_colors (
  profile_id  uuid not null references profiles(id) on delete cascade,
  color_slug  text not null,
  acquired_at timestamptz not null default now(),
  primary key (profile_id, color_slug)
);
alter table profile_owned_name_colors enable row level security;
drop policy if exists "owned_name_colors_self_select" on profile_owned_name_colors;
create policy "owned_name_colors_self_select" on profile_owned_name_colors
  for select to authenticated using (profile_id = auth.uid());

create table if not exists profile_owned_animations (
  profile_id     uuid not null references profiles(id) on delete cascade,
  animation_slug text not null,
  acquired_at    timestamptz not null default now(),
  primary key (profile_id, animation_slug)
);
alter table profile_owned_animations enable row level security;
drop policy if exists "owned_animations_self_select" on profile_owned_animations;
create policy "owned_animations_self_select" on profile_owned_animations
  for select to authenticated using (profile_id = auth.uid());

create table if not exists profile_owned_card_templates (
  profile_id    uuid not null references profiles(id) on delete cascade,
  template_slug text not null,
  acquired_at   timestamptz not null default now(),
  primary key (profile_id, template_slug)
);
alter table profile_owned_card_templates enable row level security;
drop policy if exists "owned_card_templates_self_select" on profile_owned_card_templates;
create policy "owned_card_templates_self_select" on profile_owned_card_templates
  for select to authenticated using (profile_id = auth.uid());

-- Packs use uuid, not slug — question_packs.id is the natural key.
-- FK with ON DELETE CASCADE mirrors question_pack_collections: a pack
-- deleted by an admin is gone from ownership too. This differs from the
-- editions/themes tables above (which use text slugs and no FK — a
-- retired cosmetic falls back to the default render), because a pack
-- has no "default": if the row is gone the questions are gone, and
-- keeping the ownership row would strand shop/inventory queries at an
-- unresolvable id. Same cascade pattern the existing content-collections
-- join table uses.
create table if not exists profile_owned_packs (
  profile_id  uuid not null references profiles(id) on delete cascade,
  pack_id     uuid not null references question_packs(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  primary key (profile_id, pack_id)
);
alter table profile_owned_packs enable row level security;
drop policy if exists "owned_packs_self_select" on profile_owned_packs;
create policy "owned_packs_self_select" on profile_owned_packs
  for select to authenticated using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- game_editions — content-varied variants of a game (Estate Kings: USA,
-- Christmas, Naija, …). See docs/estate-kings-america-edition.md and the
-- Christmas doc for the JSON shape the engine consumes.
-- ---------------------------------------------------------------------------
-- `content` JSONB carries per-edition data (properties[], stations[],
-- utilities[], corner_labels, card_flavor, currency_symbol, art_slug).
-- Deliberately schemaless: each game_type decides its own shape and the
-- engine merges it over its default at room-create time.
create table if not exists game_editions (
  id            uuid primary key default gen_random_uuid(),
  game_type     text not null,
  slug          text not null,
  name          text not null,
  content       jsonb not null default '{}'::jsonb,
  price_coins   bigint not null default 0 check (price_coins >= 0),
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (game_type, slug)
);

create index if not exists idx_game_editions_active
  on game_editions (game_type, is_active, sort_order);

alter table game_editions enable row level security;
-- Public read of active editions (the shop and host-pick UIs need this).
-- The `content` JSONB carries no secrets: property names and card flavor
-- are what the game shows to every player at the table anyway.
drop policy if exists "game_editions_public_select" on game_editions;
create policy "game_editions_public_select" on game_editions
  for select to anon, authenticated using (is_active = true);

-- ---------------------------------------------------------------------------
-- game_themes — per-game visual reskin (Neon Whot, Wooden Ludo, etc.).
-- See docs/game-themes-catalog.md.
-- ---------------------------------------------------------------------------
-- `art` JSONB carries asset refs (card_back_slug, felt_slug, piece_set_slug,
-- palette overrides). Same schemaless rationale as game_editions.content.
create table if not exists game_themes (
  id            uuid primary key default gen_random_uuid(),
  game_type     text not null,
  slug          text not null,
  name          text not null,
  art           jsonb not null default '{}'::jsonb,
  price_coins   bigint not null default 0 check (price_coins >= 0),
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (game_type, slug)
);

create index if not exists idx_game_themes_active
  on game_themes (game_type, is_active, sort_order);

alter table game_themes enable row level security;
drop policy if exists "game_themes_public_select" on game_themes;
create policy "game_themes_public_select" on game_themes
  for select to anon, authenticated using (is_active = true);

-- ---------------------------------------------------------------------------
-- Grandfathering existing content — everything already shipped is free.
-- ---------------------------------------------------------------------------
-- Rule from the plan: "Never take away what was free." Every existing
-- content surface that will grow a shop price gets price_coins = 0 today.
--
-- game_editions and game_themes are brand new (empty), so grandfathering
-- them is a no-op at this point: they get seeded later with their own
-- prices, and only new rows will ship priced.
--
-- question_packs is the existing library. Add price_coins with a default
-- of 0 so every existing pack (and every new one that doesn't set a
-- price explicitly) stays free.
alter table question_packs
  add column if not exists price_coins bigint not null default 0
    check (price_coins >= 0);

-- puzzle_themes is the existing crossword/word-search/word-scramble theme
-- pool. Same grandfathering rule; free forever unless an admin explicitly
-- sets a price.
alter table puzzle_themes
  add column if not exists price_coins bigint not null default 0
    check (price_coins >= 0);

-- ----------------------------------------------------------------------------
-- ROLLBACK (drafted). Apply as a NEW forward migration; do NOT edit this file.
--   alter table puzzle_themes drop column if exists price_coins;
--   alter table question_packs drop column if exists price_coins;
--   drop table if exists game_themes;
--   drop table if exists game_editions;
--   drop table if exists profile_owned_packs;
--   drop table if exists profile_owned_card_templates;
--   drop table if exists profile_owned_animations;
--   drop table if exists profile_owned_name_colors;
--   drop table if exists profile_owned_frames;
--   drop table if exists profile_owned_themes;
--   drop table if exists profile_owned_editions;
--   drop table if exists guest_pending_grants;
--   drop table if exists coin_ledger;
--   alter table profiles drop column if exists equipped_card_template;
--   alter table profiles drop column if exists equipped_animation;
--   alter table profiles drop column if exists equipped_name_color;
--   alter table profiles drop column if exists equipped_frame;
--   alter table profiles drop column if exists coins;
-- ----------------------------------------------------------------------------
