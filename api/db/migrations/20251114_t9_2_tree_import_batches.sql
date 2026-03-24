-- T9-2 Tree import batches for idempotent restore
CREATE TABLE IF NOT EXISTS tree_import_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_tree_id UUID NULL,
  import_hash TEXT NOT NULL,
  import_batch_id TEXT NULL,
  new_tree_id UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tree_import_batches_hash
  ON tree_import_batches (import_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tree_import_batches_batch_id
  ON tree_import_batches (import_batch_id)
  WHERE import_batch_id IS NOT NULL;
