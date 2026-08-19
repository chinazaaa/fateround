-- Attach the caller's Supabase Auth user id to the three rows that need it so
-- we can enforce two cross-device rules:
--
-- 1. Skip a fanout push to any subscriber device that belongs to the same
--    profile that opened the game. Playing your own public game against
--    yourself should not be triggered by the app pinging you.
--
-- 2. On join, detect when the same profile is already hosting or already a
--    player in the game from another device, so the client can prompt
--    "continue here or keep the other device" instead of silently seating a
--    second copy of the same account.
--
-- None of these columns are required — the app still supports fully-anonymous
-- guests, and existing rows keep NULL until the next mutation from a
-- signed-in caller. That preserves the two-worlds rule: gameplay stays
-- possible without an account, identity just enables the new cross-device
-- behaviour when it's there.

alter table public.games
  add column if not exists host_user_id uuid references auth.users(id) on delete set null;

alter table public.players
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.notification_subscriber_devices
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Indexes to keep the two hot lookups fast:
--   fanout: "which devices belong to the host?"  → devices.user_id
--   join:   "is this profile already a player here?" → players(user_id, game_id)
create index if not exists notification_subscriber_devices_user_id_idx
  on public.notification_subscriber_devices (user_id) where user_id is not null;

create index if not exists players_user_id_game_id_idx
  on public.players (user_id, game_id) where user_id is not null;

create index if not exists games_host_user_id_idx
  on public.games (host_user_id) where host_user_id is not null;
