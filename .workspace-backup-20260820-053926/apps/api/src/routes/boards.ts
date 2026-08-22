import { Router } from "express";
import { db } from "../db/pool";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const result = await db.query(
      "SELECT b.*, t.name AS team_name FROM boards b LEFT JOIN teams t ON t.id = b.team_id ORDER BY b.created_at DESC"
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get boards failed:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch boards" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, description, team_id } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ success: false, message: "Board name is required" });
    }

    const result = await db.query(
      "INSERT INTO boards (name, description, team_id, created_by) VALUES ($1, $2, $3, $4) RETURNING *",
      [name.trim(), description ?? null, team_id ?? null, req.user!.id]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error?.code === "23503") {
      return res.status(400).json({ success: false, message: "Invalid team or creator" });
    }

    console.error("Create board failed:", error);
    return res.status(500).json({ success: false, message: "Unable to create board" });
  }
});


router.patch("/:id", async (req, res) => {
  try {
    const { name, description, team_id } = req.body;

    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      return res.status(400).json({ success: false, message: "Board name cannot be empty" });
    }

    const result = await db.query(
      `UPDATE boards
       SET name = COALESCE($1, name),
           description = CASE WHEN $2::boolean THEN $3 ELSE description END,
           team_id = CASE WHEN $4::boolean THEN $5 ELSE team_id END,
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        name === undefined ? null : name.trim(),
        description !== undefined,
        description ?? null,
        team_id !== undefined,
        team_id ?? null,
        req.params.id,
      ]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: "Board not found" });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error?.code === "23503") {
      return res.status(400).json({ success: false, message: "Invalid team" });
    }

    console.error("Update board failed:", error);
    return res.status(500).json({ success: false, message: "Unable to update board" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const usage = await db.query(
      "SELECT COUNT(*)::int AS task_count FROM tasks WHERE board_id = $1",
      [req.params.id]
    );

    if ((usage.rows[0]?.task_count ?? 0) > 0) {
      return res.status(409).json({
        success: false,
        message: "Move or delete board tasks before deleting this board",
      });
    }

    const result = await db.query("DELETE FROM boards WHERE id = $1 RETURNING id", [req.params.id]);

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: "Board not found" });
    }

    return res.status(200).json({ success: true, message: "Board deleted" });
  } catch (error) {
    console.error("Delete board failed:", error);
    return res.status(500).json({ success: false, message: "Unable to delete board" });
  }
});

export default router;
