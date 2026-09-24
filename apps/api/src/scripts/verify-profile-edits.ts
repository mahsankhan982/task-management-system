import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
      const patch = (body: unknown) => fetch(base + "/api/profile/me", { method: "PATCH", headers, body: JSON.stringify(body) });
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
      const me = await fetch(base + "/api/auth/me", { headers });
      assert.equal(me.status, 200);
      const profile = await me.json() as { data: { full_name: string; avatar_url: string } };
      assert.equal(profile.data.full_name, "Temporary profile test");
      assert.ok(profile.data.avatar_url);
      assert.equal((await fetch(base + profile.data.avatar_url)).status, 200);
      assert.equal((await login()).status, 200, "Original login credentials remain valid after profile edits");
      console.log("Verified", base, "own-name edit, avatar upload, duplicate/invalid email rejection, password-update rejection, and unchanged login.");
    }
  } finally {
    await db.query("DELETE FROM users WHERE id=$1 AND email=$2", [otherId, otherEmail]);
    console.log("Temporary duplicate-email fixture removed.");
  }
}
