db.query(
`
SELECT 
  u.id,
  u.full_name,
  u.email,
  u.role,
  u.team_id,
  ab.id AS assigned_by_id,
  ab.full_name AS assigned_by_name
FROM task_assignees ta
JOIN users u ON u.id = ta.user_id
LEFT JOIN users ab ON ab.id = ta.assigned_by
WHERE ta.task_id = $1
ORDER BY u.full_name
`,
[req.params.id]
),