import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { createHmac, randomUUID } from "node:crypto";
import sharp from "sharp";
import { db } from "../db/pool";

export async function verifyProfileEdits(userId: number, email: string, password: string) {
  const otherEmail = `profile-check-${randomUUID()}@example.invalid`;
  const other = await db.query("INSERT INTO users (full_name,email,password_hash,role,is_active) SELECT 'Temporary duplicate-email test',$1,password_hash,'Team Member',TRUE FROM users WHERE id=$2 RETURNING id", [otherEmail, userId]);
  const otherId = other.rows[0].id;
  try {
    for (const base of ["https://task-management-api-lyart.vercel.app", "https://web-two-peach-98.vercel.app"]) {
      const login = () => fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(30000) });
      const session = await (await login()).json() as { token: string };
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` };
      const patch = (body: unknown) => fetch(base + "/api/auth/profile", { method: "PATCH", headers, body: JSON.stringify(body) });
      assert.equal((await patch({ full_name: "Temporary profile test" })).status, 200);
      assert.equal((await patch({ full_name: "Disallowed", id: otherId })).status, 400);
      assert.equal((await patch({ new_password: "must-not-be-accepted", current_password: password })).status, 400);
      for (const [candidate, status] of [["invalid-email", 400], [otherEmail, 409]] as const) {
        const response = await fetch(base + "/api/profile/email/request", { method: "POST", headers, body: JSON.stringify({ email: candidate }) });
        assert.equal(response.status, status);
      }
      const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: "blue" } }).png().toBuffer();
      const uploaded = await fetch(base + "/api/profile/avatar", { method: "POST", headers: { Authorization: headers.Authorization, "Content-Type": "image/png" }, body: png as unknown as BodyInit });
      assert.equal(uploaded.status, 200);
      const me = await fetch(base + "/api/auth/profile", { headers });
      assert.equal(me.status, 200);
      const profile = await me.json() as { data: { full_name: string; avatar_url: string } };
      assert.equal(profile.data.full_name, "Temporary profile test");
      assert.ok(profile.data.avatar_url);
      assert.equal((await fetch(base + profile.data.avatar_url)).status, 200);
      const refreshed = await fetch(base + "/api/auth/profile", { headers });
      assert.equal((await refreshed.json() as { data: { avatar_url: string } }).data.avatar_url, profile.data.avatar_url, "Saved photo persists on fresh profile fetch");
      const changedEmail = `verified-${randomUUID()}@example.invalid`;
      const verificationKey = createHmac("sha256", env.JWT_SECRET).update("profile-email-verification").digest("hex");
      const confirmEmail = async (previous: string, next: string) => {
        const proof = jwt.sign({ purpose: "profile-email", id: userId, previous, email: next }, verificationKey, { expiresIn: "5m" });
        return fetch(base + "/api/profile/email/verify", { method: "POST", headers, body: JSON.stringify({ token: proof }) });
      };
      try {
        assert.equal((await confirmEmail(email, changedEmail)).status, 200);
        const changedLogin = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: changedEmail, password }) });
        assert.equal(changedLogin.status, 200, "Verified email works for fresh login");
        const freshSession = await changedLogin.json() as { token: string };
        const freshProfile = await fetch(base + "/api/auth/profile", { headers: { Authorization: `Bearer ${freshSession.token}` } });
        assert.equal((await freshProfile.json() as { data: { email: string } }).data.email, changedEmail);
      } finally {
        const current = await db.query("SELECT email FROM users WHERE id=$1", [userId]);
        if (current.rows[0]?.email === changedEmail) assert.equal((await confirmEmail(changedEmail, email)).status, 200);
      }
      assert.equal((await login()).status, 200, "Original login credentials remain valid after profile edits");
      console.log("Verified", base, "own-name edit, avatar upload, duplicate/invalid email rejection, password-update rejection, email verification and fresh login.");
    }
  } finally {
    await db.query("DELETE FROM users WHERE id=$1 AND email=$2", [otherId, otherEmail]);
    console.log("Temporary duplicate-email fixture removed.");
  }
}
