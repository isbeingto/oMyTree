-- T69: Incremental Memo Update (Rolling Baton)
-- Add delta_nodes_count column to track the number of delta nodes used in incremental update

-- Add delta_nodes_count column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'memos' 
        AND column_name = 'delta_nodes_count'
    ) THEN
        ALTER TABLE memos ADD COLUMN delta_nodes_count INTEGER;
        COMMENT ON COLUMN memos.delta_nodes_count IS 'Number of delta nodes processed in incremental update (null for full generation)';
    END IF;
END
$$;
