import type { PoolClient } from "pg";
import { db } from "../db/pool";
import type { AuthUser } from "../middleware/auth";

/**
 * Team Members own the tasks they create: they may add tasks, assign them to
 * anyone, and edit their own tasks. Tasks raised by somebody else stay
 * read-only for them (apart from the assigned-task status flow, comments and
 * attachments, which are handled by their own routes).
 */
export const TASK_OWNERSHIP_MESSAGE =
  "You can only edit tasks you created. This task was created by someone else.";

export type TaskEditAccess = "allowed" | "not_found" | "forbidden";

type Queryable = Pick<PoolClient, "query">;

function toTaskId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Decides whether `user` may change the given task. Everyone above Team Member
 * keeps full access; a Team Member only passes on tasks they created.
 */
export async function checkTaskEditAccess(
  user: AuthUser,
  taskId: unknown,
  client: Queryable = db,
): Promise<TaskEditAccess> {
  const id = toTaskId(taskId);

  if (id === null) {
    return "not_found";
  }

  const result = await client.query(
    "SELECT created_by FROM tasks WHERE id = $1 LIMIT 1",
    [id],
  );

  const task = result.rows[0];

  if (!task) {
    return "not_found";
  }

  if (user.role !== "Team Member") {
    return "allowed";
  }

  return Number(task.created_by) === Number(user.id) ? "allowed" : "forbidden";
}

/**
 * Same check as `checkTaskEditAccess`, but resolved from a checklist item so
 * checklist writes follow the ownership of the task they belong to.
 */
export async function checkChecklistEditAccess(
  user: AuthUser,
  checklistItemId: unknown,
  client: Queryable = db,
): Promise<TaskEditAccess> {
  const id = Number(checklistItemId);

  if (!Number.isInteger(id) || id <= 0) {
    return "not_found";
  }

  const result = await client.query(
    "SELECT task_id FROM checklist_items WHERE id = $1 LIMIT 1",
    [id],
  );

  const item = result.rows[0];

  if (!item) {
    return "not_found";
  }

  return checkTaskEditAccess(user, item.task_id, client);
}
