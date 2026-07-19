-- Admin-managed "platform" content banks. Each game whose `platform` question source is currently
-- a hardcoded array in code (Most Likely To, Would You Rather, Codewords, …) can instead draw from
-- editable rows here, so content can be added/edited/removed without a deploy — the same way
-- landmine_categories and puzzle_themes already work.
--
-- One generic table keyed by `game_type` (+ `variant` for games with more than one pool, e.g.
-- quick_draw draw-prompts vs guess-words). Each row is one admin "batch": a `label` (admin-only,
-- never shown to the host) and an ordered `entries` jsonb array in that game's native shape. At draw
-- time the game unions the `entries` of every active row for its game_type. If there are no active
-- rows (or this table doesn't exist yet), the game falls back to its hardcoded array — so gameplay
-- never breaks and this is safe to ship before any content is seeded.
--
-- Content is answer-bearing for some games (trivia/who-said-this later), so keep it server-only:
-- RLS enabled with NO policy (PostgREST denies anon/authenticated). All reads go through
-- service-role API routes (admin CRUD) and the server-side start/create routes.

create table if not exists platform_content (
  id          uuid primary key default gen_random_uuid(),
  game_type   text not null,
  variant     text,
  label       text not null,
  entries     jsonb not null default '[]'::jsonb,
  entry_count integer not null default 0,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  builtin_key text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists platform_content_lookup
  on platform_content (game_type, variant, is_active, sort_order, created_at);

-- Idempotent seeding from code arrays (the "Import built-ins" admin action) keys on this.
create unique index if not exists platform_content_builtin_key_unique
  on platform_content (game_type, coalesce(variant, ''), builtin_key)
  where builtin_key is not null;

alter table platform_content enable row level security;
-- Deliberately no policy: service-role only (like landmine_categories).
