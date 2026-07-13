ALTER TABLE games
  ADD COLUMN IF NOT EXISTS monopoly_double_go_salary boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS monopoly_forced_auctions boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS monopoly_no_rent_in_jail boolean DEFAULT false;
