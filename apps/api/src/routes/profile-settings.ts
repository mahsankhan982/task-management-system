import express, { Router } from "express";
import jwt from "jsonwebtoken";
import { createHmac } from "node:crypto";
import nodemailer from "nodemailer";
import { db } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { env } from "../config/env";

type Verification = { purpose: "profile-email"; id: number; previous: string; email: string };
const verificationSecret = () => createHmac("sha256", env.JWT_SECRET).update("profile-email-verification").digest("hex");
const publicFields = "id, full_name, email, role, team_id, avatar_url";

async function sendEmail(email: string, link: string) {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) throw new Error("Email delivery is not configured");
  const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
  await transport.sendMail({ from: env.SMTP_FROM, to: email, subject: "Verify your Task Manager email", text: `Confirm your new email address by opening this link while signed into your account:\n${link}\nThis link expires in 30 minutes. If you did not request this change, ignore it.` });
}

export function createProfileSettingsRouter(deliver = sendEmail) {
  const router = Router();
  router.use(requireAuth, express.json({ limit: "16kb" }));

  router.get("/", async (req, res) => {
    try {
      const result = await db.query(`SELECT ${publicFields} FROM users WHERE id=$1 AND is_active=TRUE`, [req.user!.id]);
      if (!result.rows[0]) return res.status(401).json({ message: "User not available" });
      res.set("Cache-Control", "private, no-store");
      return res.json({ success: true, data: result.rows[0] });
    } catch { return res.status(500).json({ message: "Unable to load profile." }); }
  });

  router.patch(["/", "/me"], async (req, res) => {
    const body = req.body ?? {};
    if (Object.keys(body).some(key => key !== "full_name")) return res.status(400).json({ message: "Only your full name can be edited here. Email changes require verification." });
    const { full_name } = body;
    if (typeof full_name !== "string" || !full_name.trim() || full_name.trim().length > 120) return res.status(400).json({ message: "Enter a name between 1 and 120 characters." });
    try {
      const result = await db.query(`UPDATE users SET full_name=$1, updated_at=NOW() WHERE id=$2 AND is_active=TRUE RETURNING ${publicFields}`, [full_name.trim(), req.user!.id]);
      if (!result.rows[0]) return res.status(401).json({ message: "User not available" });
      return res.json({ success: true, data: result.rows[0] });
    } catch { return res.status(500).json({ message: "Unable to save profile." }); }
  });

  router.post("/email/request", async (req, res) => {
    if (Object.keys(req.body ?? {}).some(key => key !== "email")) return res.status(400).json({ message: "Only your email address can be changed here." });
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Enter a valid email address." });
    try {
      const result = await db.query("SELECT id, email FROM users WHERE id=$1 AND is_active=TRUE", [req.user!.id]);
      const user = result.rows[0];
      if (!user) return res.status(401).json({ message: "User not available" });
      if (user.email.toLowerCase() === email) return res.status(400).json({ message: "This is already your email address." });
      const existing = await db.query("SELECT id FROM users WHERE LOWER(email)=$1", [email]);
      if (existing.rows.length) return res.status(409).json({ message: "That email address is unavailable." });
      const token = jwt.sign({ purpose: "profile-email", id: Number(user.id), previous: user.email, email }, verificationSecret(), { expiresIn: "30m" });
      const link = new URL("/dashboard/profile", env.PROFILE_CLIENT_URL);
      // A fragment keeps the verification token out of server access logs/referrers.
      link.hash = "verify=" + encodeURIComponent(token);
      await deliver(email, link.href);
      return res.json({ success: true, message: "Verification link sent. Your email will change after you confirm it." });
    } catch {
      return res.status(503).json({ message: "Unable to send verification email. Check email delivery configuration or try again later." });
    }
  });

  router.post("/email/verify", async (req, res) => {
    let proof: Verification;
    try {
      proof = jwt.verify(String(req.body?.token ?? ""), verificationSecret(), { algorithms: ["HS256"] }) as Verification;
      if (proof.purpose !== "profile-email" || Number(proof.id) !== Number(req.user!.id)) throw new Error();
    } catch { return res.status(400).json({ message: "Invalid or expired verification link. Sign into the account that requested it." }); }
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query("SELECT id, email FROM users WHERE id=$1 AND is_active=TRUE FOR UPDATE", [req.user!.id]);
      const user = found.rows[0];
      if (!user || user.email !== proof.previous) {
        await client.query("ROLLBACK"); return res.status(400).json({ message: "This link has already been used or is no longer valid." });
      }
      const duplicate = await client.query("SELECT id FROM users WHERE LOWER(email)=$1 AND id<>$2", [proof.email, req.user!.id]);
      if (duplicate.rows.length) { await client.query("ROLLBACK"); return res.status(409).json({ message: "That email address is unavailable." }); }
      const result = await client.query(`UPDATE users SET email=$1, updated_at=NOW() WHERE id=$2 RETURNING ${publicFields}`, [proof.email, req.user!.id]);
      await client.query("COMMIT");
      return res.json({ success: true, data: result.rows[0] });
    } catch (error: any) {
      await client.query("ROLLBACK"); return res.status(error?.code === "23505" ? 409 : 500).json({ message: "Email could not be changed. It may already be in use." });
    } finally { client.release(); }
  });
  return router;
}

export default createProfileSettingsRouter();
