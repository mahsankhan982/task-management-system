import { Router } from "express";
import { db } from "../db/pool";

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
    return res.status(500).json({ success: false, message: "Unable to fetch comments" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { task_id, body } = req.body;

    if (!task_id || !body || typeof body !== "string" || !body.trim()) {
      return res.status(400).json({ success: false, message: "Task, user and comment are required" });
    }

    const result = await db.query(
      "INSERT INTO comments (task_id, user_id, body) VALUES ($1, $2, $3) RETURNING *",
      [task_id, req.user!.id, body.trim()]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error?.code === "23503") {
      return res.status(400).json({ success: false, message: "Invalid task or user" });
    }

    console.error("Create comment failed:", error);
    return res.status(500).json({ success: false, message: "Unable to create comment" });
  }
});

export default router;
