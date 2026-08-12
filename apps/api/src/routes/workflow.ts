import { Router } from "express";
import { db } from "../db/pool";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const result = await db.query("SELECT * FROM workflow_stages ORDER BY position ASC");
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get workflow failed:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch workflow" });
  }
});

export default router;
