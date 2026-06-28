-- Trade accept/decline events for per-player feedback.
alter table public.monopoly_boards
  add column if not exists last_trade_event jsonb;
