-- T31-3: Plan limits for trees/nodes + extend plan enum
-- - Adds configurable plan limits in system_config
-- - Extends users.plan allowed values for future paid tiers

BEGIN;

-- Expand allowed plans (future-facing)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;
ALTER TABLE users
  ADD CONSTRAINT users_plan_check
  CHECK (plan IN ('free', 'supporter', 'pro', 'team'));

-- Backfill null/empty plan values to free
UPDATE users
   SET plan = 'free'
 WHERE plan IS NULL
    OR plan = '';

-- Seed default plan limits (editable via system_config)
INSERT INTO system_config (key, value, updated_at)
VALUES (
  'plan_limits',
  '{
    "free":      { "max_trees": 10,  "max_nodes_per_tree": 200  },
    "supporter": { "max_trees": 20,  "max_nodes_per_tree": 400  },
    "pro":       { "max_trees": 100, "max_nodes_per_tree": 2000 },
    "team":      { "max_trees": 200, "max_nodes_per_tree": 5000 }
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
