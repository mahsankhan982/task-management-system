import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db/pool";
import { env } from "../config/env";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const result = await db.query(
      "SELECT id, full_name, email, password_hash, role, team_id, is_active FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [String(email).trim()]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: "Account is inactive" });
    }

    const passwordMatches = await bcrypt.compare(String(password), user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    if (!env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not configured");
    }

    const token = jwt.sign(
      {
        id: Number(user.id),
        email: user.email,
        role: user.role,
        team_id: user.team_id === null ? null : Number(user.team_id),
      },
      env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: Number(user.id),
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        team_id: user.team_id === null ? null : Number(user.team_id),
      },
    });
  } catch (error) {
    console.error("Login failed:", error);
    return res.status(500).json({ success: false, message: "Unable to login" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, full_name, email, role, team_id, is_active FROM users WHERE id = $1 LIMIT 1",
      [req.user!.id]
    );

    const user = result.rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: "User not available" });
    }

    return res.status(200).json({ success: true, data: user });
  } catch (error) {
    console.error("Get current user failed:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch user" });
  }
});

export default router;
