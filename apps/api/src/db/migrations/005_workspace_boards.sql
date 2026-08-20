DO $$
DECLARE
  creator_id BIGINT;
  creative_id BIGINT;
  website_id BIGINT;
  digital_id BIGINT;
  website_team_id BIGINT;
  digital_team_id BIGINT;
BEGIN
  SELECT id
  INTO creator_id
  FROM users
  ORDER BY CASE WHEN role = 'Manager' THEN 0 ELSE 1 END, id
  LIMIT 1;

  SELECT id
  INTO creative_id
  FROM boards
  WHERE LOWER(name) LIKE '%creative%'
     OR LOWER(name) LIKE '%crative%'
     OR LOWER(COALESCE(description, '')) LIKE '%creative%'
  ORDER BY id
  LIMIT 1;

  IF creative_id IS NULL THEN
    INSERT INTO boards (name, description, team_id, created_by)
    VALUES ('Creative Board', 'Creative workspace board', NULL, creator_id)
    RETURNING id INTO creative_id;
  END IF;

  SELECT id
  INTO website_team_id
  FROM teams
  WHERE LOWER(name) LIKE '%website%' OR LOWER(name) LIKE '%web%'
  ORDER BY id
  LIMIT 1;

  SELECT id
  INTO website_id
  FROM boards
  WHERE LOWER(name) LIKE '%website%'
     OR LOWER(name) LIKE '%web site%'
     OR LOWER(COALESCE(description, '')) LIKE '%website%'
  ORDER BY id
  LIMIT 1;

  IF website_id IS NULL THEN
    INSERT INTO boards (name, description, team_id, created_by)
    VALUES ('Website Board', 'Website workspace board', website_team_id, creator_id)
    RETURNING id INTO website_id;
  END IF;

  SELECT id
  INTO digital_team_id
  FROM teams
  WHERE LOWER(name) LIKE '%digital%'
  ORDER BY id
  LIMIT 1;

  SELECT id
  INTO digital_id
  FROM boards
  WHERE LOWER(name) LIKE '%digital%'
     OR LOWER(COALESCE(description, '')) LIKE '%digital%'
  ORDER BY id
  LIMIT 1;

  IF digital_id IS NULL THEN
    INSERT INTO boards (name, description, team_id, created_by)
    VALUES ('Digital Board', 'Digital workspace board', digital_team_id, creator_id)
    RETURNING id INTO digital_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM workflow_stages WHERE board_id = creative_id) THEN
    INSERT INTO workflow_stages (board_id, name, position) VALUES
      (creative_id, 'To Do', 1),
      (creative_id, 'In Progress', 2),
      (creative_id, 'Waiting for Lead', 3),
      (creative_id, 'Review', 4),
      (creative_id, 'Completed', 5);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM workflow_stages WHERE board_id = website_id) THEN
    INSERT INTO workflow_stages (board_id, name, position) VALUES
      (website_id, 'To Do', 1),
      (website_id, 'In Progress', 2),
      (website_id, 'Waiting for Lead', 3),
      (website_id, 'Review', 4),
      (website_id, 'Completed', 5);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM workflow_stages WHERE board_id = digital_id) THEN
    INSERT INTO workflow_stages (board_id, name, position) VALUES
      (digital_id, 'To Do', 1),
      (digital_id, 'In Progress', 2),
      (digital_id, 'Waiting for Lead', 3),
      (digital_id, 'Review', 4),
      (digital_id, 'Completed', 5);
  END IF;
END $$;