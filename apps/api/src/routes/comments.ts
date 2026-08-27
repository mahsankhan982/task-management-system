import { Router } from "express";
import { db } from "../db/pool";
import { getBoardName, notifyMake } from '../lib/notifyMake';

const router = Router();

router.get("/task/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;

    const result = await db.query(
      "SELECT c.*, u.full_name AS user_name, u.role AS user_role FROM comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.task_id = $1 ORDER BY c.created_at ASC",
      [taskId]
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get comments failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch comments",
    });
  }
});

router.post("/", async (req, res) => {
  const client = await db.connect();

  try {
    const { task_id, body, mention_ids } = req.body;

    if (!task_id || !body || typeof body !== "string" || !body.trim()) {
      return res.status(400).json({
        success: false,
        message: "Task and comment are required",
      });
    }

    const mentions = Array.isArray(mention_ids)
      ? [...new Set(
          mention_ids
            .map(Number)
            .filter((id: number) => Number.isInteger(id) && id > 0)
        )]
      : [];

    await client.query("BEGIN");

    const taskResult = await client.query(
      "SELECT id, title, board_id FROM tasks WHERE id = $1",
      [task_id]
    );

    if (!taskResult.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    const result = await client.query(
      "INSERT INTO comments (task_id, user_id, body) VALUES ($1, $2, $3) RETURNING *",
      [task_id, req.user!.id, body.trim()]
    );

    if (mentions.length > 0) {
      await client.query(
        `INSERT INTO notifications (user_id, task_id, type, title, message)
         SELECT
           u.id,
           $1,
           'mention',
           'You were mentioned',
           $2
         FROM users u
         WHERE u.id = ANY($3::bigint[])
           AND u.id <> $4
           AND u.is_active = TRUE`,
        [
          task_id,
          `You were mentioned in task "${taskResult.rows[0].title}".`,
          mentions,
          req.user!.id,
        ]
      );
    }

    await client.query("COMMIT");

    const task = taskResult.rows[0];
    void getBoardName(task.board_id).then((boardName) =>
      notifyMake(
        'comment_added',
        { id: task.id, title: task.title, board_id: task.board_id, board_name: boardName },
        req.user!.id,
        { comment: body.trim() },
      ),
    );

    return res.status(201).json({
      success: true,
      data: result.rows[0],
      mentioned_user_ids: mentions,
    });
  } catch (error: any) {
    await client.query("ROLLBACK");

    if (error?.code === "23503") {
      return res.status(400).json({
        success: false,
        message: "Invalid task or user",
      });
    }

    console.error("Create comment failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to create comment",
    });
  } finally {
    client.release();
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { body } = req.body;

    if (!body || typeof body !== "string" || !body.trim()) {
      return res.status(400).json({
        success: false,
        message: "Comment body is required",
      });
    }

    const commentResult = await db.query("SELECT * FROM comments WHERE id = $1", [id]);
    const comment = commentResult.rows[0];

    if (!comment) {
      return res.status(404).json({ success: false, message: "Comment not found" });
    }

    if (
      false &&
      req.user!.role !== "Manager" &&
      req.user!.role !== "Coordinator"
    ) {
      return res.status(403).json({ success: false, message: "Not authorized to edit this comment" });
    }

    const result = await db.query(
      "UPDATE comments SET body = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [body.trim(), id]
    );

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Edit comment failed:", error);
    return res.status(500).json({ success: false, message: "Unable to edit comment" });
  }
});

export default router;

