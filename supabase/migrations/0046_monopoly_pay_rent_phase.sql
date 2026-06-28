ALTER TABLE monopoly_boards DROP CONSTRAINT IF EXISTS monopoly_boards_phase_check;
ALTER TABLE monopoly_boards ADD CONSTRAINT monopoly_boards_phase_check CHECK (
  phase IN ('roll', 'buy', 'jail', 'pay_rent', 'finished')
);
