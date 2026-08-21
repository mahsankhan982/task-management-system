DO $$
DECLARE
  creative_id BIGINT;
  website_id BIGINT;
  digital_id BIGINT;
BEGIN
  SELECT id INTO creative_id
  FROM boards
  WHERE LOWER(name) LIKE '%creative%'
     OR LOWER(name) LIKE '%crative%'
     OR LOWER(COALESCE(description, '')) LIKE '%creative%'
  ORDER BY id
  LIMIT 1;

  IF creative_id IS NOT NULL THEN
    UPDATE boards
    SET name = 'Creative Board', updated_at = NOW()
    WHERE id = creative_id;
  END IF;

  SELECT id INTO website_id
  FROM boards
  WHERE LOWER(name) LIKE '%website%'
     OR LOWER(name) LIKE '%web site%'
     OR LOWER(COALESCE(description, '')) LIKE '%website%'
  ORDER BY id
  LIMIT 1;

  IF website_id IS NOT NULL THEN
    UPDATE boards
    SET name = 'Website Board', updated_at = NOW()
    WHERE id = website_id;
  END IF;

  SELECT id INTO digital_id
  FROM boards
  WHERE LOWER(name) LIKE '%digital%'
     OR LOWER(COALESCE(description, '')) LIKE '%digital%'
  ORDER BY id
  LIMIT 1;

  IF digital_id IS NOT NULL THEN
    UPDATE boards
    SET name = 'Digital Board', updated_at = NOW()
    WHERE id = digital_id;
  END IF;
END $$;