-- T95: Paddle billing foundation (checkout links, subscriptions, webhook events)

BEGIN;

CREATE TABLE IF NOT EXISTS billing_checkout_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'paddle',
  plan_code TEXT NOT NULL CHECK (plan_code IN ('pro')),
  price_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_billing_checkout_links_user_id
  ON billing_checkout_links(user_id);

CREATE INDEX IF NOT EXISTS idx_billing_checkout_links_expires_at
  ON billing_checkout_links(expires_at);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'paddle',
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paddle_subscription_id TEXT NOT NULL UNIQUE,
  paddle_customer_id TEXT,
  plan_code TEXT NOT NULL DEFAULT 'free',
  is_target_plan BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL,
  paddle_price_id TEXT,
  currency_code TEXT,
  current_billing_period_starts_at TIMESTAMPTZ,
  current_billing_period_ends_at TIMESTAMPTZ,
  scheduled_change JSONB,
  management_urls JSONB,
  custom_data JSONB,
  last_event_id TEXT,
  last_event_type TEXT,
  last_event_occurred_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_user_id
  ON billing_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_status
  ON billing_subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_provider_user
  ON billing_subscriptions(provider, user_id);

CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  process_status TEXT NOT NULL DEFAULT 'received'
    CHECK (process_status IN ('received', 'processed', 'ignored', 'failed')),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  subscription_id TEXT,
  error_message TEXT,
  payload JSONB NOT NULL,
  UNIQUE(provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_status
  ON billing_webhook_events(process_status);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_received_at
  ON billing_webhook_events(received_at DESC);

COMMIT;
