import { Router } from "express";
import { db } from "../db/pool";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const boardId = Number(req.query.board_id);
    const hasBoard = Number.isInteger(boardId) && boardId > 0;
    const result = await db.query(
      hasBoard
        ? "SELECT * FROM workflow_stages WHERE board_id = $1 ORDER BY position ASC"
        : "SELECT * FROM workflow_stages ORDER BY board_id ASC, position ASC",
      hasBoard ? [boardId] : []
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get workflow failed:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch workflow" });
  }
});

router.post("/", async (req, res) => {
  try {
    const boardId = Number(req.body.board_id);
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    if (!Number.isInteger(boardId) || boardId <= 0 || !name) {
      return res.status(400).json({ success: false, message: "Board and list name are required" });
    }

    const board = await db.query("SELECT id FROM boards WHERE id = $1", [boardId]);
    if (!board.rows[0]) {
      return res.status(404).json({ success: false, message: "Board not found" });
    }

    const next = await db.query(
      "SELECT COALESCE(MAX(position),0)+1 AS position FROM workflow_stages WHERE board_id=$1",
      [boardId]
    );
    const result = await db.query(
      "INSERT INTO workflow_stages (board_id,name,position) VALUES ($1,$2,$3) RETURNING *",
      [boardId, name, Number(next.rows[0].position)]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ success: false, message: "This list name already exists on the board" });
    }
    console.error("Create workflow list failed:", error);
    return res.status(500).json({ success: false, message: "Unable to create list" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    if (!Number.isInteger(id) || id <= 0 || !name) {
      return res.status(400).json({ success: false, message: "Valid list id and name are required" });
    }

    const result = await db.query(
      "UPDATE workflow_stages SET name=$1 WHERE id=$2 RETURNING *",
      [name, id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: "List not found" });
    }
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ success: false, message: "This list name already exists on the board" });
    }
    console.error("Rename workflow list failed:", error);
    return res.status(500).json({ success: false, message: "Unable to rename list" });
  }
});

router.delete("/:id", async (req, res) => {
  const client = await db.connect();
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "Valid list id is required" });
    }

    await client.query("BEGIN");
    const stage = await client.query(
      "SELECT id,board_id,name,position FROM workflow_stages WHERE id=$1 FOR UPDATE",
      [id]
    );
    if (!stage.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "List not found" });
    }

    const taskCount = await client.query("SELECT COUNT(*)::int AS count FROM tasks WHERE stage_id=$1", [id]);
    if (taskCount.rows[0].count > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Move or delete all tasks from this list before deleting it"
      });
    }

    const { board_id, position } = stage.rows[0];
    await client.query("DELETE FROM workflow_stages WHERE id=$1", [id]);
    await client.query(
      "UPDATE workflow_stages SET position=position-1 WHERE board_id=$1 AND position>$2",
      [board_id, position]
    );
    await client.query("COMMIT");
    return res.status(200).json({ success: true, message: "List deleted" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Delete workflow list failed:", error);
    return res.status(500).json({ success: false, message: "Unable to delete list" });
  } finally {
    client.release();
  }
});

export default router;
