-- T40-0 Intent tracking: add intent column to turns
ALTER TABLE turns
  ADD COLUMN IF NOT EXISTS intent TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_turns_intent ON turns(intent);
