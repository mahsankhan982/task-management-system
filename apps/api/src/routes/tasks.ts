import { Router, type Request, type Response } from "express";
import { db } from "../db/pool";
import { getBoardName, notifyMake } from '../lib/notifyMake';
import { TASK_OWNERSHIP_MESSAGE, checkTaskEditAccess } from "../lib/taskAccess";
import { notifyAssignedUser, notifyTaskCreator } from "../lib/taskNotifications";

const router = Router();
const allowedPriorities = ["Critical", "High", "Medium", "Low"];
// Boards created before the 008 rename still label the review column "Review"
// or "Waiting for Lead", so every review check accepts all three names.
const reviewStageNames = ["Waiting for Review", "Review", "Waiting for Lead"];

/**
 * Blocks the request when the caller may not change this task and answers with
 * the reason. Returns true when the handler should stop.
 */
async function refuseTaskEdit(req: Request, res: Response, taskId: unknown) {
  const access = await checkTaskEditAccess(req.user!, taskId);

  if (access === "not_found") {
    res.status(404).json({ success: false, message: "Task not found" });
    return true;
  }

  if (access === "forbidden") {
    res.status(403).json({ success: false, message: TASK_OWNERSHIP_MESSAGE });
    return true;
  }

  return false;
}

router.get("/", async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT
         t.*,
         b.name AS board_name,
         w.name AS stage_name,
         cb.full_name AS created_by_name,
         COALESCE(
           (
             SELECT json_agg(
               json_build_object(
                 'id', u.id,
                 'full_name', u.full_name,
                 'email', u.email,
                 'role', u.role
               )
               ORDER BY u.full_name
             )
             FROM task_assignees ta
             JOIN users u ON u.id = ta.user_id
             WHERE ta.task_id = t.id
           ),
           '[]'::json
         ) AS assignees
       FROM tasks t
       JOIN boards b ON b.id = t.board_id
       JOIN workflow_stages w ON w.id = t.stage_id
       LEFT JOIN users cb ON cb.id = t.created_by
       ORDER BY t.created_at DESC`
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get tasks failed:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch tasks" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const taskResult = await db.query(
      "SELECT t.*, b.name AS board_name, w.name AS stage_name, cb.full_name AS created_by_name FROM tasks t JOIN boards b ON b.id = t.board_id JOIN workflow_stages w ON w.id = t.stage_id LEFT JOIN users cb ON cb.id = t.created_by WHERE t.id = $1",
      [req.params.id]
    );

    if (!taskResult.rows[0]) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    const [assignees, checklist, comments, labels, activity] = await Promise.all([
      db.query(
  `
  SELECT
    u.id,
    u.full_name,
    u.email,
    u.role,
    u.team_id,
    ab.id AS assigned_by_id,
    ab.full_name AS assigned_by_name
  FROM task_assignees ta
  JOIN users u ON u.id = ta.user_id
  LEFT JOIN users ab ON ab.id = ta.assigned_by
  WHERE ta.task_id = $1
  ORDER BY u.full_name
  `,
  [req.params.id]
),
      db.query("SELECT * FROM checklist_items WHERE task_id = $1 ORDER BY position, id", [req.params.id]),
      db.query("SELECT c.*, u.full_name AS user_name FROM comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.task_id = $1 ORDER BY c.created_at", [req.params.id]),
      db.query("SELECT l.* FROM task_labels tl JOIN labels l ON l.id = tl.label_id WHERE tl.task_id = $1 ORDER BY l.name", [req.params.id]),
      db.query("SELECT a.*, u.full_name AS user_name FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id WHERE a.task_id = $1 ORDER BY a.created_at DESC", [req.params.id])
    ]);

    return res.status(200).json({
      success: true,
      data: {
        ...taskResult.rows[0],
        assignees: assignees.rows,
        checklist: checklist.rows,
        comments: comments.rows,
        labels: labels.rows,
        activity: activity.rows
      }
    });
  } catch (error) {
    console.error("Get task failed:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch task" });
  }
});

router.post("/", async (req, res) => {
  const client = await db.connect();
  try {
    const { board_id, stage_id, title, description, priority, due_date, assignee_ids } = req.body;

    if (!board_id || !stage_id || !title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ success: false, message: "Board, stage and title are required" });
    }

    const taskPriority = priority ?? "Medium";
    if (!allowedPriorities.includes(taskPriority)) {
      return res.status(400).json({ success: false, message: "Invalid priority" });
    }

    await client.query("BEGIN");

    // Completed is a Team Lead / Manager / Coordinator decision, so a Team
    // Member cannot drop a brand new task straight into it either.
    if (req.user!.role === "Team Member") {
      const targetStage = await client.query(
        "SELECT name FROM workflow_stages WHERE id = $1 LIMIT 1",
        [stage_id],
      );

      if (targetStage.rows[0]?.name === "Completed") {
        await client.query("ROLLBACK");
        return res.status(403).json({
          success: false,
          message: "Only a Team Lead, Manager or Coordinator can put a task in Completed",
        });
      }
    }

    const result = await client.query(
      "INSERT INTO tasks (board_id, stage_id, title, description, priority, due_date, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [board_id, stage_id, title.trim(), description ?? null, taskPriority, due_date ?? null, req.user!.id]
    );

    const task = result.rows[0];

    if (Array.isArray(assignee_ids)) {
      const ids = [...new Set(assignee_ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0))];
      for (const userId of ids) {
        await client.query(
          "INSERT INTO task_assignees (task_id, user_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
          [task.id, userId, req.user!.id]
        );

        if (userId !== req.user!.id) {
          await notifyAssignedUser(
            {
              taskId: task.id,
              taskTitle: task.title,
              userId,
              actorId: req.user!.id,
            },
            client,
          );
        }
      }
    }

    await client.query(
      "INSERT INTO activity_logs (task_id, user_id, action, details) VALUES ($1,$2,$3,$4::jsonb)",
      [task.id, req.user!.id, "task_created", JSON.stringify({ title: task.title, description: task.description, priority: task.priority, due_date: task.due_date })]
    );

    await client.query("COMMIT");


    void getBoardName(task.board_id).then((boardName) =>
      notifyMake(
        'task_created',
        { id: task.id, title: task.title, board_id: task.board_id, board_name: boardName },
        req.user!.id,
        {
          priority: task.priority,
          due_date: task.due_date,
          description: task.description,
        },
      ),
    );
    return res.status(201).json({ success: true, data: task });
  } catch (error: any) {
    await client.query("ROLLBACK");
    if (error?.code === "23503") {
      return res.status(400).json({ success: false, message: "Invalid board, stage or assignee" });
    }
    console.error("Create task failed:", error);
    return res.status(500).json({ success: false, message: "Unable to create task" });
  } finally {
    client.release();
  }
});

router.patch("/:id/status", async (req, res) => {
  const client = await db.connect();

  try {
    if (req.user?.role !== "Team Member") {
      return res.status(403).json({
        success: false,
        message: "This status action is for assigned Team Members",
      });
    }

    const { stage_name } = req.body;

    if (!["To Do", "In Progress", "Waiting for Review"].includes(stage_name)) {
      return res.status(400).json({
        success: false,
        message: "Team Members can only move assigned tasks through To Do, In Progress and Waiting for Review. Only a Team Lead, Manager or Coordinator can move a task to Completed",
      });
    }

    await client.query("BEGIN");

    const taskResult = await client.query(
      `SELECT t.id, t.board_id, t.stage_id, t.title, t.updated_at, t.created_by
       FROM tasks t
       JOIN task_assignees ta ON ta.task_id = t.id
       WHERE t.id = $1 AND ta.user_id = $2
       LIMIT 1
       FOR UPDATE OF t`,
      [req.params.id, req.user.id],
    );

    const task = taskResult.rows[0];

    if (!task) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        message: "You can only update tasks assigned to you",
      });
    }

    const currentStageResult = await client.query(
      "SELECT name FROM workflow_stages WHERE id = $1 LIMIT 1",
      [task.stage_id],
    );
    const currentStageName = currentStageResult.rows[0]?.name ?? "";

    // Assignees walk the flow forward one stage at a time and may send a task
    // back to any earlier stage. Completing a task is reserved for Team Leads,
    // Managers and Coordinators, so the flow stops at Waiting for Review.
    const allowedTransitions: Record<string, string[]> = {
      "To Do": ["In Progress"],
      "In Progress": ["To Do", "Waiting for Review"],
      "Review": ["To Do", "In Progress"],
      "Waiting for Lead": ["To Do", "In Progress"],
      "Waiting for Review": ["To Do", "In Progress"],
    };

    const allowedNextStages = allowedTransitions[currentStageName] ?? [];

    if (!allowedNextStages.includes(stage_name)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Task must follow: To Do -> In Progress -> Waiting for Review, and can move back to any earlier stage. A Team Lead, Manager or Coordinator marks it Completed",
      });
    }

    const stageLookupNames = stage_name === "Waiting for Review" ? reviewStageNames : [stage_name];

    const stageResult = await client.query(
      `SELECT id, name
       FROM workflow_stages
       WHERE board_id = $1 AND name = ANY($2::text[])
       ORDER BY CASE WHEN name = $3 THEN 0 ELSE 1 END
       LIMIT 1`,
      [task.board_id, stageLookupNames, stage_name],
    );

    const stage = stageResult.rows[0];

    if (!stage) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: `The ${stage_name} stage is not available on this board`,
      });
    }

    const updated = await client.query(
      `UPDATE tasks
       SET stage_id = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [stage.id, task.id],
    );

    await client.query(
      `INSERT INTO activity_logs (task_id, user_id, action, details)
       VALUES ($1,$2,$3,$4::jsonb)`,
      [
        task.id,
        req.user.id,
        "task_status_updated_by_assignee",
        JSON.stringify({ stage_name, previous_stage_name: currentStageName }),
      ],
    );

    // Whoever raised the task hears about the move. Entering and leaving review
    // get their own wording because those are the ones that need an answer.
    if (stage_name === "Waiting for Review") {
      await notifyTaskCreator(
        {
          task,
          actorId: req.user.id,
          type: "task_review_required",
          title: "Task waiting for review",
          message: `{actor} moved "${task.title}" to Waiting for Review, so it is waiting for your review.`,
        },
        client,
      );
    } else if (reviewStageNames.includes(currentStageName)) {
      // The assignee pulled the task back out of review, so the reviewer should
      // know the pending review request no longer applies.
      await notifyTaskCreator(
        {
          task,
          actorId: req.user.id,
          type: "task_review_withdrawn",
          title: "Task moved back from review",
          message: `{actor} moved "${task.title}" back to ${stage_name}, so it is no longer waiting for your review.`,
        },
        client,
      );
    } else {
      await notifyTaskCreator(
        {
          task,
          actorId: req.user.id,
          type: "task_stage_changed",
          title: "Task moved to a new stage",
          message: `{actor} moved "${task.title}" from ${currentStageName || "another stage"} to ${stage_name}.`,
        },
        client,
      );
    }

    await client.query("COMMIT");


    void getBoardName(task.board_id).then((boardName) =>
      notifyMake(
        'task_moved',
        { id: task.id, title: task.title, board_id: task.board_id, board_name: boardName },
        req.user!.id,
        {
          previous_stage_id: task.stage_id,
          stage_id: stage.id,
          stage_name: stage.name,
        },
      ),
    );

    return res.status(200).json({
      success: true,
      data: {
        ...updated.rows[0],
        stage_name: stage.name,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update assigned task status failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update task status",
    });
  } finally {
    client.release();
  }
});

router.put("/:id/assignees", async (req, res) => {
  if (await refuseTaskEdit(req, res, req.params.id)) return;

  const client = await db.connect();
  try {
    const { assignee_ids } = req.body;
    if (!Array.isArray(assignee_ids)) {
      return res.status(400).json({ success: false, message: "assignee_ids must be an array" });
    }

    const ids = [...new Set(assignee_ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0))];
    await client.query("BEGIN");

    const task = await client.query(
      "SELECT id, title, board_id, due_date, created_by FROM tasks WHERE id = $1",
      [req.params.id],
    );
    if (!task.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    const previousAssignees = await client.query(
      "SELECT user_id FROM task_assignees WHERE task_id = $1",
      [req.params.id]
    );
    const previousIds = new Set<number>(
      previousAssignees.rows.map((row) => Number(row.user_id))
    );


    const addedIds = ids.filter((userId) => !previousIds.has(userId));
    const removedIds = [...previousIds].filter((userId) => !ids.includes(userId));

    // One lookup covers both the activity log and the notification wording.
    const memberNames = await client.query(
      "SELECT id, full_name FROM users WHERE id = ANY($1::bigint[])",
      [[...new Set([...previousIds, ...ids])]],
    );
    const nameById = new Map<number, string>(
      memberNames.rows.map((row) => [Number(row.id), String(row.full_name)]),
    );
    const namesOf = (userIds: number[]) =>
      userIds.map((userId) => nameById.get(userId) ?? `User ${userId}`);

    await client.query("DELETE FROM task_assignees WHERE task_id = $1", [req.params.id]);

    for (const userId of ids) {
      await client.query(
        "INSERT INTO task_assignees (task_id, user_id, assigned_by) VALUES ($1,$2,$3)",
        [req.params.id, userId, req.user!.id]
      );

      if (!previousIds.has(userId)) {
        await notifyAssignedUser(
          {
            taskId: req.params.id,
            taskTitle: task.rows[0].title,
            userId,
            actorId: req.user!.id,
          },
          client,
        );
      }
    }

    await client.query(
      "INSERT INTO activity_logs (task_id, user_id, action, details) VALUES ($1,$2,$3,$4::jsonb)",
      [req.params.id, req.user!.id, "task_assignees_updated", JSON.stringify({ assignee_ids: ids, assignee_names: namesOf(ids), due_date: task.rows[0].due_date })]
    );

    // The person who raised the task follows every change to who works on it.
    if (addedIds.length > 0 || removedIds.length > 0) {
      const memberChanges: string[] = [];

      if (addedIds.length > 0) {
        memberChanges.push(`added ${namesOf(addedIds).join(", ")}`);
      }

      if (removedIds.length > 0) {
        memberChanges.push(`removed ${namesOf(removedIds).join(", ")}`);
      }

      await notifyTaskCreator(
        {
          task: task.rows[0],
          actorId: req.user!.id,
          type: "task_members_changed",
          title: "Task members changed",
          message: `{actor} ${memberChanges.join(" and ")} on task "${task.rows[0].title}".`,
        },
        client,
      );
    }

    await client.query("COMMIT");

    const taskInfo = task.rows[0];
    void getBoardName(taskInfo.board_id).then(async (boardName) => {
      for (const userId of addedIds) {
        await notifyMake(
          'member_added',
          { id: taskInfo.id, title: taskInfo.title, board_id: taskInfo.board_id, board_name: boardName },
          req.user!.id,
          { member_id: userId },
        );
      }
    });

    return res.status(200).json({ success: true, assignee_ids: ids });
  } catch (error: any) {
    await client.query("ROLLBACK");
    if (error?.code === "23503") {
      return res.status(400).json({ success: false, message: "Invalid assignee" });
    }
    console.error("Update assignees failed:", error);
    return res.status(500).json({ success: false, message: "Unable to update assignees" });
  } finally {
    client.release();
  }
});

router.put("/:id/labels", async (req, res) => {
  if (await refuseTaskEdit(req, res, req.params.id)) return;

  const client = await db.connect();
  try {
    const { label_ids } = req.body;
    if (!Array.isArray(label_ids)) {
      return res.status(400).json({ success: false, message: "label_ids must be an array" });
    }

    const ids = [...new Set(label_ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0))];
    await client.query("BEGIN");

    const task = await client.query(
      "SELECT id, title, created_by FROM tasks WHERE id = $1",
      [req.params.id],
    );
    if (!task.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    const previousLabels = await client.query(
      "SELECT label_id FROM task_labels WHERE task_id = $1",
      [req.params.id],
    );
    const previousLabelIds = new Set<number>(
      previousLabels.rows.map((row) => Number(row.label_id)),
    );

    await client.query("DELETE FROM task_labels WHERE task_id = $1", [req.params.id]);
    for (const labelId of ids) {
      await client.query("INSERT INTO task_labels (task_id, label_id) VALUES ($1,$2)", [req.params.id, labelId]);
    }

    await client.query(
      "INSERT INTO activity_logs (task_id, user_id, action, details) VALUES ($1,$2,$3,$4::jsonb)",
      [req.params.id, req.user!.id, "task_labels_updated", JSON.stringify({ label_ids: ids })]
    );

    // Skip the notification when the same labels were sent back unchanged.
    const labelsChanged =
      ids.length !== previousLabelIds.size ||
      ids.some((labelId) => !previousLabelIds.has(labelId));

    if (labelsChanged) {
      const labelNames = await client.query(
        "SELECT name FROM labels WHERE id = ANY($1::bigint[]) ORDER BY name",
        [ids],
      );
      const names = labelNames.rows.map((row) => String(row.name));

      await notifyTaskCreator(
        {
          task: task.rows[0],
          actorId: req.user!.id,
          type: "task_labels_changed",
          title: "Task labels changed",
          message: names.length
            ? `{actor} set the labels on task "${task.rows[0].title}" to ${names.join(", ")}.`
            : `{actor} removed all labels from task "${task.rows[0].title}".`,
        },
        client,
      );
    }

    await client.query("COMMIT");
    return res.status(200).json({ success: true, label_ids: ids });
  } catch (error: any) {
    await client.query("ROLLBACK");
    if (error?.code === "23503") {
      return res.status(400).json({ success: false, message: "Invalid label" });
    }
    console.error("Update labels failed:", error);
    return res.status(500).json({ success: false, message: "Unable to update labels" });
  } finally {
    client.release();
  }
});

router.patch("/:id", async (req, res) => {
  if (await refuseTaskEdit(req, res, req.params.id)) return;

  const client = await db.connect();
  try {
    const { title, description, priority, due_date, stage_id, board_id } = req.body;

    if (priority && !allowedPriorities.includes(priority)) {
      return res.status(400).json({ success: false, message: "Invalid priority" });
    }

    await client.query("BEGIN");
   const previousTaskResult = await client.query(
  'SELECT id, title, board_id, stage_id, description, priority, due_date, created_by FROM tasks WHERE id = $1 FOR UPDATE',
  [req.params.id],
);
    const previousTask = previousTaskResult.rows[0];

    if (!previousTask) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    // Team Members never set a stage directly, not even on tasks they created:
    // their moves go through PATCH /:id/status, which keeps them on assigned
    // tasks and stops at Waiting for Review.
    if (
      req.user!.role === "Team Member" &&
      stage_id !== undefined &&
      stage_id !== null &&
      Number(stage_id) !== Number(previousTask.stage_id)
    ) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: "Team Members can only move tasks assigned to them, through To Do, In Progress and Waiting for Review. Only a Team Lead, Manager or Coordinator can move a task to Completed",
      });
    }

    const result = await client.query(
      "UPDATE tasks SET title=COALESCE($1,title), description=COALESCE($2,description), priority=COALESCE($3,priority), due_date=COALESCE($4,due_date), stage_id=COALESCE($5,stage_id), board_id=COALESCE($6,board_id), updated_at=NOW() WHERE id=$7 RETURNING *",
      [title ?? null, description ?? null, priority ?? null, due_date ?? null, stage_id ?? null, board_id ?? null, req.params.id]
    );

    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    const updatedTask = result.rows[0];

    await client.query(
      "INSERT INTO activity_logs (task_id, user_id, action, details) VALUES ($1,$2,$3,$4::jsonb)",
      [req.params.id, req.user!.id, "task_updated", JSON.stringify({
        title: updatedTask.title,
        description: updatedTask.description,
        priority: updatedTask.priority,
      })]
    );

    // Compare what is stored rather than what was sent: the update COALESCEs
    // every field, so a null in the request leaves that column untouched.
    const previousDueDate = previousTask.due_date ? String(previousTask.due_date).slice(0, 10) : null;
    const newDueDate = updatedTask.due_date ? String(updatedTask.due_date).slice(0, 10) : null;
    const dueDateChanged = previousDueDate !== newDueDate;

    // Log deadline changes separately so the UI can display a clear message
    if (dueDateChanged) {
      if (!previousDueDate && newDueDate) {
        await client.query(
          "INSERT INTO activity_logs (task_id, user_id, action, details) VALUES ($1,$2,$3,$4::jsonb)",
          [req.params.id, req.user!.id, "deadline_set", JSON.stringify({ current: newDueDate })]
        );
      } else if (previousDueDate && newDueDate) {
        await client.query(
          "INSERT INTO activity_logs (task_id, user_id, action, details) VALUES ($1,$2,$3,$4::jsonb)",
          [req.params.id, req.user!.id, "deadline_updated", JSON.stringify({ previous: previousDueDate, current: newDueDate })]
        );
      }
    }

    const stageChanged = Number(previousTask.stage_id) !== Number(updatedTask.stage_id);
    const boardChanged = Number(previousTask.board_id) !== Number(updatedTask.board_id);

    let previousStageName = "";
    let newStageName = "";

    if (stageChanged || boardChanged) {
      const stageNames = await client.query(
        "SELECT id, name FROM workflow_stages WHERE id = ANY($1::bigint[])",
        [[previousTask.stage_id, updatedTask.stage_id]],
      );
      const stageNameById = new Map<number, string>(
        stageNames.rows.map((row) => [Number(row.id), String(row.name)]),
      );

      previousStageName = stageNameById.get(Number(previousTask.stage_id)) ?? "";
      newStageName = stageNameById.get(Number(updatedTask.stage_id)) ?? "";
    }

    // Whoever raised the task hears about the move, with the review request
    // called out because that one is waiting on them.
    if (stageChanged && reviewStageNames.includes(newStageName)) {
      await notifyTaskCreator(
        {
          task: updatedTask,
          actorId: req.user!.id,
          type: "task_review_required",
          title: "Task waiting for review",
          message: `{actor} moved "${updatedTask.title}" to ${newStageName}, so it is waiting for your review.`,
        },
        client,
      );
    } else if (stageChanged || boardChanged) {
      const destination = boardChanged
        ? `to ${newStageName || "a new stage"} on the ${await getBoardName(updatedTask.board_id)} board`
        : `from ${previousStageName || "another stage"} to ${newStageName || "another stage"}`;

      await notifyTaskCreator(
        {
          task: updatedTask,
          actorId: req.user!.id,
          type: "task_stage_changed",
          title: "Task moved to a new stage",
          message: `{actor} moved "${updatedTask.title}" ${destination}.`,
        },
        client,
      );
    }

    // ...and about every other edit, in one notification listing the changes.
    const fieldChanges: string[] = [];

    if (previousTask.title !== updatedTask.title) {
      fieldChanges.push(`renamed it to "${updatedTask.title}"`);
    }

    if (String(previousTask.description ?? "") !== String(updatedTask.description ?? "")) {
      fieldChanges.push("updated the description");
    }

    if (previousTask.priority !== updatedTask.priority) {
      fieldChanges.push(`set the priority to ${updatedTask.priority}`);
    }

    if (dueDateChanged) {
      fieldChanges.push(newDueDate ? `set the due date to ${newDueDate}` : "cleared the due date");
    }

    if (fieldChanges.length > 0) {
      await notifyTaskCreator(
        {
          // The old title keeps a rename readable in the message.
          task: { ...updatedTask, title: previousTask.title },
          actorId: req.user!.id,
          type: "task_updated",
          title: "Task updated",
          message: `{actor} updated task "${previousTask.title}": ${fieldChanges.join(", ")}.`,
        },
        client,
      );
    }

    await client.query("COMMIT");

 void (async () => {
 try {
 const boardName = await getBoardName(updatedTask.board_id);
 const taskRef = {
 id: updatedTask.id,
 title: updatedTask.title,
 board_id: updatedTask.board_id,
 board_name: boardName,
 };

 if (description !== undefined && String(previousTask.description ?? '') !== String(updatedTask.description ?? '')) {
 void notifyMake('description_changed', taskRef, req.user!.id, {
 previous: previousTask.description,
 current: updatedTask.description,
 });
 }

 if (priority !== undefined && previousTask.priority !== updatedTask.priority) {
 void notifyMake('priority_changed', taskRef, req.user!.id, {
 previous: previousTask.priority,
 current: updatedTask.priority,
 });
 }

 if (due_date !== undefined && String(previousTask.due_date ?? '') !== String(updatedTask.due_date ?? '')) {
 void notifyMake('due_date_changed', taskRef, req.user!.id, {
 previous: previousTask.due_date,
 current: updatedTask.due_date,
 });
 }

 if (Number(previousTask.stage_id) !== Number(updatedTask.stage_id) || Number(previousTask.board_id) !== Number(updatedTask.board_id)) {
void notifyMake('task_moved', taskRef, req.user!.id, {
  previous_stage_id: previousTask.stage_id,
  stage_id: updatedTask.stage_id,
});
 const previousBoardName = await getBoardName(previousTask.board_id);
 void notifyMake(
 'task_moved',
 {
 ...taskRef,
 previous_board_id: previousTask.board_id,
 previous_board_name: previousBoardName,
 },
 req.user!.id,
 {
 previous_stage_id: previousTask.stage_id,
 stage_id: updatedTask.stage_id,
 },
 );
 }
 } catch (makeError) {
 console.error('Task Make notification failed:', makeError);
 }
 })();

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    await client.query("ROLLBACK");
    if (error?.code === "23503") {
      return res.status(400).json({ success: false, message: "Invalid board or workflow stage" });
    }
    console.error("Update task failed:", error);
    return res.status(500).json({ success: false, message: "Unable to update task" });
  } finally {
    client.release();
  }
});

router.delete("/:id", async (req, res) => {
  if (await refuseTaskEdit(req, res, req.params.id)) return;

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const task = await client.query("SELECT id, title, board_id, created_by FROM tasks WHERE id = $1", [req.params.id]);

    if (!task.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    await client.query("DELETE FROM tasks WHERE id = $1", [req.params.id]);
    await client.query(
      "INSERT INTO activity_logs (task_id, user_id, action, details) VALUES (NULL,$1,$2,$3::jsonb)",
      [req.user!.id, "task_deleted", JSON.stringify({ task_id: Number(req.params.id), title: task.rows[0].title })]
    );

    // The task is gone, so the notification carries no task link.
    await notifyTaskCreator(
      {
        task: task.rows[0],
        actorId: req.user!.id,
        type: "task_deleted",
        title: "Task deleted",
        message: `{actor} deleted the task "${task.rows[0].title}" that you created.`,
        taskGone: true,
      },
      client,
    );

    await client.query("COMMIT");
    return res.status(200).json({ success: true, message: "Task deleted" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Delete task failed:", error);
    return res.status(500).json({ success: false, message: "Unable to delete task" });
  } finally {
    client.release();
  }
});

export default router;

