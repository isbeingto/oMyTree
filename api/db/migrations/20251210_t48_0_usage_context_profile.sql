-- T48-0: Add context_profile to usage tracking for cost monitoring
-- This enables per-profile cost analysis (Lite/Standard/Max)

BEGIN;

-- 1) Add context_profile to llm_usage_events (historical log)
ALTER TABLE llm_usage_events
  ADD COLUMN IF NOT EXISTS context_profile TEXT CHECK (context_profile IN ('lite', 'standard', 'max'));

-- Add index for profile-based queries
CREATE INDEX IF NOT EXISTS idx_llm_usage_events_profile 
  ON llm_usage_events(context_profile, created_at DESC);

-- 2) Add context_profile to llm_usage_daily (aggregation table)
-- Need to recreate primary key to include profile
-- First, check if column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'llm_usage_daily' AND column_name = 'context_profile'
  ) THEN
    -- Drop existing primary key
    ALTER TABLE llm_usage_daily DROP CONSTRAINT IF EXISTS llm_usage_daily_pkey;
    
    -- Add column with default
    ALTER TABLE llm_usage_daily 
      ADD COLUMN context_profile TEXT NOT NULL DEFAULT 'lite'
      CHECK (context_profile IN ('lite', 'standard', 'max'));
    
    -- Recreate primary key including profile
    ALTER TABLE llm_usage_daily 
      ADD PRIMARY KEY (usage_date, user_id, provider, is_byok, model, context_profile);
    
    -- Add index for profile-based aggregation
    CREATE INDEX IF NOT EXISTS idx_llm_usage_daily_profile 
      ON llm_usage_daily(context_profile, usage_date DESC);
  END IF;
END $$;

COMMIT;
