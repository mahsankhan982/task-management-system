import express, { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash, createHmac } from "node:crypto";
import nodemailer from "nodemailer";
import { db } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { env } from "../config/env";

type Verification = { purpose: "profile-email"; id: number; previous: string; email: string; credential: string };
const fingerprint = (hash: string) => createHash("sha256").update(hash).digest("hex");
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

  router.patch("/me", async (req, res) => {
    const body = req.body ?? {};
    if (Object.keys(body).some(key => !["full_name", "current_password", "new_password"].includes(key))) {
      return res.status(400).json({ message: "Only your name and password can be edited here." });
    }
    const { full_name, current_password, new_password } = body;
    if (full_name !== undefined && (typeof full_name !== "string" || !full_name.trim() || full_name.trim().length > 120)) return res.status(400).json({ message: "Enter a name between 1 and 120 characters." });
    if (new_password !== undefined && (typeof new_password !== "string" || new_password.length < 8 || Buffer.byteLength(new_password) > 72)) return res.status(400).json({ message: "Password must contain at least 8 characters and at most 72 bytes." });
    if (full_name === undefined && new_password === undefined) return res.status(400).json({ message: "No profile changes supplied." });
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query("SELECT id, password_hash FROM users WHERE id=$1 AND is_active=TRUE FOR UPDATE", [req.user!.id]);
      const user = found.rows[0];
      if (!user) { await client.query("ROLLBACK"); return res.status(401).json({ message: "User not available" }); }
      if (new_password !== undefined && (typeof current_password !== "string" || !await bcrypt.compare(current_password, user.password_hash))) {
        await client.query("ROLLBACK"); return res.status(403).json({ message: "Current password is incorrect." });
      }
      const hash = new_password === undefined ? null : await bcrypt.hash(new_password, 12);
      const result = await client.query(`UPDATE users SET full_name=COALESCE($1,full_name), password_hash=COALESCE($2,password_hash), updated_at=NOW() WHERE id=$3 RETURNING ${publicFields}`, [full_name?.trim() ?? null, hash, req.user!.id]);
      await client.query("COMMIT");
      return res.json({ success: true, data: result.rows[0] });
    } catch {
      await client.query("ROLLBACK"); return res.status(500).json({ message: "Unable to save profile." });
    } finally { client.release(); }
  });

  router.post("/email/request", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Enter a valid email address." });
    try {
      const result = await db.query("SELECT id, email, password_hash FROM users WHERE id=$1 AND is_active=TRUE", [req.user!.id]);
      const user = result.rows[0];
      if (!user || typeof req.body.current_password !== "string" || !await bcrypt.compare(req.body.current_password, user.password_hash)) return res.status(403).json({ message: "Current password is incorrect." });
      if (user.email.toLowerCase() === email) return res.status(400).json({ message: "This is already your email address." });
      const existing = await db.query("SELECT id FROM users WHERE LOWER(email)=$1", [email]);
      if (existing.rows.length) return res.status(409).json({ message: "That email address is unavailable." });
      const token = jwt.sign({ purpose: "profile-email", id: Number(user.id), previous: user.email, email, credential: fingerprint(user.password_hash) }, verificationSecret(), { expiresIn: "30m" });
      const link = new URL("/dashboard/profile", env.CLIENT_URL);
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
      const found = await client.query("SELECT id, email, password_hash FROM users WHERE id=$1 AND is_active=TRUE FOR UPDATE", [req.user!.id]);
      const user = found.rows[0];
      if (!user || user.email !== proof.previous || fingerprint(user.password_hash) !== proof.credential) {
        await client.query("ROLLBACK"); return res.status(400).json({ message: "This link has already been used or is no longer valid." });
      }
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
