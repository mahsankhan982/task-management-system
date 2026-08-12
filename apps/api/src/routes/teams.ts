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

export default router;
