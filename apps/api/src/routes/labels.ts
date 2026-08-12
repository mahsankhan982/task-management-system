import { Router } from "express";
import { db } from "../db/pool";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const result = await db.query("SELECT * FROM labels ORDER BY name ASC");
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get labels failed:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch labels" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, color } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ success: false, message: "Label name is required" });
    }

    const result = await db.query(
      "INSERT INTO labels (name, color) VALUES ($1, $2) RETURNING *",
      [name.trim(), color ?? null]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ success: false, message: "Label already exists" });
    }

    console.error("Create label failed:", error);
    return res.status(500).json({ success: false, message: "Unable to create label" });
  }
});

export default router;
