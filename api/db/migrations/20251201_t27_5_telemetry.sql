-- T27-5: Telemetry & Future Monetization Hooks
-- Migration: 20251201_t27_5_telemetry.sql

-- 1. Add plan field to users table
-- Currently only 'free' is used
-- Future plans: 'supporter', 'pro' (documented for reference, not implemented)
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

-- Add check constraint for valid plans
-- Only 'free' is active now, but we define the schema for future use
ALTER TABLE users ADD CONSTRAINT users_plan_check 
  CHECK (plan IN ('free', 'supporter', 'pro'));

COMMENT ON COLUMN users.plan IS 'User subscription plan. Currently only "free" is used. Future: "supporter", "pro"';

-- 2. Create telemetry_events table for business metrics
CREATE TABLE IF NOT EXISTS telemetry_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  tree_id     UUID REFERENCES trees(id) ON DELETE SET NULL,
  count       INTEGER,                    -- For milestone events (node count, etc.)
  metadata    JSONB DEFAULT '{}',         -- Additional context
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_telemetry_user_id ON telemetry_events(user_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_event_type ON telemetry_events(event_type);
CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON telemetry_events(created_at);

-- Comments for documentation
COMMENT ON TABLE telemetry_events IS 'Business telemetry events for analytics and future monetization';
COMMENT ON COLUMN telemetry_events.event_type IS 'Event types: tree_created, milestone_50, milestone_100, milestone_300, byok_bound';
COMMENT ON COLUMN telemetry_events.count IS 'Numeric value associated with event (e.g., node count for milestones)';
COMMENT ON COLUMN telemetry_events.metadata IS 'Additional context (provider type for BYOK, etc.)';
