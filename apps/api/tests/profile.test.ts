import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import sharp from "sharp";

test("authenticated profile upload validation and ownership", async () => {
  process.env.JWT_SECRET = "profile-route-test-secret-not-for-production";
  const { db } = await import("../src/db/pool");
  const { default: profile } = await import("../src/routes/profile");
  const { normalizeProfileImage } = await import("../src/lib/profileImage");
  const originalQuery = db.query;
  const originalConnect = db.connect;
  let saved: { userId: number; avatarUrl: string; imageId?: string; bytes?: Buffer } | undefined;
  let writes = 0;
  const fakeQuery = async (sql: string, values: unknown[] = []) => {
    if (sql.startsWith("SELECT id, email")) return { rows: [{ id: 7, email: "test@example.invalid", role: "Team Member", team_id: 1, is_active: true }] };
    if (sql.startsWith("UPDATE users")) {
      writes++;
      saved = { userId: Number(values[1]), avatarUrl: String(values[0]) };
      return { rows: [{ id: saved.userId, avatar_url: saved.avatarUrl }] };
    }
    if (sql.startsWith("INSERT INTO user_profile_images")) {
      assert.equal(values[0], 7);
      saved!.imageId = String(values[1]); saved!.bytes = values[2] as Buffer;
    }
    if (sql.startsWith("SELECT file_data")) return { rows: saved?.imageId === values[0] ? [{ file_data: saved.bytes }] : [] };
    return { rows: [] };
  };
  db.query = fakeQuery as typeof db.query;
  db.connect = (async () => ({ query: fakeQuery, release() {} })) as unknown as typeof db.connect;
  const app = express();
  app.use("/api/profile", profile);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const token = jwt.sign({ id: 7 }, process.env.JWT_SECRET);
  const upload = (body: Buffer | string, type: string, authenticated = true) => fetch(`${base}/api/profile/avatar?user_id=99`, {
    method: "POST", headers: { "Content-Type": type, ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) }, body: body as unknown as BodyInit,
  });
  try {
    const png = await sharp({ create: { width: 40, height: 20, channels: 3, background: "blue" } }).png().toBuffer();
    assert.equal((await upload(png, "image/png", false)).status, 401);
    assert.equal((await upload("not an image", "image/png")).status, 400);
    assert.equal((await upload('<svg xmlns="http://www.w3.org/2000/svg"/>', "image/svg+xml")).status, 400);
    assert.equal((await upload(png, "image/jpeg")).status, 400);
    assert.equal((await upload(Buffer.alloc(5 * 1024 * 1024 + 1), "image/png")).status, 413);
    assert.equal(writes, 0);
    for (const format of ["jpeg", "png", "webp"] as const) {
      const bytes = await sharp(png).toFormat(format).toBuffer();
      const response = await upload(bytes, `image/${format}`);
      assert.equal(response.status, 200);
      const data = await response.json() as { data: { avatar_url: string } };
      assert.equal(saved!.userId, 7, "query-string user ID must never override authenticated ID");
      const image = await fetch(base + data.data.avatar_url);
      assert.equal(image.status, 200);
      assert.equal(image.headers.get("content-type"), "image/webp");
      const meta = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
      assert.equal(meta.width, 256); assert.equal(meta.height, 256);
      assert.equal(meta.exif, undefined);
    }
    await assert.rejects(normalizeProfileImage(Buffer.alloc(0), "image/png"));
    assert.equal((await fetch(base + "/api/profile/avatars/not-a-file.webp")).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.query = originalQuery; db.connect = originalConnect;
    await db.end();
  }
});
