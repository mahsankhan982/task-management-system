import { Router, type Response } from "express";
import { db } from "../db/pool";
import {
  TASK_OWNERSHIP_MESSAGE,
  checkChecklistEditAccess,
  checkTaskEditAccess,
  type TaskEditAccess,
} from "../lib/taskAccess";
import {
  loadNotifiableTask,
  notifyTaskCreatorAfterWrite,
  type NotificationType,
} from "../lib/taskNotifications";

const router = Router();

/**
 * Tells the person who raised the task that their checklist changed. Checklist
 * writes are not wrapped in a transaction, so a notification problem is logged
 * rather than failing the request.
 */
async function notifyChecklistChange(
  taskId: unknown,
  actorId: number,
  type: NotificationType,
  title: string,
  describe: (taskTitle: string) => string,
) {
  try {
    const task = await loadNotifiableTask(taskId);

    if (!task) return;

    await notifyTaskCreatorAfterWrite({
      task,
      actorId,
      type,
      title,
      message: describe(task.title),
    });
  } catch (error) {
    console.error("Notify checklist change failed:", error);
  }
}

/** Sends a checklist completion notification to the person who assigned the task. */
async function notifyTaskAssigner(
  taskId: unknown,
  assigneeId: number,
  itemTitle: string,
  completed: boolean,
) {
  try {
    await db.query(
      `INSERT INTO notifications (user_id, task_id, type, title, message)
       SELECT DISTINCT
         ta.assigned_by,
         t.id,
         'task_checklist_updated',
         $4,
         actor.full_name || $5 || $3 || '" on task "' || t.title || '".'
       FROM task_assignees ta
       JOIN tasks t ON t.id = ta.task_id
       JOIN users actor ON actor.id = $2
       WHERE ta.task_id = $1
         AND ta.user_id = $2
         AND ta.assigned_by IS NOT NULL
         AND ta.assigned_by <> $2`,
      [
        taskId,
        assigneeId,
        itemTitle,
        completed ? "Checklist item completed" : "Checklist item reopened",
        completed ? ' completed "' : ' reopened "',
      ],
    );
  } catch (error) {
    console.error("Notify task assigner about checklist failed:", error);
  }
}

/**
 * Checklist items inherit the ownership of the task they hang off: a Team
 * Member may only touch the checklist of a task they created.
 */
function refuseChecklistEdit(res: Response, access: TaskEditAccess, missing: string) {
  if (access === "not_found") {
    res.status(404).json({ success: false, message: missing });
    return true;
  }

  if (access === "forbidden") {
    res.status(403).json({ success: false, message: TASK_OWNERSHIP_MESSAGE });
    return true;
  }

  return false;
}

router.get("/task/:taskId", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM checklist_items WHERE task_id = $1 ORDER BY position ASC, id ASC",
      [req.params.taskId]
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get checklist failed:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch checklist" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { task_id, title, position } = req.body;

    if (!task_id || !title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ success: false, message: "Task and title are required" });
    }

    const access = await checkTaskEditAccess(req.user!, task_id);
    if (refuseChecklistEdit(res, access, "Task not found")) return;

    const result = await db.query(
      "INSERT INTO checklist_items (task_id, title, position) VALUES ($1, $2, $3) RETURNING *",
      [task_id, title.trim(), position ?? 0]
    );

    await notifyChecklistChange(
      task_id,
      req.user!.id,
      "task_checklist_added",
      "Checklist item added",
      (taskTitle) =>
        `{actor} added "${title.trim()}" to the checklist on task "${taskTitle}".`,
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error?.code === "23503") {
      return res.status(400).json({ success: false, message: "Invalid task" });
    }

    console.error("Create checklist item failed:", error);
    return res.status(500).json({ success: false, message: "Unable to create checklist item" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { title, is_completed, position } = req.body;

    const completionOnly =
      typeof is_completed === "boolean" && title === undefined && position === undefined;
    const access = await checkChecklistEditAccess(req.user!, req.params.id);

    if (access === "not_found") {
      if (refuseChecklistEdit(res, access, "Checklist item not found")) return;
    }

    if (access === "forbidden") {
      const assignment = completionOnly
        ? await db.query(
            `SELECT 1
             FROM checklist_items ci
             JOIN task_assignees ta ON ta.task_id = ci.task_id
             WHERE ci.id = $1 AND ta.user_id = $2
             LIMIT 1`,
            [req.params.id, req.user!.id],
          )
        : { rows: [] };

      if (!assignment.rows[0]) {
        if (refuseChecklistEdit(res, access, "Checklist item not found")) return;
      }
    }

    const result = await db.query(
      "UPDATE checklist_items SET title = COALESCE($1, title), is_completed = COALESCE($2, is_completed), position = COALESCE($3, position) WHERE id = $4 RETURNING *",
      [title ?? null, is_completed ?? null, position ?? null, req.params.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: "Checklist item not found" });
    }

    const item = result.rows[0];

    // A position-only change is a drag inside the list, not news for anyone.
    if (typeof is_completed === "boolean") {
      if (req.user!.role === "Team Member") {
        await notifyTaskAssigner(
          item.task_id,
          req.user!.id,
          item.title,
          is_completed,
        );
      }

      if (req.user!.role !== "Team Member") {
        await notifyChecklistChange(
          item.task_id,
          req.user!.id,
          "task_checklist_updated",
          is_completed ? "Checklist item completed" : "Checklist item reopened",
          (taskTitle) =>
            is_completed
              ? `{actor} ticked off "${item.title}" on task "${taskTitle}".`
              : `{actor} reopened "${item.title}" on task "${taskTitle}".`,
        );
      }
    } else if (title !== undefined && title !== null) {
      await notifyChecklistChange(
        item.task_id,
        req.user!.id,
        "task_checklist_updated",
        "Checklist item updated",
        (taskTitle) =>
          `{actor} renamed a checklist item to "${item.title}" on task "${taskTitle}".`,
      );
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Update checklist failed:", error);
    return res.status(500).json({ success: false, message: "Unable to update checklist item" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const access = await checkChecklistEditAccess(req.user!, req.params.id);
    if (refuseChecklistEdit(res, access, "Checklist item not found")) return;

    const result = await db.query(
      "DELETE FROM checklist_items WHERE id = $1 RETURNING id, task_id, title",
      [req.params.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({
        success: false,
        message: "Checklist item not found",
      });
    }

    await notifyChecklistChange(
      result.rows[0].task_id,
      req.user!.id,
      "task_checklist_removed",
      "Checklist item removed",
      (taskTitle) =>
        `{actor} removed "${result.rows[0].title}" from the checklist on task "${taskTitle}".`,
    );

    return res.status(200).json({
      success: true,
      message: "Checklist item deleted",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Delete checklist failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to delete checklist item",
    });
  }
});

export default router;
