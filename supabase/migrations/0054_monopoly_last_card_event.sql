-- Store the latest Chance / Community Chest draw for per-player UI alerts.
alter table public.monopoly_boards
  add column if not exists last_card_event jsonb;
