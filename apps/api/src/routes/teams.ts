import { Router } from "express";
import { db } from "../db/pool";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const result = await db.query("SELECT * FROM teams ORDER BY name ASC");
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get teams failed:", error);
    res.status(500).json({ success: false, message: "Unable to fetch teams" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ success: false, message: "Team name is required" });
    }

    const result = await db.query(
      "INSERT INTO teams (name, description) VALUES ($1, $2) RETURNING *",
      [name.trim(), description ?? null]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ success: false, message: "Team already exists" });
    }

    console.error("Create team failed:", error);
    return res.status(500).json({ success: false, message: "Unable to create team" });
  }
});


router.patch("/:id", async (req, res) => {
  try {
    const { name, description } = req.body;

    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      return res.status(400).json({ success: false, message: "Team name cannot be empty" });
    }

    const result = await db.query(
      `UPDATE teams
       SET name = COALESCE($1, name),
           description = CASE WHEN $2::boolean THEN $3 ELSE description END,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [
        name === undefined ? null : name.trim(),
        description !== undefined,
        description ?? null,
        req.params.id,
      ]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: "Team not found" });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ success: false, message: "Team already exists" });
    }

    console.error("Update team failed:", error);
    return res.status(500).json({ success: false, message: "Unable to update team" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const usage = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM users WHERE team_id = $1) AS user_count,
         (SELECT COUNT(*)::int FROM boards WHERE team_id = $1) AS board_count`,
      [req.params.id]
    );

    if ((usage.rows[0]?.user_count ?? 0) > 0 || (usage.rows[0]?.board_count ?? 0) > 0) {
      return res.status(409).json({
        success: false,
        message: "Move or remove assigned users and boards before deleting this team",
      });
    }

    const result = await db.query("DELETE FROM teams WHERE id = $1 RETURNING id", [req.params.id]);

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: "Team not found" });
    }

    return res.status(200).json({ success: true, message: "Team deleted" });
  } catch (error) {
    console.error("Delete team failed:", error);
    return res.status(500).json({ success: false, message: "Unable to delete team" });
  }
});

export default router;
