-- T40-1 Active Topic tagging: add topic_tag to nodes
ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS topic_tag TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_nodes_topic_tag ON nodes(topic_tag);
