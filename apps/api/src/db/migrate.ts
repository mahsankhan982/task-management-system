import fs from "node:fs/promises";
import path from "node:path";
import { db } from "./pool";

async function migrate() {
  const migrationsDir = path.join(__dirname, "migrations");
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const appliedResult = await db.query("SELECT filename FROM schema_migrations");
  const applied = new Set<string>(appliedResult.rows.map((row) => row.filename));

  if (applied.size === 0 && files.includes("001_initial_schema.sql")) {
    const legacy = await db.query(
      "SELECT to_regclass('public.teams') AS teams, to_regclass('public.workflow_stages') AS workflow"
    );
    if (legacy.rows[0]?.teams && legacy.rows[0]?.workflow) {
      await db.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
        ["001_initial_schema.sql"]
      );
      applied.add("001_initial_schema.sql");
      console.log("Baseline migration recorded: 001_initial_schema.sql");
    }
  }

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Skipping migration: ${file}`);
      continue;
    }

    console.log(`Running migration: ${file}`);
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    const client = await db.connect();

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [file]
      );
      await client.query("COMMIT");
      console.log(`Completed migration: ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  console.log("All database migrations completed successfully.");
}

migrate()
  .catch((error) => {
    console.error("Database migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
