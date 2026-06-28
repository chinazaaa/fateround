-- Whot: host chooses whether a Pick 2 (card number 2) may be stacked / defended.
--   true  (default) = current behaviour — the targeted player can play their own 2
--                     to pass an accumulating penalty along (next player draws 4, etc.).
--   false           = no defending — the targeted player cannot play a 2; they must
--                     draw the 2-card penalty.
ALTER TABLE games ADD COLUMN IF NOT EXISTS whot_pick2_stacking boolean NOT NULL DEFAULT true;
