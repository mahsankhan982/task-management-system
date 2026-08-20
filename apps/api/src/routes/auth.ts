import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt, { type JwtPayload } from "jsonwebtoken";
import nodemailer from "nodemailer";
import { createHash, randomInt } from "crypto";
import { db } from "../db/pool";
import { env } from "../config/env";
import { requireAuth } from "../middleware/auth";

const router = Router();

type ResetTokenPayload = JwtPayload & {
  id: number;
  reset_id: number;
  purpose: "password_reset";
};

function hashResetCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

function mailer() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) {
    throw new Error("Password reset email is not configured");
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
}

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

router.post("/forgot-password", async (req, res) => {
  try {
    const email = String(req.body?.email ?? "").trim();

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const userResult = await db.query(
      "SELECT id, full_name, email, is_active FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email]
    );

    const user = userResult.rows[0];

    // Do not reveal whether an account exists.
    if (!user || !user.is_active) {
      return res.status(200).json({
        success: true,
        message: "If that email is registered, a verification code has been sent.",
      });
    }

    const code = String(randomInt(100000, 1000000));
    const codeHash = hashResetCode(code);

    await db.query(
      "DELETE FROM password_reset_codes WHERE user_id = $1 OR expires_at < NOW()",
      [user.id]
    );

    await db.query(
      `INSERT INTO password_reset_codes (user_id, code_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
      [user.id, codeHash]
    );

    await mailer().sendMail({
      from: env.SMTP_FROM,
      to: user.email,
      subject: "Task Manager password reset code",
      text: `Hello ${user.full_name}, your Task Manager verification code is ${code}. It expires in 10 minutes.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px">
          <h2 style="margin:0 0 16px">Reset your Task Manager password</h2>
          <p>Hello ${user.full_name},</p>
          <p>Use this 6-digit verification code:</p>
          <div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:18px 0">${code}</div>
          <p>This code expires in 10 minutes.</p>
          <p>If you did not request a password reset, you can ignore this email.</p>
        </div>
      `,
    });

    return res.status(200).json({
      success: true,
      message: "If that email is registered, a verification code has been sent.",
    });
  } catch (error) {
    console.error("Forgot password failed:", error);
    return res.status(500).json({ success: false, message: "Unable to send reset code" });
  }
});

router.post("/verify-reset-code", async (req, res) => {
  try {
    const email = String(req.body?.email ?? "").trim();
    const code = String(req.body?.code ?? "").trim();

    if (!email || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: "Enter a valid 6-digit code" });
    }

    if (!env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not configured");
    }

    const result = await db.query(
      `SELECT prc.id AS reset_id, u.id AS user_id
       FROM password_reset_codes prc
       JOIN users u ON u.id = prc.user_id
       WHERE LOWER(u.email) = LOWER($1)
         AND prc.code_hash = $2
         AND prc.expires_at > NOW()
         AND prc.verified_at IS NULL
       ORDER BY prc.created_at DESC
       LIMIT 1`,
      [email, hashResetCode(code)]
    );

    const row = result.rows[0];

    if (!row) {
      return res.status(400).json({ success: false, message: "Invalid or expired verification code" });
    }

    await db.query(
      "UPDATE password_reset_codes SET verified_at = NOW() WHERE id = $1",
      [row.reset_id]
    );

    const resetToken = jwt.sign(
      {
        id: Number(row.user_id),
        reset_id: Number(row.reset_id),
        purpose: "password_reset",
      },
      env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    return res.status(200).json({
      success: true,
      reset_token: resetToken,
    });
  } catch (error) {
    console.error("Verify reset code failed:", error);
    return res.status(500).json({ success: false, message: "Unable to verify reset code" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const resetToken = String(req.body?.reset_token ?? "");
    const newPassword = String(req.body?.new_password ?? "");

    if (!resetToken) {
      return res.status(400).json({ success: false, message: "Reset session is missing" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    }

    if (!env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not configured");
    }

    const decoded = jwt.verify(resetToken, env.JWT_SECRET) as ResetTokenPayload;

    if (decoded.purpose !== "password_reset" || !decoded.id || !decoded.reset_id) {
      return res.status(400).json({ success: false, message: "Invalid reset session" });
    }

    const resetResult = await db.query(
      `SELECT id
       FROM password_reset_codes
       WHERE id = $1
         AND user_id = $2
         AND verified_at IS NOT NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [decoded.reset_id, decoded.id]
    );

    if (!resetResult.rows[0]) {
      return res.status(400).json({ success: false, message: "Reset session has expired" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await db.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
      [passwordHash, decoded.id]
    );

    await db.query(
      "DELETE FROM password_reset_codes WHERE user_id = $1",
      [decoded.id]
    );

    return res.status(200).json({
      success: true,
      message: "Password changed successfully. You can now sign in.",
    });
  } catch (error) {
    console.error("Reset password failed:", error);

    if (error instanceof jwt.TokenExpiredError) {
      return res.status(400).json({ success: false, message: "Reset session has expired" });
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(400).json({ success: false, message: "Invalid reset session" });
    }

    return res.status(500).json({ success: false, message: "Unable to reset password" });
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