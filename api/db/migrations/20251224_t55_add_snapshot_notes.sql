-- T55-2: Add user_notes to resume_snapshots
ALTER TABLE resume_snapshots
  ADD COLUMN IF NOT EXISTS user_notes TEXT NULL;
