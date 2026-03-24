-- T54-1: Trail hooks for resume_snapshots -> tree_trail_events

BEGIN;

CREATE OR REPLACE FUNCTION log_resume_snapshot_trail() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO tree_trail_events (id, tree_id, ts, actor, type, node_id, turn_id, payload)
  VALUES (
    gen_random_uuid(),
    NEW.tree_id,
    COALESCE(NEW.ts, now()),
    'system',
    'SNAPSHOT_CREATED',
    NEW.scope_node_id,
    NULL,
    jsonb_build_object(
      'snapshot_id', NEW.id,
      'scope_node_id', NEW.scope_node_id,
      'mode', NEW.mode,
      'based_on_snapshot_id', NEW.based_on_snapshot_id,
      'pinned', COALESCE(NEW.pinned, false)
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_resume_snapshots_trail') THEN
    CREATE TRIGGER trg_resume_snapshots_trail
    AFTER INSERT ON resume_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION log_resume_snapshot_trail();
  END IF;
END;
$$;

COMMIT;
