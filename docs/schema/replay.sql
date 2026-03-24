CREATE TABLE IF NOT EXISTS kt_session (
  id BIGSERIAL PRIMARY KEY,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kt_event (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES kt_session(id) ON DELETE CASCADE,
  node_id BIGINT NULL REFERENCES knowledge_tree(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  payload JSONB,
  ts TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kt_event_session_ts ON kt_event(session_id, ts);
