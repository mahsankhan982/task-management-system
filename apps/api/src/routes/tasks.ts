router.get("/:id", async (req, res) => {
  try {
    const taskResult = await db.query(
      "SELECT t.*, b.name AS board_name, w.name AS stage_name FROM tasks t JOIN boards b ON b.id = t.board_id JOIN workflow_stages w ON w.id = t.stage_id WHERE t.id = $1",
      [req.params.id]
    );

    if (!taskResult.rows[0]) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    const [assignees, checklist, comments, labels, activity] = await Promise.all([
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

      db.query(
        "SELECT * FROM task_checklists WHERE task_id = $1 ORDER BY id",
        [req.params.id]
      ),

      db.query(
        `
        SELECT 
          c.*,
          u.full_name AS user_name
        FROM task_comments c
        LEFT JOIN users u ON u.id = c.user_id
        WHERE c.task_id = $1
        ORDER BY c.created_at DESC
        `,
        [req.params.id]
      ),

      db.query(
        `
        SELECT l.*
        FROM task_labels l
        WHERE l.task_id = $1
        `,
        [req.params.id]
      ),

      db.query(
        `
        SELECT
          a.*,
          u.full_name AS user_name
        FROM activity_logs a
        LEFT JOIN users u ON u.id = a.user_id
        WHERE a.task_id = $1
        ORDER BY a.created_at DESC
        `,
        [req.params.id]
      ),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        ...taskResult.rows[0],
        assignees: assignees.rows,
        checklist: checklist.rows,
        comments: comments.rows,
        labels: labels.rows,
        activity: activity.rows,
      },
    });

  } catch (error) {
    console.error("Get task failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch task",
    });
  }
});