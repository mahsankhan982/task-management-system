import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

test("own profile edits, rejected password updates and email verification lifecycle", async () => {
  process.env.JWT_SECRET = "isolated-profile-settings-test";
  const { db } = await import("../src/db/pool");
  const { createProfileSettingsRouter } = await import("../src/routes/profile-settings");
  const originalQuery = db.query, originalConnect = db.connect;
  const user = { id: 7, full_name: "Original", email: "old@example.invalid", role: "Team Member", is_active: true, team_id: null, password_hash: await bcrypt.hash("original-password", 4) };
  let link = "";
  let deliveryFails = false;
  const query = async (sql: string, args: unknown[] = []) => {
    if (sql.includes("LOWER(email)")) return { rows: args[0] === "taken@example.invalid" ? [{ id: 99 }] : [] };
    if (sql.startsWith("SELECT") && sql.includes("FROM users")) return { rows: Number(args[0]) === 7 ? [{ ...user }] : [] };
    if (sql.startsWith("UPDATE users SET full_name")) {
      assert.equal(args[1], 7);
      if (args[0]) user.full_name = String(args[0]);
      assert.doesNotMatch(sql, /password_hash/);
      return { rows: [{ ...user }] };
    }
    if (sql.startsWith("UPDATE users SET email")) { assert.equal(args[1], 7); user.email = String(args[0]); return { rows: [{ ...user }] }; }
    return { rows: [] };
  };
  db.query = query as typeof db.query;
  db.connect = (async () => ({ query, release() {} })) as unknown as typeof db.connect;
  const app = express();
  app.use(createProfileSettingsRouter(async (_email, url) => { if (deliveryFails) throw new Error("offline"); link = url; }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + (server.address() as { port: number }).port;
  const auth = jwt.sign({ id: 7 }, process.env.JWT_SECRET);
  const request = (path: string, body: unknown, token = auth) => fetch(base + path, { method: path === "/me" ? "PATCH" : "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify(body) });
  try {
    assert.equal((await request("/me", { full_name: "No auth" }, "bad")).status, 401);
    assert.equal((await request("/me", { full_name: "Intruder", id: 99 })).status, 400);
    assert.equal((await request("/me", { role: "Admin" })).status, 400);
    assert.equal((await request("/me", { full_name: "My Name" })).status, 200);
    assert.equal(user.full_name, "My Name");
    assert.equal((await request("/email/request", { email: "not-an-email" })).status, 400);
    assert.equal((await request("/email/request", { email: "new@example.invalid", id: 99 })).status, 400);
    assert.equal((await request("/me", { current_password: "wrong", new_password: "new-password" })).status, 400);
    assert.equal((await request("/email/request", { email: "taken@example.invalid" })).status, 409);
    assert.equal((await request("/email/request", { email: "new@example.invalid" })).status, 200);
    assert.equal(user.email, "old@example.invalid", "request does not change current email");
    const proof = new URLSearchParams(new URL(link).hash.slice(1)).get("verify");
    assert.equal((await request("/me", { full_name: "Token misuse" }, proof!)).status, 401, "verification token cannot authenticate");
    assert.equal((await request("/email/verify", { token: "bad" })).status, 400);
    assert.equal((await request("/email/verify", { token: proof })).status, 200);
    assert.equal(user.email, "new@example.invalid");
    assert.equal((await request("/email/verify", { token: proof })).status, 400, "cannot replay");
    assert.equal((await request("/me", { current_password: "original-password", new_password: "new-password" })).status, 400);
    assert.equal(await bcrypt.compare("original-password", user.password_hash), true, "Profile edits cannot change login credentials");
    deliveryFails = true;
    assert.equal((await request("/email/request", { email: "later@example.invalid" })).status, 503);
    assert.equal(user.email, "new@example.invalid");
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    db.query = originalQuery; db.connect = originalConnect; await db.end();
  }
});
