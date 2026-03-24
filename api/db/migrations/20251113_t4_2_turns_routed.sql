-- T4-2 Irrelevance Gate: track routing decisions on turns
ALTER TABLE turns
ADD COLUMN IF NOT EXISTS routed TEXT NOT NULL DEFAULT 'in';

CREATE INDEX IF NOT EXISTS idx_turns_routed ON turns (routed);
