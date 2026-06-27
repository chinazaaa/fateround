-- Allow multiple quotes per player in Who Said This lobby pool
ALTER TABLE wst_quote_pool DROP CONSTRAINT IF EXISTS wst_quote_pool_game_id_player_id_key;
