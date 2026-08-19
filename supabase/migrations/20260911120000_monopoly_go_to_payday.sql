-- Backfill the Monopoly (Estate Kings) trophy language from "GO" to "PAYDAY". The board space
-- was renamed to PAYDAY, but the trophies table is insert-only (see /api/admin/trophies PUT), so
-- the code catalog update doesn't reach rows already seeded. Rewrite the affected title and
-- descriptions in place; ids and criteria are untouched so earned player_trophies rows keep
-- working.
UPDATE public.trophies
   SET title = 'Passing PAYDAY'
 WHERE id = 'monopoly.sys.passed_go' AND title = 'Passing GO';

UPDATE public.trophies
   SET description = replace(description, 'Pass GO', 'Pass PAYDAY')
 WHERE game_type = 'monopoly' AND description LIKE '%Pass GO%';
