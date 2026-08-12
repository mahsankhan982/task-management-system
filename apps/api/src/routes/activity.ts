import { Router } from "express";
import { db } from "../db/pool";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const result = await db.query(
      "SELECT a.*, u.full_name AS user_name FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT 200"
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get activity failed:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch activity" });
  }
});

router.get("/task/:taskId", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT a.*, u.full_name AS user_name FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id WHERE a.task_id = $1 ORDER BY a.created_at DESC",
      [req.params.taskId]
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get task activity failed:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch task activity" });
  }
});

export default router;
