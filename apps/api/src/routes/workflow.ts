import { Router } from "express";
import { db } from "../db/pool";
import { ensureForPosting } from "../lib/workflowStages";

const router = Router();

const listCreatorRoles = new Set(["Manager", "Admin", "Coordinator", "Team Lead"]);

let archiveSetupPromise: Promise<void> | null = null;

async function ensureArchiveSupport() {
  if (!archiveSetupPromise) {
    archiveSetupPromise = (async () => {
      await db.query(
        "ALTER TABLE workflow_stages ADD COLUMN IF NOT EXISTS created_by BIGINT"
      );
      await db.query(
        "ALTER TABLE workflow_stages ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE"
      );
      await db.query(
        "ALTER TABLE workflow_stages ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE"
      );
      await db.query(
        `UPDATE workflow_stages
         SET is_system=TRUE
         WHERE LOWER(TRIM(name)) IN ('to do','in progress','waiting for review','review','waiting for lead','for posting','completed')`
      );
      await db.query(
        "CREATE INDEX IF NOT EXISTS idx_workflow_stages_active_board ON workflow_stages (board_id, position) WHERE is_archived = FALSE"
      );
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        // Stable lock order serializes concurrent clients without shifting positions.
        const boards = await client.query("SELECT id FROM boards ORDER BY id FOR UPDATE");
        for (const board of boards.rows) await ensureForPosting(client, Number(board.id));
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    })().catch((error) => {
      archiveSetupPromise = null;
      throw error;
    });
  }

  await archiveSetupPromise;
}

router.get("/", async (req, res) => {
  try {
    await ensureArchiveSupport();
    const boardId = Number(req.query.board_id);
    const hasBoard = Number.isInteger(boardId) && boardId > 0;
    const result = await db.query(
      hasBoard
        ? "SELECT * FROM workflow_stages WHERE board_id = $1 AND COALESCE(is_archived,FALSE)=FALSE ORDER BY position ASC"
        : "SELECT * FROM workflow_stages WHERE COALESCE(is_archived,FALSE)=FALSE ORDER BY board_id ASC, position ASC",
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
    await ensureArchiveSupport();

    if (!listCreatorRoles.has(req.user!.role)) {
      return res.status(403).json({
        success: false,
        message: "Only a Team Lead, Coordinator or Manager can add lists",
      });
    }

    const boardId = Number(req.body.board_id);
    const name =
      typeof req.body.name === "string" ? req.body.name.trim() : "";

    if (!Number.isInteger(boardId) || boardId <= 0 || !name || name.length > 50) {
      return res.status(400).json({
        success: false,
        message: "A valid board and a list name of 1–50 characters are required",
      });
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      // Lock this board while its custom-list ordering is being changed.
      const board = await client.query(
        "SELECT id FROM boards WHERE id = $1 FOR UPDATE",
        [boardId],
      );

      if (!board.rows[0]) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Board not found",
        });
      }

      if (name.toLowerCase() === "for posting") {
        const result = await ensureForPosting(client, boardId, req.user!.id);
        await client.query("COMMIT");
        return res.status(result.created ? 201 : 200).json({ success: true, data: result.stage });
      }

      // Newly created custom list is always the left-most custom list.
      const result = await client.query(
        "INSERT INTO workflow_stages (board_id,name,position,created_by,is_system) SELECT $1,$2,LEAST(COALESCE(MIN(position),0),0)-1,$3,$4 FROM workflow_stages WHERE board_id=$1 RETURNING *",
        [boardId, name, req.user!.id, ["to do", "in progress", "waiting for review", "review", "waiting for lead", "for posting", "completed"].includes(name.toLowerCase())],
      );

      await client.query("COMMIT");

      return res.status(201).json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({
        success: false,
        message: error.constraint === "workflow_stages_board_name_unique" || error.constraint === "workflow_stages_name_key"
          ? "This list name already exists on the board"
          : "List ordering conflict. Refresh the board and retry.",
      });
    }

    console.error("Create workflow list failed:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create list",
    });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    await ensureArchiveSupport();
    const id = Number(req.params.id);
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    if (!Number.isInteger(id) || id <= 0 || !name || name.length > 50) {
      return res.status(400).json({ success: false, message: "A valid list id and a name of 1–50 characters are required" });
    }

    const stage = await db.query("SELECT id,created_by,is_system FROM workflow_stages WHERE id=$1", [id]);
    if (!stage.rows[0]) return res.status(404).json({ success: false, message: "List not found" });
    if (stage.rows[0].is_system) return res.status(403).json({ success: false, message: "Permanent lists cannot be edited" });
    if (!listCreatorRoles.has(req.user!.role)) {
      return res.status(403).json({ success: false, message: "Only a Team Lead, Coordinator or Manager can edit custom lists" });
    }

    const result = await db.query("UPDATE workflow_stages SET name=$1 WHERE id=$2 RETURNING *", [name, id]);
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
  try {
    await ensureArchiveSupport();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "Valid list id is required" });
    }

    const stage = await db.query(
      "SELECT id,board_id,name,position,created_by,is_system,is_archived FROM workflow_stages WHERE id=$1",
      [id]
    );
    if (!stage.rows[0]) {
      return res.status(404).json({ success: false, message: "List not found" });
    }

    if (stage.rows[0].is_archived) {
      return res.status(200).json({ success: true, message: "List already deleted" });
    }

    if (stage.rows[0].is_system) {
      return res.status(403).json({ success: false, message: "Permanent lists cannot be deleted" });
    }
    if (!listCreatorRoles.has(req.user!.role)) {
      return res.status(403).json({ success: false, message: "Only a Team Lead, Coordinator or Manager can delete custom lists" });
    }

    const taskCount = await db.query("SELECT COUNT(*)::int AS count FROM tasks WHERE stage_id=$1", [id]);
    if (taskCount.rows[0].count > 0) {
      return res.status(409).json({
        success: false,
        message: "Move or delete all tasks from this list before deleting it"
      });
    }

    await db.query(
      `UPDATE workflow_stages
       SET is_archived=TRUE,
           name=LEFT(name, 70) || ' [deleted-' || id || ']'
       WHERE id=$1`,
      [id]
    );
    return res.status(200).json({ success: true, message: "List deleted" });
  } catch (error) {
    console.error("Delete workflow list failed:", error);
    return res.status(500).json({ success: false, message: "Unable to delete list" });
  }
});

export default router;
