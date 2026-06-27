-- Allow host-added quotes without a linked player row
ALTER TABLE wst_quote_pool ALTER COLUMN player_id DROP NOT NULL;
