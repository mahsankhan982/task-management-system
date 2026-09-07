ALTER TABLE boards
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE workflow_stages
  ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE boards
SET is_system = TRUE
WHERE LOWER(TRIM(name)) IN ('creative', 'creative board', 'website', 'website board', 'digital', 'digital board', 'qa', 'qa board');

UPDATE workflow_stages
SET is_system = TRUE
WHERE LOWER(TRIM(name)) IN ('to do', 'in progress', 'waiting for review', 'review', 'waiting for lead', 'completed');

UPDATE workflow_stages ws
SET created_by = b.created_by
FROM boards b
WHERE ws.board_id = b.id
  AND ws.created_by IS NULL;
