BEGIN;

UPDATE tasks t
SET stage_id = waiting.id, updated_at = NOW()
FROM workflow_stages review
JOIN workflow_stages waiting
  ON waiting.board_id = review.board_id
 AND waiting.name = 'Waiting for Review'
WHERE t.stage_id = review.id
  AND review.name = 'Review';

DELETE FROM workflow_stages
WHERE name = 'Review';

UPDATE workflow_stages
SET position = position + 100
WHERE position > 4;

UPDATE workflow_stages
SET position = position - 101
WHERE position > 104;

COMMIT;
