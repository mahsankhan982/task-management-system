import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../db/pool";

// Deploy only the additive avatar migration. Do not replay older data migrations.
async function ensureProfileSchema() {
  const filename = "015_user_profile_avatars.sql";
  const sql = await readFile(path.join(process.cwd(), "src/db/migrations", filename), "utf8");
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(179015, 15)");
    await client.query(sql);
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    await client.query("INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING", [filename]);
    await client.query("COMMIT");
    console.log("Verified avatar schema: " + filename);
    const result = await client.query("SELECT (SELECT COUNT(*) FROM boards) AS boards, (SELECT COUNT(*) FROM tasks) AS tasks");
    console.log("Production data counts:", result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

ensureProfileSchema().catch(error => {
  console.error("Profile schema deployment failed:", error.message);
  process.exitCode = 1;
}).finally(() => db.end());
