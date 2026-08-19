import { Router } from "express";
import { db } from "../db/pool";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         n.id,
         n.user_id,
         n.task_id,
         n.type,
         n.title,
         n.message,
         n.is_read,
         n.created_at,
         t.title AS task_title
       FROM notifications n
       LEFT JOIN tasks t ON t.id = n.task_id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [req.user!.id]
    );

    const unreadResult = await db.query(
      "SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE",
      [req.user!.id]
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
      unread_count: Number(unreadResult.rows[0]?.count ?? 0),
    });
  } catch (error) {
    console.error("Get notifications failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch notifications",
    });
  }
});

router.patch("/read-all", async (req, res) => {
  try {
    await db.query(
      "UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE",
      [req.user!.id]
    );

    return res.status(200).json({
      success: true,
      message: "Notifications marked as read",
    });
  } catch (error) {
    console.error("Mark all notifications read failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update notifications",
    });
  }
});

router.patch("/:id/read", async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [req.params.id, req.user!.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error) {
    console.error("Mark notification read failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update notification",
    });
  }
});

export default router;
