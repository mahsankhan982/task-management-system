import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { verifyTaskMoves } from "./verify-task-moves";
import { db } from "../db/pool";

/** Tests only disposable boards owned by the temporary verification account. */
export async function verifyBoardFlow(userId: number, email: string, password: string) {
  const boardIds: number[] = [];
  const suffix = randomUUID();
  const base = "https://web-two-peach-98.vercel.app/api";
  await db.query("UPDATE users SET role='Manager' WHERE id=$1 AND email=$2", [userId, email]);
  const login = await fetch(base + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  assert.equal(login.status, 200);
  const session = await login.json() as { token: string };
  const request = async (path: string, body: unknown, method = "POST") => {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    return { status: response.status, data: await response.json() as { data?: { id: number }; message?: string } };
  };
  try {
    const relations = await db.query("SELECT COUNT(*)::int AS invalid FROM boards b LEFT JOIN teams t ON t.id=b.team_id LEFT JOIN users u ON u.id=b.created_by WHERE (b.team_id IS NOT NULL AND t.id IS NULL) OR (b.created_by IS NOT NULL AND u.id IS NULL)");
    assert.equal(relations.rows[0].invalid, 0, "Board team/owner foreign keys remain valid");
    const constraints = await db.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='workflow_stages'::regclass AND contype='u'");
    console.log("Workflow uniqueness constraints:", constraints.rows.map(row => row.definition));
    for (const name of ["A", "B"]) {
      const board = await request("/boards", { name: `Deployment test ${suffix} ${name}` });
      assert.equal(board.status, 201, board.data.message ?? "Create test board");
      boardIds.push(Number(board.data.data!.id));
    }
    for (const board_id of boardIds) {
      assert.equal((await request("/workflow", { board_id, name: "Shared test list" })).status, 201, "Same name permitted on different boards");
      const duplicate = await request("/workflow", { board_id, name: "Shared test list" });
      assert.equal(duplicate.status, 409, "Duplicate blocked within its board");
      assert.match(duplicate.data.message ?? "", /name already exists/);
      for (const name of ["Second test list", "Third test list"]) {
        const created = await request("/workflow", { board_id, name });
        assert.equal(created.status, 201, "Position allocation with multiple custom and system stages");
        assert.equal((await request(`/workflow/${created.data.data!.id}`, { name: "Shared test list" }, "PATCH")).status, 409);
      }
      const posting = await Promise.all(Array.from({ length: 3 }, () => request("/workflow", { board_id, name: "For Posting" })));
      assert.ok(posting.every(result => result.status === 200));
      assert.equal(new Set(posting.map(result => result.data.data!.id)).size, 1, "Concurrent system-stage initialization reuses the same ID");
      const positions = await db.query("SELECT position FROM workflow_stages WHERE board_id=$1", [board_id]);
      assert.equal(new Set(positions.rows.map(row => row.position)).size, positions.rows.length);
    }
    if (process.env.VERIFY_TASK_MOVES === "1") await verifyTaskMoves(boardIds[0], userId, email, password);
    console.log("Verified board creation, cross-board names, same-board duplicates, rename conflicts, distinct positions, and concurrent For Posting initialization.");
  } finally {
    // A timed-out create may have committed: identify fixtures by both owner and nonce.
    await db.query("DELETE FROM boards WHERE created_by=$1 AND name LIKE $2", [userId, `Deployment test ${suffix} %`]);
    console.log("Temporary board fixtures removed.");
  }
}
