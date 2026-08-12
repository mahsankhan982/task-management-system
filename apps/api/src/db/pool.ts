import { Pool } from "pg";
import { env } from "../config/env";

export const db = new Pool({
  host: env.INSTANCE_UNIX_SOCKET || env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export async function checkDatabaseConnection() {
  const result = await db.query("SELECT NOW() AS now");
  return result.rows[0];
}
