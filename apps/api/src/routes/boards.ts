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

export default router;
