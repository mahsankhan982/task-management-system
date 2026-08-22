import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db/pool";

const router = Router();

const allowedRoles = ["Manager", "Coordinator", "Team Lead", "Team Member"];

router.get("/", async (_req, res) => {
  try {
    const result = await db.query(
      "SELECT id, full_name, email, role, team_id, is_active, created_at, updated_at FROM users ORDER BY full_name ASC"
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get users failed:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch users" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { full_name, email, password, role, team_id } = req.body;

    if (!full_name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: "Name, email, password and role are required" });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid user role" });
    }

    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await db.query(
      "INSERT INTO users (full_name, email, password_hash, role, team_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, full_name, email, role, team_id, is_active, created_at, updated_at",
      [full_name.trim(), email.trim().toLowerCase(), passwordHash, role, team_id ?? null]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ success: false, message: "Email already exists" });
    }

    if (error?.code === "23503") {
      return res.status(400).json({ success: false, message: "Invalid team" });
    }

    console.error("Create user failed:", error);
    return res.status(500).json({ success: false, message: "Unable to create user" });
  }
});


router.patch("/:id", async (req, res) => {
  try {
    const { full_name, email, password, role, team_id, is_active } = req.body;

    if (full_name !== undefined && (typeof full_name !== "string" || !full_name.trim())) {
      return res.status(400).json({ success: false, message: "Name cannot be empty" });
    }

    if (email !== undefined && (typeof email !== "string" || !email.trim())) {
      return res.status(400).json({ success: false, message: "Email cannot be empty" });
    }

    if (role !== undefined && !allowedRoles.includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid user role" });
    }

    if (password !== undefined && (typeof password !== "string" || password.length < 8)) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    }

    const passwordHash = password === undefined ? null : await bcrypt.hash(password, 12);

    const result = await db.query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           email = COALESCE($2, email),
           role = COALESCE($3, role),
           team_id = CASE WHEN $4::boolean THEN $5 ELSE team_id END,
           is_active = COALESCE($6, is_active),
           password_hash = COALESCE($7, password_hash),
           updated_at = NOW()
       WHERE id = $8
       RETURNING id, full_name, email, role, team_id, is_active, created_at, updated_at`,
      [
        full_name === undefined ? null : full_name.trim(),
        email === undefined ? null : email.trim().toLowerCase(),
        role ?? null,
        team_id !== undefined,
        team_id ?? null,
        is_active ?? null,
        passwordHash,
        req.params.id,
      ]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ success: false, message: "Email already exists" });
    }

    if (error?.code === "23503") {
      return res.status(400).json({ success: false, message: "Invalid team" });
    }

    console.error("Update user failed:", error);
    return res.status(500).json({ success: false, message: "Unable to update user" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    if (String(req.user!.id) === String(req.params.id)) {
      return res.status(400).json({ success: false, message: "You cannot delete your own account" });
    }

    const usage = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM tasks WHERE created_by = $1) AS created_tasks,
         (SELECT COUNT(*)::int FROM task_assignees WHERE user_id = $1) AS assignments,
         (SELECT COUNT(*)::int FROM comments WHERE user_id = $1) AS comments,
         (SELECT COUNT(*)::int FROM activity_logs WHERE user_id = $1) AS activities`,
      [req.params.id]
    );

    const row = usage.rows[0] ?? {};
    const hasHistory =
      (row.created_tasks ?? 0) > 0 ||
      (row.assignments ?? 0) > 0 ||
      (row.comments ?? 0) > 0 ||
      (row.activities ?? 0) > 0;

    if (hasHistory) {
      return res.status(409).json({
        success: false,
        message: "Deactivate this user instead because task or activity history exists",
      });
    }

    const result = await db.query("DELETE FROM users WHERE id = $1 RETURNING id", [req.params.id]);

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ success: true, message: "User deleted" });
  } catch (error) {
    console.error("Delete user failed:", error);
    return res.status(500).json({ success: false, message: "Unable to delete user" });
  }
});

export default router;
