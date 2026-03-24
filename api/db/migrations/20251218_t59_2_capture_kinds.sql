-- T59-2: Extend semantic_ledger_atoms kind constraint for manual capture
-- Adds: finding, open_question, next_action (human-annotated ledger atoms)

BEGIN;

DO $$
BEGIN
  -- Fresh installs (and schema-isolated installs) may not have this table yet.
  IF to_regclass('semantic_ledger_atoms') IS NOT NULL THEN
    -- Drop the old constraint and add new one with extended kinds
    -- Note: PostgreSQL doesn't allow direct ALTER on CHECK constraints, so we drop & re-add
    EXECUTE 'ALTER TABLE semantic_ledger_atoms DROP CONSTRAINT IF EXISTS semantic_ledger_atoms_kind_check';

    EXECUTE $ddl$
      ALTER TABLE semantic_ledger_atoms
        ADD CONSTRAINT semantic_ledger_atoms_kind_check
        CHECK (kind IN (
          'claim',
          'open_loop',
          'decision',
          'rejection',
          'evidence_mention',
          'note',
          'finding',
          'open_question',
          'next_action'
        ))
    $ddl$;

    -- Add index for manual captures (source=manual_capture in payload)
    EXECUTE $ddl$
      CREATE INDEX IF NOT EXISTS idx_semantic_ledger_atoms_manual_capture
        ON semantic_ledger_atoms USING GIN (payload)
        WHERE (payload->>'source') = 'manual_capture'
    $ddl$;
  ELSE
    RAISE NOTICE 'Skipping T59-2: semantic_ledger_atoms table not present';
  END IF;
END
$$;

COMMIT;
