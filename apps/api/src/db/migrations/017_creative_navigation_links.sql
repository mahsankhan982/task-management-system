-- Add nullable Creative navigation links without changing existing records.
ALTER TABLE boards
  ADD COLUMN IF NOT EXISTS parent_board_id BIGINT REFERENCES boards(id) ON DELETE SET NULL;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS creative_list_id BIGINT REFERENCES workflow_stages(id) ON DELETE SET NULL;
