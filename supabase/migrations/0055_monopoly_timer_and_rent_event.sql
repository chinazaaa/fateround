-- Monopoly turn timer + structured rent events for per-player UI.
alter table public.monopoly_boards
  add column if not exists turn_deadline_at timestamptz;

alter table public.monopoly_boards
  add column if not exists last_rent_event jsonb;
