-- Older assignments may not have recorded who assigned the employee.
-- Use the first matching assignee activity as the owner; for legacy tasks
-- without such an activity, the task creator is the safest fallback.
UPDATE task_assignees AS ta
SET assigned_by = COALESCE(
  (
    SELECT al.user_id
    FROM activity_logs AS al
    WHERE al.task_id = ta.task_id
      AND al.action = 'task_assignees_updated'
      AND al.user_id IS NOT NULL
      AND COALESCE(al.details->'assignee_ids', '[]'::jsonb)
          @> jsonb_build_array(ta.user_id)
    ORDER BY al.created_at ASC, al.id ASC
    LIMIT 1
  ),
  (
    SELECT t.created_by
    FROM tasks AS t
    WHERE t.id = ta.task_id
  )
)
WHERE ta.assigned_by IS NULL;
