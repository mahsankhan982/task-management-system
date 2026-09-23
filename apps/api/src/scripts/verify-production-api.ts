import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../db/pool";

// Explicit opt-in: creates a temporary least-privilege account, then removes it.
async function verify() {
  if (process.env.VERIFY_PRODUCTION_API !== "1") return;
  const email = `deployment-check-${randomUUID()}@example.invalid`;
  const password = randomUUID() + randomUUID();
  let id: number | undefined;
  try {
    const result = await db.query(
      "INSERT INTO users (full_name,email,password_hash,role,is_active) VALUES ($1,$2,$3,'Team Member',TRUE) RETURNING id",
      ["Temporary deployment verification", email, await bcrypt.hash(password, 12)],
    );
    id = Number(result.rows[0].id);
    for (const base of ["https://task-management-api-lyart.vercel.app", "https://web-two-peach-98.vercel.app"]) {
      const login = await fetch(base + "/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(30000),
      });
      assert.equal(login.status, 200, base + " login");
      const session = await login.json() as { token: string };
      assert.equal(typeof session.token, "string");
      for (const route of ["/auth/me", "/boards", "/tasks", "/workflow", "/teams", "/users"]) {
        const response = await fetch(base + "/api" + route, {
          headers: { Authorization: `Bearer ${session.token}` }, signal: AbortSignal.timeout(30000),
        });
        assert.equal(response.status, 200, base + route);
        const payload = await response.json() as { success: boolean; data: unknown };
        assert.equal(payload.success, true);
        console.log("Verified", base, route, Array.isArray(payload.data) ? `records=${payload.data.length}` : "authenticated");
      }
    }
  } finally {
    if (id !== undefined) {
      await db.query("DELETE FROM users WHERE id=$1 AND email=$2", [id, email]);
      console.log("Temporary verification account removed.");
    }
  }
}

verify().catch(error => { console.error("Production API verification failed:", error.message); process.exitCode = 1; }).finally(() => db.end());
