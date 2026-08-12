import { Router } from "express";
import { db } from "../db/pool";

const router = Router();

const allowedPriorities = ["Critical", "High", "Medium", "Low"];

router.get("/", async (_req, res) => {
  try {
    const result = await db.query(
      "SELECT t.*, b.name AS board_name, w.name AS stage_name FROM tasks t JOIN boards b ON b.id = t.board_id JOIN workflow_stages w ON w.id = t.stage_id ORDER BY t.created_at DESC"
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get tasks failed:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch tasks" });
  }
});

router.post("/", async (req, res) => {
  const client = await db.connect();

  try {
    const { board_id, stage_id, title, description, priority, due_date, created_by, assignee_ids } = req.body;

    if (!board_id || !stage_id || !title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ success: false, message: "Board, stage and title are required" });
    }

    const taskPriority = priority ?? "Medium";

    if (!allowedPriorities.includes(taskPriority)) {
      return res.status(400).json({ success: false, message: "Invalid priority" });
    }

    await client.query("BEGIN");

    const result = await client.query(
      "INSERT INTO tasks (board_id, stage_id, title, description, priority, due_date, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [board_id, stage_id, title.trim(), description ?? null, taskPriority, due_date ?? null, created_by ?? null]
    );

    const task = result.rows[0];

    if (Array.isArray(assignee_ids)) {
      for (const userId of assignee_ids) {
        await client.query(
          "INSERT INTO task_assignees (task_id, user_id, assigned_by) VALUES ($1, $2, $3) ON CONFLICT (task_id, user_id) DO NOTHING",
          [task.id, userId, created_by ?? null]
        );
      }
    }

    await client.query("COMMIT");
    return res.status(201).json({ success: true, data: task });
  } catch (error: any) {
    await client.query("ROLLBACK");

    if (error?.code === "23503") {
      return res.status(400).json({ success: false, message: "Invalid board, stage, creator or assignee" });
    }

    console.error("Create task failed:", error);
    return res.status(500).json({ success: false, message: "Unable to create task" });
  } finally {
    client.release();
  }
});

export default router;
