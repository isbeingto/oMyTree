-- 20260116_p02_remove_capture_kinds.sql
-- Remove manual capture kinds from semantic ledger

BEGIN;

DO $$
BEGIN
  IF to_regclass('semantic_ledger_atoms') IS NOT NULL THEN
    -- Remove manual capture atoms first to satisfy constraint changes
    EXECUTE $$
      DELETE FROM semantic_ledger_atoms
       WHERE payload->>'source' = 'manual_capture'
          OR kind IN ('finding', 'open_question', 'next_action')
    $$;

    -- Drop manual capture index if present
    EXECUTE 'DROP INDEX IF EXISTS idx_semantic_ledger_atoms_manual_capture';

    -- Reset kind constraint to core ledger kinds
    EXECUTE 'ALTER TABLE semantic_ledger_atoms DROP CONSTRAINT IF EXISTS semantic_ledger_atoms_kind_check';
    EXECUTE $$
      ALTER TABLE semantic_ledger_atoms
        ADD CONSTRAINT semantic_ledger_atoms_kind_check
        CHECK (kind IN (
          'claim',
          'open_loop',
          'decision',
          'rejection',
          'evidence_mention',
          'note'
        ))
    $$;
  ELSE
    RAISE NOTICE 'Skipping remove capture kinds: semantic_ledger_atoms table not present';
  END IF;
END
$$;

COMMIT;
