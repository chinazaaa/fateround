insert into public.game_player_limits (game_type, max_players)
values ('monopoly', 8)
on conflict (game_type) do update
set max_players = excluded.max_players,
    updated_at = now();
