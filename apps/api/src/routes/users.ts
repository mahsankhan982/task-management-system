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

export default router;
