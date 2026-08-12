import fs from "node:fs/promises";
import path from "node:path";
import { db } from "./pool";

async function migrate() {
  const migrationsDir = path.join(__dirname, "migrations");
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    console.log(`Running migration: ${file}`);
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    await db.query(sql);
    console.log(`Completed migration: ${file}`);
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
