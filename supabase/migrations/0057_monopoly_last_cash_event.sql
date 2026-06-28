-- Per-player cash change events so players see why their balance changed.
alter table public.monopoly_boards
  add column if not exists last_cash_event jsonb;
