import { Router } from "express";
import { db } from "../db/pool";

const router = Router();

router.get("/task/:taskId", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM checklist_items WHERE task_id = $1 ORDER BY position ASC, id ASC",
      [req.params.taskId]
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get checklist failed:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch checklist" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { task_id, title, position } = req.body;

    if (!task_id || !title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ success: false, message: "Task and title are required" });
    }

    const result = await db.query(
      "INSERT INTO checklist_items (task_id, title, position) VALUES ($1, $2, $3) RETURNING *",
      [task_id, title.trim(), position ?? 0]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error?.code === "23503") {
      return res.status(400).json({ success: false, message: "Invalid task" });
    }

    console.error("Create checklist item failed:", error);
    return res.status(500).json({ success: false, message: "Unable to create checklist item" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { title, is_completed, position } = req.body;

    const result = await db.query(
      "UPDATE checklist_items SET title = COALESCE($1, title), is_completed = COALESCE($2, is_completed), position = COALESCE($3, position) WHERE id = $4 RETURNING *",
      [title ?? null, is_completed ?? null, position ?? null, req.params.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: "Checklist item not found" });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Update checklist failed:", error);
    return res.status(500).json({ success: false, message: "Unable to update checklist item" });
  }
});

export default router;
