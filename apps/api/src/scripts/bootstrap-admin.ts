import bcrypt from "bcryptjs";
import { db } from "../db/pool";

async function main() {
  const name = process.env.ADMIN_NAME;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!name || !email || !password) {
    throw new Error("ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD are required");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const team = await db.query(
    "INSERT INTO teams (name, description) VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id",
    ["Management", "Management Team"]
  );

  const result = await db.query(
    `INSERT INTO users (full_name, email, password_hash, role, team_id, is_active)
     VALUES ($1,$2,$3,$4,$5,TRUE)
     ON CONFLICT (email) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       team_id = EXCLUDED.team_id,
       is_active = TRUE,
       updated_at = NOW()
     RETURNING id, full_name, email, role`,
    [name, email, passwordHash, "Manager", team.rows[0].id]
  );

  console.log("Manager account ready:");
  console.log(result.rows[0]);
  await db.end();
}

main().catch(async (error) => {
  console.error("Bootstrap failed:", error);
  await db.end();
  process.exit(1);
});
