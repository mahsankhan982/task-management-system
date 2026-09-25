import assert from "node:assert/strict";
import { test } from "node:test";
import bcrypt from "bcryptjs";

test("workspace task visibility and unchanged editing permissions for all roles", async () => {
  process.env.JWT_SECRET = "isolated-due-date-test-secret";
  process.env.MAKE_WEBHOOK_URL = "";
  process.env.SLACK_WEBHOOK_URL = "";
  const { db } = await import("../src/db/pool");
  const { default: app } = await import("../src/app");
  const { canEditTaskDueDate } = await import("../src/lib/dueDateAccess");
  const originalQuery = db.query, originalConnect = db.connect;
  const password = "Isolated-test-password-2026";
  const hash = await bcrypt.hash(password, 4);
  const fixtures = ["Admin", "Manager", "Coordinator", "Team Lead", "Team Member"].map((role, index) => ({
    id: index + 1, role, full_name: "Test " + role, email: "role" + index + "@example.invalid", password_hash: hash, team_id: null, is_active: true,
  }));
  let task = { id: 99, title: "Permission test", board_id: 1, stage_id: 1, description: "", priority: "Medium", due_date: "2026-10-01", created_by: 5 };
  let writes = 0;
  let assignedToMember = false;
  const query = async (sql: string, values: unknown[] = []) => {
    if (sql.includes("password_hash") && sql.includes("FROM users")) return { rows: fixtures.filter(user => user.email === values[0]) };
    if (sql.includes("FROM users WHERE id")) return { rows: fixtures.filter(user => user.id === Number(values[0])) };

    if (sql.includes("FROM tasks t") && sql.includes("ORDER BY t.created_at")) {
      assert.equal(values.length, 0, "Task list is not scoped to current user");
      assert.doesNotMatch(sql, /visible\.user_id|EXISTS/);
      return { rows: fixtures.map(u => ({ ...task, id: 100 + u.id, created_by: u.id, assignees: [] })) };
    }
    if (sql.includes("FROM tasks t") && sql.includes("WHERE t.id = $1") && !sql.includes("FOR UPDATE")) {
      assert.equal(values.length, 1);
      return { rows: [{ ...task, id: Number(values[0]), created_by: 1 }] };
    }
    if (sql.includes("FROM tasks t") && sql.includes("FOR UPDATE")) return { rows: [{ ...task }] };
    if (sql.includes("SELECT 1 FROM task_assignees")) return { rows: assignedToMember ? [{ exists: 1 }] : [] };
    if (sql.includes("FROM workflow_stages WHERE board_id=$1 AND id=$2")) return { rows: Number(values[1]) === 4 ? [{ id: 4, name: "For Posting" }] : [] };
    if (sql.includes("SELECT name FROM workflow_stages")) return { rows: [{ name: "To Do" }] };
    if (sql.includes("SELECT id, name") && sql.includes("FROM workflow_stages")) return { rows: [{ id: 4, name: "For Posting" }] };
    if (sql.includes("SELECT id FROM boards")) return { rows: [{ id: 1 }] };
    if (sql.startsWith("INSERT INTO workflow_stages")) return { rows: [{ id: 8, name: values[1] }] };
    if (sql.startsWith("SELECT id,") && sql.includes("FROM workflow_stages")) return { rows: [{ id: 8, is_system: false, is_archived: false }] };
    if (sql.startsWith("UPDATE workflow_stages SET name")) return { rows: [{ id: 8, name: values[0] }] };
    if (sql.startsWith("SELECT COUNT(*)")) return { rows: [{ count: 0 }] };
    if (sql.includes("UPDATE tasks") && sql.includes("SET stage_id =")) return { rows: [{ ...task, stage_id: values[0] }] };
    if (sql.startsWith("SELECT created_by FROM tasks")) return { rows: [{ created_by: Number(values[0]) === 100 ? 1 : task.created_by }] };
    if (sql.includes("FROM tasks WHERE id = $1 FOR UPDATE")) return { rows: [{ ...task }] };
    if (sql.startsWith("UPDATE tasks SET")) {
      writes++;
      task = { ...task, title: values[0] == null ? task.title : String(values[0]), due_date: values[3] ? values[4] as string : task.due_date };
      return { rows: [{ ...task }] };
    }
    return { rows: [] };
  };
  db.query = query as typeof db.query;
  db.connect = (async () => ({ query, release() {} })) as unknown as typeof db.connect;
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + (server.address() as { port: number }).port;
  try {
    for (const user of fixtures) {
      const login = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, password }) });
      assert.equal(login.status, 200, user.role + " login");
      const session = await login.json() as { token: string; user: { role: string } };
      assert.equal(session.user.role, user.role);
      const patch = (body: unknown) => fetch(base + "/api/tasks/99", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.token }, body: JSON.stringify(body) });
      const request = (path: string, method: string, body?: unknown) => fetch(base + path, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.token }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const member = user.role === "Team Member";
      assert.equal((await request("/api/workflow", "POST", { board_id: 1, name: "Custom List" })).status, member ? 403 : 201, user.role + " create list");
      assert.equal((await request("/api/workflow/8", "PATCH", { name: "Rename" })).status, member ? 403 : 200, user.role + " rename list");
      assert.equal((await request("/api/workflow/8", "DELETE")).status, member ? 403 : 200, user.role + " delete list");
      assert.equal((await patch({ stage_id: 4 })).status, member ? 403 : 200, user.role + " stage move");
      assert.equal((await patch({ board_id: 2 })).status, member ? 403 : 200, user.role + " board move");
      assert.equal((await request("/api/tasks/99/status", "PATCH", { stage_name: "For Posting" })).status, 200, user.role + " status endpoint");
      const listed = await request("/api/tasks", "GET");
      assert.equal(listed.status, 200);
      const data = await listed.json() as { data: { created_by: number }[] };
      assert.deepEqual(data.data.map(t => t.created_by), fixtures.map(u => u.id), user.role + " sees tasks from every creator role");
      {
        for (const path of ["/api/tasks/100", "/api/comments/task/100", "/api/checklist/task/100", "/api/activity/task/100", "/api/attachments?task_id=100", "/api/Comments/task/%31%30%30"]) {
          assert.equal((await request(path, "GET")).status, 200, "Unassigned task visible: " + path);
        }
      }
      const before = writes;
      const response = await patch({ due_date: "2026-10-20" });
      assert.equal(response.status, user.role === "Team Member" ? 403 : 200, user.role + " due date update");
      const cleared = await patch({ due_date: null });
      assert.equal(cleared.status, user.role === "Team Member" ? 403 : 200, user.role + " due date removal");
      if (user.role === "Team Member") {
        assert.equal(writes, before);
        assert.equal((await request("/api/tasks/100", "PATCH", { title: "Forbidden edit" })).status, 403, "Viewing another user task does not grant editing rights");
        assert.equal((await patch({ title: "Owned task rename" })).status, 200, "Other owned-task edits remain allowed");
      }
    }
    const memberLogin = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: fixtures[4].email, password }) });
    const memberSession = await memberLogin.json() as { token: string };
    const move = (body: unknown) => fetch(base + "/api/tasks/99/status", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer " + memberSession.token }, body: JSON.stringify(body) });
    task.created_by = 1;
    assert.equal((await move({ stage_id: 4 })).status, 403, "Unassigned non-creator cannot move");
    assignedToMember = true;
    assert.equal((await move({ stage_id: 4 })).status, 200, "Assigned member can move to For Posting");
    assert.equal((await move({ stage_id: 12345 })).status, 400, "Foreign-board or missing stage rejected");
    assert.equal((await move({ stage_id: 4, due_date: "2027-01-01" })).status, 400, "Movement does not grant due-date edits");
    assert.equal((await move({ stage_id: -1 })).status, 400);
    assert.equal(canEditTaskDueDate("unknown"), false);
    assert.equal((await fetch(base + "/api/tasks/99", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ due_date: null }) })).status, 401);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.query = originalQuery; db.connect = originalConnect;
    await db.end();
  }
});
