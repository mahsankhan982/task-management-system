import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../db/pool";

export async function verifyTaskMoves(boardId: number, creatorId: number, creatorEmail: string, password: string) {
  const email = `workflow-check-${randomUUID()}@example.invalid`;
  const member = await db.query("INSERT INTO users (full_name,email,password_hash,role,is_active) SELECT 'Temporary workflow verifier',$1,password_hash,'Team Member',TRUE FROM users WHERE id=$2 RETURNING id", [email, creatorId]);
  const memberId = member.rows[0].id;
  let taskId: number | undefined;
  try {
    const stages = await db.query("SELECT id,name FROM workflow_stages WHERE board_id=$1 AND is_archived=FALSE", [boardId]);
    const core = ["To Do", "In Progress", "Waiting for Review", "For Posting", "Completed"].map(name => {
      const stage = stages.rows.find(row => row.name === name);
      assert.ok(stage, name + " exists"); return stage;
    });
    assert.equal(stages.rows.filter(row => row.name === "For Posting").length, 1);
    const created = await db.query("INSERT INTO tasks (board_id,stage_id,title,priority,created_by) VALUES ($1,$2,'Temporary workflow verification','Medium',$3) RETURNING id", [boardId, core[0].id, creatorId]);
    taskId = Number(created.rows[0].id);
    await db.query("UPDATE users SET role='Team Member' WHERE id=$1", [creatorId]);
    for (const origin of ["https://task-management-api-lyart.vercel.app", "https://web-two-peach-98.vercel.app"]) {
      const login = async (address: string) => {
        const response = await fetch(origin + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: address, password }) });
        assert.equal(response.status, 200);
        return (await response.json() as { token: string }).token;
      };
      const creatorToken = await login(creatorEmail), memberToken = await login(email);
      const move = (token: string, body: unknown) => fetch(origin + `/api/tasks/${taskId}/status`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
      assert.equal((await move(creatorToken, { stage_id: core[0].id })).status, 200, "Team Member creator can move");
      assert.equal((await move(memberToken, { stage_id: core[1].id })).status, 403, "Unassigned member remains view-only");
      await db.query("INSERT INTO task_assignees (task_id,user_id,assigned_by) VALUES ($1,$2,$3)", [taskId, memberId, creatorId]);
      for (const stage of core) {
        assert.equal((await move(memberToken, { stage_id: stage.id })).status, 200, stage.name);
        const persisted: { rows: Array<{ stage_id: number | string }> } = await db.query("SELECT stage_id FROM tasks WHERE id=$1", [taskId]);
        assert.equal(Number(persisted.rows[0].stage_id), Number(stage.id), "Stage persists in database");
      }
      assert.equal((await move(memberToken, { stage_id: core[0].id, due_date: "2027-01-01" })).status, 400);
      assert.equal((await move(memberToken, { stage_id: 2147483647 })).status, 400);
      await db.query("DELETE FROM task_assignees WHERE task_id=$1 AND user_id=$2", [taskId, memberId]);
      assert.equal((await move(memberToken, { stage_id: core[0].id })).status, 403, "Revoked assignment removes movement access");
      console.log("Verified", origin, "creator/assigned movement through all five stages, database persistence, denied unassigned movement and unchanged field restrictions.");
    }
  } finally {
    if (taskId !== undefined) await db.query("DELETE FROM tasks WHERE id=$1 AND board_id=$2", [taskId, boardId]);
    await db.query("DELETE FROM users WHERE id=$1 AND email=$2", [memberId, email]);
    await db.query("UPDATE users SET role='Manager' WHERE id=$1 AND email=$2", [creatorId, creatorEmail]);
    console.log("Temporary workflow fixtures removed.");
  }
}
