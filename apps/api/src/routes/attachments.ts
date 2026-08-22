async function canAddAttachment(taskId: number, userId: number, role: string) {
  const task = await db.query(
    "SELECT id FROM tasks WHERE id = $1 LIMIT 1",
    [taskId],
  );

  return Boolean(task.rows[0]);
}
