-- Raise-funds phase before bankruptcy + structured debt context.
alter table public.monopoly_boards
  add column if not exists pending_debt jsonb;

alter table public.monopoly_boards drop constraint if exists monopoly_boards_phase_check;
alter table public.monopoly_boards add constraint monopoly_boards_phase_check check (
  phase in ('roll', 'buy', 'jail', 'pay_rent', 'auction', 'raise_funds', 'finished')
);
