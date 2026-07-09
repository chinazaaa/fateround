-- Register Quiplash on the community leaderboard so winners auto-post from the end screen.

insert into community_games (name, slug, accent, sort_order, game_type, is_active)
values ('Quiplash', 'quiplash', '#ec4899', 45, 'quiplash', true)
on conflict (slug) do update
set
  game_type = excluded.game_type,
  accent = excluded.accent,
  is_active = excluded.is_active;
