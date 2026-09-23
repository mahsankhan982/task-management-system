import type { PoolClient } from "pg";

/** Caller holds the board row lock. Keep the permanent stage ID and task links. */
export async function ensureForPosting(client: Pick<PoolClient, "query">, boardId: number, actorId: number | null = null) {
  const existing = await client.query(
    "SELECT * FROM workflow_stages WHERE board_id=$1 AND LOWER(TRIM(name))='for posting' ORDER BY id LIMIT 1",
    [boardId],
  );
  if (existing.rows[0]) {
    const result = await client.query(
      "UPDATE workflow_stages SET name='For Posting', is_system=TRUE, is_archived=FALSE WHERE id=$1 RETURNING *",
      [existing.rows[0].id],
    );
    return { stage: result.rows[0], created: false };
  }
  const result = await client.query(
    `INSERT INTO workflow_stages (board_id,name,position,created_by,is_system)
     SELECT $1,'For Posting',COALESCE(MAX(position),0)+1,$2,TRUE FROM workflow_stages WHERE board_id=$1 RETURNING *`,
    [boardId, actorId],
  );
  return { stage: result.rows[0], created: true };
}
