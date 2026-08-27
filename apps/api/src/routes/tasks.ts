import { Router } from "express";
import { db } from "../db/pool";
import { getBoardName, notifyMake } from '../lib/notifyMake';

const router = Router();
const allowedPriorities = ["Critical", "High", "Medium", "Low"];

router.get("/", async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT
         t.*,
         b.name AS board_name,
         w.name AS stage_name,
         COALESCE(
           (
             SELECT json_agg(
               json_build_object(
                 'id', u.id,
                 'full_name', u.full_name,
                 'email', u.email,
                 'role', u.role
               )
               ORDER BY u.full_name
             )
             FROM task_assignees ta
             JOIN users u ON u.id = ta.user_id
             WHERE ta.task_id = t.id
           ),
           '[]'::json
         ) AS assignees
       FROM tasks t
       JOIN boards b ON b.id = t.board_id
       JOIN workflow_stages w ON w.id = t.stage_id
       ORDER BY t.created_at DESC`
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get tasks failed:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch tasks" });
  }
});

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
      db.query("SELECT * FROM checklist_items WHERE task_id = $1 ORDER BY position, id", [req.params.id]),
      db.query("SELECT c.*, u.full_name AS user_name FROM comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.task_id = $1 ORDER BY c.created_at", [req.params.id]),
      db.query("SELECT l.* FROM task_labels tl JOIN labels l ON l.id = tl.label_id WHERE tl.task_id = $1 ORDER BY l.name", [req.params.id]),
      db.query("SELECT a.*, u.full_name AS user_name FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id WHERE a.task_id = $1 ORDER BY a.created_at DESC", [req.params.id])
    ]);

    return res.status(200).json({
      success: true,
      data: {
        ...taskResult.rows[0],
        assignees: assignees.rows,
        checklist: checklist.rows,
        comments: comments.rows,
        labels: labels.rows,
        activity: activity.rows
      }
    });
  } catch (error) {
    console.error("Get task failed:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch task" });
  }
});

router.post("/", async (req, res) => {
  const client = await db.connect();
  try {
    const { board_id, stage_id, title, description, priority, due_date, assignee_ids } = req.body;

    if (!board_id || !stage_id || !title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ success: false, message: "Board, stage and title are required" });
    }

    const taskPriority = priority ?? "Medium";
    if (!allowedPriorities.includes(taskPriority)) {
      return res.status(400).json({ success: false, message: "Invalid priority" });
    }

    await client.query("BEGIN");

    const result = await client.query(
      "INSERT INTO tasks (board_id, stage_id, title, description, priority, due_date, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [board_id, stage_id, title.trim(), description ?? null, taskPriority, due_date ?? null, req.user!.id]
    );

    const task = result.rows[0];

    if (Array.isArray(assignee_ids)) {
      const ids = [...new Set(assignee_ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0))];
      for (const userId of ids) {
        await client.query(
          "INSERT INTO task_assignees (task_id, user_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
          [task.id, userId, req.user!.id]
        );

        if (userId !== req.user!.id) {
          await client.query(
            `INSERT INTO notifications (user_id, task_id, type, title, message)
             VALUES ($1, $2, 'task_assigned', 'New task assigned', $3)`,
            [userId, task.id, `Task "${task.title}" was assigned to you.`]
          );
        }
      }
    }

    await client.query(
      "INSERT INTO activity_logs (task_id, user_id, action, details) VALUES ($1,$2,$3,$4::jsonb)",
      [task.id, req.user!.id, "task_created", JSON.stringify({ title: task.title, description: task.description, priority: task.priority, due_date: task.due_date })]
    );

    await client.query("COMMIT");


    void getBoardName(task.board_id).then((boardName) =>
      notifyMake(
        'task_created',
        { id: task.id, title: task.title, board_id: task.board_id, board_name: boardName },
        req.user!.id,
        {
          priority: task.priority,
          due_date: task.due_date,
          description: task.description,
        },
      ),
    );
    return res.status(201).json({ success: true, data: task });
  } catch (error: any) {
    await client.query("ROLLBACK");
    if (error?.code === "23503") {
      return res.status(400).json({ success: false, message: "Invalid board, stage or assignee" });
    }
    console.error("Create task failed:", error);
    return res.status(500).json({ success: false, message: "Unable to create task" });
  } finally {
    client.release();
  }
});

router.patch("/:id/status", async (req, res) => {
  const client = await db.connect();

  try {
    if (req.user?.role !== "Team Member") {
      return res.status(403).json({
        success: false,
        message: "This status action is for assigned Team Members",
      });
    }

    const { stage_name } = req.body;

    if (!["In Progress", "Waiting for Review", "Completed"].includes(stage_name)) {
      return res.status(400).json({
        success: false,
        message: "Team Members can only move assigned tasks through In Progress, Waiting for Review, and Completed",
      });
    }

    await client.query("BEGIN");

    const taskResult = await client.query(
      `SELECT t.id, t.board_id, t.stage_id, t.title, t.updated_at
       FROM tasks t
       JOIN task_assignees ta ON ta.task_id = t.id
       WHERE t.id = $1 AND ta.user_id = $2
       LIMIT 1
       FOR UPDATE OF t`,
      [req.params.id, req.user.id],
    );

    const task = taskResult.rows[0];

    if (!task) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        message: "You can only update tasks assigned to you",
      });
    }

    const currentStageResult = await client.query(
      "SELECT name FROM workflow_stages WHERE id = $1 LIMIT 1",
      [task.stage_id],
    );
    const currentStageName = currentStageResult.rows[0]?.name ?? "";

    const allowedTransitions: Record<string, string[]> = {
      "To Do": ["In Progress"],
      "In Progress": ["Waiting for Review"],
      "Waiting for Review": ["Completed"],
    };

    const allowedNextStages = allowedTransitions[currentStageName] ?? [];

    if (!allowedNextStages.includes(stage_name)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Task must follow: To Do -> In Progress -> Waiting for Review -> Completed",
      });
    }

    if (stage_name === "Completed") {
      const leadReply = await client.query(
        `SELECT c.id
         FROM comments c
         JOIN users u ON u.id = c.user_id
         WHERE c.task_id = $1
           AND u.role = 'Team Lead'
           AND c.created_at >= $2
         ORDER BY c.created_at DESC
         LIMIT 1`,
        [task.id, task.updated_at],
      );

      if (!leadReply.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "A Team Lead must reply after the task enters Waiting for Review before it can be completed",
        });
      }
    }
    const stageLookupNames = stage_name === "Waiting for Review" ? ["Waiting for Review", "Review", "Waiting for Lead"] : [stage_name];

    const stageResult = await client.query(
      `SELECT id, name
       FROM workflow_stages
       WHERE board_id = $1 AND name = ANY($2::text[])
       ORDER BY CASE WHEN name = $3 THEN 0 ELSE 1 END
       LIMIT 1`,
      [task.board_id, stageLookupNames, stage_name],
    );

    const stage = stageResult.rows[0];

    if (!stage) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: `The ${stage_name} stage is not available on this board`,
      });
    }

    const updated = await client.query(
      `UPDATE tasks
       SET stage_id = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [stage.id, task.id],
    );

    await client.query(
      `INSERT INTO activity_logs (task_id, user_id, action, details)
       VALUES ($1,$2,$3,$4::jsonb)`,
      [
        task.id,
        req.user.id,
        "task_status_updated_by_assignee",
        JSON.stringify({ stage_name }),
      ],
    );

    await client.query("COMMIT");


    void getBoardName(task.board_id).then((boardName) =>
      notifyMake(
        'task_moved',
        { id: task.id, title: task.title, board_id: task.board_id, board_name: boardName },
        req.user!.id,
        {
          previous_stage_id: task.stage_id,
          stage_id: stage.id,
          stage_name: stage.name,
        },
      ),
    );

    return res.status(200).json({
      success: true,
      data: {
        ...updated.rows[0],
        stage_name: stage.name,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update assigned task status failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update task status",
    });
  } finally {
    client.release();
  }
});

router.put("/:id/assignees", async (req, res) => {
  const client = await db.connect();
  try {
    const { assignee_ids } = req.body;
    if (!Array.isArray(assignee_ids)) {
      return res.status(400).json({ success: false, message: "assignee_ids must be an array" });
    }

    const ids = [...new Set(assignee_ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0))];
    await client.query("BEGIN");

    const task = await client.query("SELECT id, title, board_id FROM tasks WHERE id = $1", [req.params.id]);
    if (!task.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    const previousAssignees = await client.query(
      "SELECT user_id FROM task_assignees WHERE task_id = $1",
      [req.params.id]
    );
    const previousIds = new Set<number>(
      previousAssignees.rows.map((row) => Number(row.user_id))
    );


    const addedIds = ids.filter((userId) => !previousIds.has(userId));

    await client.query("DELETE FROM task_assignees WHERE task_id = $1", [req.params.id]);

    for (const userId of ids) {
      await client.query(
        "INSERT INTO task_assignees (task_id, user_id, assigned_by) VALUES ($1,$2,$3)",
        [req.params.id, userId, req.user!.id]
      );

      if (!previousIds.has(userId) && userId !== req.user!.id) {
        await client.query(
          `INSERT INTO notifications (user_id, task_id, type, title, message)
           VALUES ($1, $2, 'task_assigned', 'New task assigned', $3)`,
          [
            userId,
            req.params.id,
            `Task "${task.rows[0].title}" was assigned to you.`,
          ]
        );
      }
    }

    await client.query(
      "INSERT INTO activity_logs (task_id, user_id, action, details) VALUES ($1,$2,$3,$4::jsonb)",
      [req.params.id, req.user!.id, "task_assignees_updated", JSON.stringify({ assignee_ids: ids, assignee_names: (await client.query("SELECT full_name FROM users WHERE id = ANY($1::int[])", [ids])).rows.map((u)=>u.full_name), due_date: task.rows[0].due_date })]
    );

    await client.query("COMMIT");

    const taskInfo = task.rows[0];
    void getBoardName(taskInfo.board_id).then(async (boardName) => {
      for (const userId of addedIds) {
        await notifyMake(
          'member_added',
          { id: taskInfo.id, title: taskInfo.title, board_id: taskInfo.board_id, board_name: boardName },
          req.user!.id,
          { member_id: userId },
        );
      }
    });

    return res.status(200).json({ success: true, assignee_ids: ids });
  } catch (error: any) {
    await client.query("ROLLBACK");
    if (error?.code === "23503") {
      return res.status(400).json({ success: false, message: "Invalid assignee" });
    }
    console.error("Update assignees failed:", error);
    return res.status(500).json({ success: false, message: "Unable to update assignees" });
  } finally {
    client.release();
  }
});

router.put("/:id/labels", async (req, res) => {
  const client = await db.connect();
  try {
    const { label_ids } = req.body;
    if (!Array.isArray(label_ids)) {
      return res.status(400).json({ success: false, message: "label_ids must be an array" });
    }

    const ids = [...new Set(label_ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0))];
    await client.query("BEGIN");

    const task = await client.query("SELECT id FROM tasks WHERE id = $1", [req.params.id]);
    if (!task.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    await client.query("DELETE FROM task_labels WHERE task_id = $1", [req.params.id]);
    for (const labelId of ids) {
      await client.query("INSERT INTO task_labels (task_id, label_id) VALUES ($1,$2)", [req.params.id, labelId]);
    }

    await client.query(
      "INSERT INTO activity_logs (task_id, user_id, action, details) VALUES ($1,$2,$3,$4::jsonb)",
      [req.params.id, req.user!.id, "task_labels_updated", JSON.stringify({ label_ids: ids })]
    );

    await client.query("COMMIT");
    return res.status(200).json({ success: true, label_ids: ids });
  } catch (error: any) {
    await client.query("ROLLBACK");
    if (error?.code === "23503") {
      return res.status(400).json({ success: false, message: "Invalid label" });
    }
    console.error("Update labels failed:", error);
    return res.status(500).json({ success: false, message: "Unable to update labels" });
  } finally {
    client.release();
  }
});

router.patch("/:id", async (req, res) => {
  if (req.user!.role === "Team Member") {
    return res.status(403).json({
      success: false,
      message: "Team Members must use the approved task status workflow and cannot directly edit or drag tasks",
    });
  }

  const client = await db.connect();
  try {
    const { title, description, priority, due_date, stage_id, board_id } = req.body;

    if (priority && !allowedPriorities.includes(priority)) {
      return res.status(400).json({ success: false, message: "Invalid priority" });
    }

    await client.query("BEGIN");
    const previousTaskResult = await client.query(
      'SELECT id, title, board_id, stage_id, description, priority, due_date FROM tasks WHERE id = $1 FOR UPDATE',
      [req.params.id],
    );
    const previousTask = previousTaskResult.rows[0];

    if (!previousTask) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const result = await client.query(
      "UPDATE tasks SET title=COALESCE($1,title), description=COALESCE($2,description), priority=COALESCE($3,priority), due_date=COALESCE($4,due_date), stage_id=COALESCE($5,stage_id), board_id=COALESCE($6,board_id), updated_at=NOW() WHERE id=$7 RETURNING *",
      [title ?? null, description ?? null, priority ?? null, due_date ?? null, stage_id ?? null, board_id ?? null, req.params.id]
    );

    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    await client.query(
      "INSERT INTO activity_logs (task_id, user_id, action, details) VALUES ($1,$2,$3,$4::jsonb)",
      [req.params.id, req.user!.id, "task_updated", JSON.stringify({ title, description, priority, due_date, stage_id, board_id })]
    );

    await client.query("COMMIT");

 const updatedTask = result.rows[0];
 void (async () => {
 try {
 const boardName = await getBoardName(updatedTask.board_id);
 const taskRef = {
 id: updatedTask.id,
 title: updatedTask.title,
 board_id: updatedTask.board_id,
 board_name: boardName,
 };

 if (description !== undefined && String(previousTask.description ?? '') !== String(updatedTask.description ?? '')) {
 void notifyMake('description_changed', taskRef, req.user!.id, {
 previous: previousTask.description,
 current: updatedTask.description,
 });
 }

 if (priority !== undefined && previousTask.priority !== updatedTask.priority) {
 void notifyMake('priority_changed', taskRef, req.user!.id, {
 previous: previousTask.priority,
 current: updatedTask.priority,
 });
 }

 if (due_date !== undefined && String(previousTask.due_date ?? '') !== String(updatedTask.due_date ?? '')) {
 void notifyMake('due_date_changed', taskRef, req.user!.id, {
 previous: previousTask.due_date,
 current: updatedTask.due_date,
 });
 }

 if (Number(previousTask.stage_id) !== Number(updatedTask.stage_id) || Number(previousTask.board_id) !== Number(updatedTask.board_id)) {
 const previousBoardName = await getBoardName(previousTask.board_id);
 void notifyMake(
 'task_moved',
 {
 ...taskRef,
 previous_board_id: previousTask.board_id,
 previous_board_name: previousBoardName,
 },
 req.user!.id,
 {
 previous_stage_id: previousTask.stage_id,
 stage_id: updatedTask.stage_id,
 },
 );
 }
 } catch (makeError) {
 console.error('Task Make notification failed:', makeError);
 }
 })();

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    await client.query("ROLLBACK");
    if (error?.code === "23503") {
      return res.status(400).json({ success: false, message: "Invalid board or workflow stage" });
    }
    console.error("Update task failed:", error);
    return res.status(500).json({ success: false, message: "Unable to update task" });
  } finally {
    client.release();
  }
});

router.delete("/:id", async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const task = await client.query("SELECT id, title, board_id FROM tasks WHERE id = $1", [req.params.id]);

    if (!task.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    await client.query("DELETE FROM tasks WHERE id = $1", [req.params.id]);
    await client.query(
      "INSERT INTO activity_logs (task_id, user_id, action, details) VALUES (NULL,$1,$2,$3::jsonb)",
      [req.user!.id, "task_deleted", JSON.stringify({ task_id: Number(req.params.id), title: task.rows[0].title })]
    );

    await client.query("COMMIT");
    return res.status(200).json({ success: true, message: "Task deleted" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Delete task failed:", error);
    return res.status(500).json({ success: false, message: "Unable to delete task" });
  } finally {
    client.release();
  }
});

export default router;

