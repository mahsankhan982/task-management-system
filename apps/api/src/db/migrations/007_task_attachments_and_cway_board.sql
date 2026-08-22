CREATE TABLE IF NOT EXISTS task_attachments (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  attachment_type VARCHAR(20) NOT NULL CHECK (attachment_type IN ('file', 'link')),
  file_name VARCHAR(255),
  mime_type VARCHAR(150),
  file_size BIGINT,
  file_data BYTEA,
  url TEXT,
  label VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT task_attachments_payload_check CHECK (
    (attachment_type = 'file' AND file_data IS NOT NULL AND file_name IS NOT NULL)
    OR
    (attachment_type = 'link' AND url IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id
  ON task_attachments(task_id, created_at DESC);

DO $$
DECLARE
  creator_id BIGINT;
  cway_id BIGINT;
  cway_team_id BIGINT;
BEGIN
  SELECT id
  INTO creator_id
  FROM users
  ORDER BY CASE WHEN role = 'Manager' THEN 0 ELSE 1 END, id
  LIMIT 1;

  SELECT id
  INTO cway_team_id
  FROM teams
  WHERE LOWER(name) LIKE '%cway%'
     OR LOWER(name) LIKE '%ceway%'
     OR LOWER(name) LIKE '%c-way%'
  ORDER BY id
  LIMIT 1;

  SELECT id
  INTO cway_id
  FROM boards
  WHERE LOWER(name) LIKE '%cway%'
     OR LOWER(name) LIKE '%ceway%'
     OR LOWER(name) LIKE '%c-way%'
     OR LOWER(COALESCE(description, '')) LIKE '%cway%'
     OR LOWER(COALESCE(description, '')) LIKE '%ceway%'
  ORDER BY id
  LIMIT 1;

  IF cway_id IS NULL THEN
    INSERT INTO boards (name, description, team_id, created_by)
    VALUES ('CWAY Board', 'CWAY workspace board', cway_team_id, creator_id)
    RETURNING id INTO cway_id;
  ELSE
    UPDATE boards
    SET name = 'CWAY Board',
        description = COALESCE(description, 'CWAY workspace board'),
        team_id = COALESCE(team_id, cway_team_id),
        updated_at = NOW()
    WHERE id = cway_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM workflow_stages WHERE board_id = cway_id) THEN
    INSERT INTO workflow_stages (board_id, name, position) VALUES
      (cway_id, 'To Do', 1),
      (cway_id, 'In Progress', 2),
      (cway_id, 'Waiting for Lead', 3),
      (cway_id, 'Review', 4),
      (cway_id, 'Completed', 5);
  END IF;
END $$;