-- Player-facing content label ("what's this pack about") for content games.
--
-- Games built from a CSV upload or a community/library pack carry no hint about
-- what the questions are ABOUT — a trivia room named "Friday Night" could be maths,
-- Bible, or football, and joiners only find out once play starts. games.content_label
-- is a short, host-set description of the pack's subject (e.g. "Maths", "Bible trivia")
-- shown next to the room name on the join, gameplay, and finished screens.
--
-- It is distinct from games.title (the room/session name) and from games.theme (the
-- cosmetic visual theme). For library packs the create flow auto-fills it with the pack
-- name; for CSV uploads the host types it. Editable later from the host lobby settings.
--
-- Display-only free text (like the *_theme name columns), so no check constraint.

alter table public.games
  add column if not exists content_label text;

-- Column-level SELECT grant: migration 0122 made games grants column-level, so every
-- new client-readable games column needs its own grant or reads fail with 42501.
grant select (content_label) on public.games to anon, authenticated;

-- ----------------------------------------------------------------------------
-- ROLLBACK (drafted):
--   revoke select (content_label) on public.games from anon, authenticated;
--   alter table public.games drop column if exists content_label;
-- ----------------------------------------------------------------------------
