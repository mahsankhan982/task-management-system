import { Router } from "express";
import { db } from "../db/pool";

const router = Router();

const boardManagerRoles = new Set(["Manager", "Admin", "Coordinator", "Team Lead"]);
const canManageBoards = (role: string | undefined) => boardManagerRoles.has(role ?? "");

const defaultWorkflow = [
  ["To Do", 1],
  ["In Progress", 2],
  ["Waiting for Review", 3],
  ["Completed", 4],
] as const;

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
  const client = await db.connect();

  try {
    if (!canManageBoards(req.user!.role)) {
      return res.status(403).json({ success: false, message: "Only a Team Lead, Coordinator or Manager can create boards" });
    }
    const { name, description, team_id } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ success: false, message: "Board name is required" });
    }

    await client.query("BEGIN");

    const result = await client.query(
      "INSERT INTO boards (name, description, team_id, created_by) VALUES ($1, $2, $3, $4) RETURNING *",
      [name.trim(), description ?? null, team_id ?? null, req.user!.id]
    );

    const board = result.rows[0];

    for (const [stageName, position] of defaultWorkflow) {
      await client.query(
        "INSERT INTO workflow_stages (board_id, name, position, created_by, is_system) VALUES ($1, $2, $3, $4, TRUE)",
        [board.id, stageName, position, req.user!.id]
      );
    }

    await client.query("COMMIT");
    return res.status(201).json({ success: true, data: board });
  } catch (error: any) {
    await client.query("ROLLBACK");

    if (error?.code === "23503") {
      return res.status(400).json({ success: false, message: "Invalid team or creator" });
    }

    console.error("Create board failed:", error);
    return res.status(500).json({ success: false, message: "Unable to create board" });
  } finally {
    client.release();
  }
});

router.patch("/:id", async (req, res) => {
  try {
    if (!canManageBoards(req.user!.role)) {
      return res.status(403).json({ success: false, message: "Not authorized to edit boards" });
    }

    const existing = await db.query("SELECT id,is_system FROM boards WHERE id=$1", [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ success: false, message: "Board not found" });
    if (existing.rows[0].is_system) {
      return res.status(403).json({ success: false, message: "Permanent boards cannot be edited" });
    }
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
    if (!canManageBoards(req.user!.role)) {
      return res.status(403).json({ success: false, message: "Not authorized to delete boards" });
    }

    const existing = await db.query("SELECT id,is_system FROM boards WHERE id=$1", [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ success: false, message: "Board not found" });
    if (existing.rows[0].is_system) {
      return res.status(403).json({ success: false, message: "Permanent boards cannot be deleted" });
    }
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

