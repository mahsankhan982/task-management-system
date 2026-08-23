import { Router } from "express";
import { db } from "../db/pool";

const router = Router();
const allowedPriorities = ["Critical", "High", "Medium", "Low"];

router.get("/", async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT
         t.*,
         b.name AS board_name,
         w.name AS stage_name,
         COALESCE(
           (
             SELECT json_agg(
               json_build_object(
                 'id', u.id,
                 'full_name', u.full_name,
                 'email', u.email,
                 'role', u.role
               )
               ORDER BY u.full_name
             )
             FROM task_assignees ta
             JOIN users u ON u.id = ta.user_id
             WHERE ta.task_id = t.id
           ),
           '[]'::json
         ) AS assignees
       FROM tasks t
       JOIN boards b ON b.id = t.board_id
       JOIN workflow_stages w ON w.id = t.stage_id
       ORDER BY t.created_at DESC`
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get tasks failed:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch tasks" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const taskResult = await db.query(
      "SELECT t.*, b.name AS board_name, w.name AS stage_name FROM tasks t JOIN boards b ON b.id = t.board_id JOIN workflow_stages w ON w.id = t.stage_id WHERE t.id = $1",
      [req.params.id]
    );

    if (!taskResult.rows[0]) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    const [assignees, checklist, comments, labels, activity] = await Promise.all([
     db.query(
  `
  SELECT 
    u.id,
    u.full_name,
    u.email,
    u.role,
    u.team_id,
    ab.id AS assigned_by_id,
    ab.full_name AS assigned_by_name
  FROM task_assignees ta
  JOIN users u ON u.id = ta.user_id
  LEFT JOIN users ab ON ab.id = ta.assigned_by
  WHERE ta.task_id = $1
  ORDER BY u.full_name
  `,
  [req.params.id]
),