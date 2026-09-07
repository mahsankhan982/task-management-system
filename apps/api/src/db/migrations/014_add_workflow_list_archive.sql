ALTER TABLE workflow_stages
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_workflow_stages_active_board
  ON workflow_stages (board_id, position)
  WHERE is_archived = FALSE;
