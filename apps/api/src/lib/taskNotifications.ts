import type { PoolClient } from "pg";
import { db } from "../db/pool";

type Queryable = Pick<PoolClient, "query">;

/**
 * Every in-app notification this app sends. Three things put a row in the
 * notifications table:
 *
 *  - `mention` - somebody wrote @you in a comment (see routes/comments.ts).
 *  - `task_assigned` - somebody put you on a task (see routes/tasks.ts).
 *  - everything else - activity on a task you raised, so the person who created
 *    a task sees each change other people make to it.
 *
 * The `type` column is free text, so this list is documentation rather than a
 * constraint; the web header renders any notification from its title and
 * message, which keeps new types working without a UI change.
 */
export const notificationTypes = [
  "mention",
  "task_assigned",
  "task_review_required",
  "task_review_withdrawn",
  "task_stage_changed",
  "task_updated",
  "task_comment",
  "task_comment_edited",
  "task_members_changed",
  "task_labels_changed",
  "task_attachment_added",
  "task_attachment_removed",
  "task_checklist_added",
  "task_checklist_updated",
  "task_checklist_removed",
  "task_deleted",
] as const;

export type NotificationType = (typeof notificationTypes)[number];

/** The task fields a creator notification needs. */
export type NotifiableTask = {
  id: number | string;
  title: string;
  created_by: number | string | null;
};

export type TaskActivity = {
  task: NotifiableTask;
  /** Who did it. They are never notified about their own action. */
  actorId: number;
  type: NotificationType;
  /** Heading shown in the notification list. */
  title: string;
  /** Body text. `{actor}` is replaced with the acting user's name. */
  message: string;
  /**
   * People who already got a more specific notification for this action, so
   * they do not also get the creator one. A mentioned creator, for example,
   * only needs the mention.
   */
  skipUserIds?: Array<number | string | null | undefined>;
  /**
   * Set when the task row is gone (a delete). The notification is then stored
   * without a task link instead of failing the foreign key.
   */
  taskGone?: boolean;
};

/** Loads the fields `notifyTaskCreator` needs for a task id. */
export async function loadNotifiableTask(
  taskId: unknown,
  client: Queryable = db,
): Promise<NotifiableTask | null> {
  const id = Number(taskId);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  const result = await client.query(
    "SELECT id, title, created_by FROM tasks WHERE id = $1 LIMIT 1",
    [id],
  );

  return result.rows[0] ?? null;
}

/**
 * Tells the person who raised a task that somebody else did something on it.
 * All task activity funnels through here, so a creator gets one feed covering
 * stage moves, edits, comments, members, labels, attachments and checklists.
 *
 * Database errors are not swallowed: pass the transaction client when the
 * caller is inside a transaction so a failure rolls back with the rest of the
 * request. Routes that have already finished writing use
 * `notifyTaskCreatorAfterWrite` instead.
 */
export async function notifyTaskCreator(
  activity: TaskActivity,
  client: Queryable = db,
): Promise<void> {
  const creatorId = activity.task.created_by;

  if (creatorId === null || creatorId === undefined) {
    return;
  }

  // Nobody needs telling about their own work.
  if (Number(creatorId) === Number(activity.actorId)) {
    return;
  }

  const alreadyNotified = (activity.skipUserIds ?? []).some(
    (id) => id !== null && id !== undefined && Number(id) === Number(creatorId),
  );

  if (alreadyNotified) {
    return;
  }

  await client.query(
    `INSERT INTO notifications (user_id, task_id, type, title, message)
     VALUES (
       $1,
       $2,
       $3,
       $4,
       replace(
         $5,
         '{actor}',
         COALESCE((SELECT full_name FROM users WHERE id = $6), 'Someone')
       )
     )`,
    [
      creatorId,
      activity.taskGone ? null : activity.task.id,
      activity.type,
      activity.title,
      activity.message,
      activity.actorId,
    ],
  );
}

/**
 * `notifyTaskCreator` for routes that already committed their work: a
 * notification problem is logged instead of failing the request.
 */
export async function notifyTaskCreatorAfterWrite(
  activity: TaskActivity,
): Promise<void> {
  try {
    await notifyTaskCreator(activity);
  } catch (error) {
    console.error(`Notify task creator (${activity.type}) failed:`, error);
  }
}

/**
 * Tells somebody they have been put on a task. Assigning a task to yourself is
 * not news, so that case is skipped.
 */
export async function notifyAssignedUser(
  assignment: {
    taskId: number | string;
    taskTitle: string;
    /** The new assignee. */
    userId: number;
    /** Who did the assigning. */
    actorId: number;
  },
  client: Queryable = db,
): Promise<void> {
  if (Number(assignment.userId) === Number(assignment.actorId)) {
    return;
  }

  await client.query(
    `INSERT INTO notifications (user_id, task_id, type, title, message)
     VALUES (
       $1,
       $2,
       'task_assigned',
       'New task assigned',
       replace(
         $3,
         '{actor}',
         COALESCE((SELECT full_name FROM users WHERE id = $4), 'Someone')
       )
     )`,
    [
      assignment.userId,
      assignment.taskId,
      `{actor} assigned you the task "${assignment.taskTitle}".`,
      assignment.actorId,
    ],
  );
}

/**
 * Tells everybody tagged with @ in a comment. The author never notifies
 * themselves, and users who have been deactivated are left out.
 */
export async function notifyMentionedUsers(
  mention: {
    taskId: number | string;
    /** Who wrote the comment. */
    actorId: number;
    userIds: number[];
    /** Body text. `{actor}` is replaced with the acting user's name. */
    message: string;
  },
  client: Queryable = db,
): Promise<void> {
  if (mention.userIds.length === 0) {
    return;
  }

  await client.query(
    `INSERT INTO notifications (user_id, task_id, type, title, message)
     SELECT
       u.id,
       $1,
       'mention',
       'You were mentioned',
       replace(
         $2,
         '{actor}',
         COALESCE((SELECT full_name FROM users WHERE id = $4), 'Someone')
       )
     FROM users u
     WHERE u.id = ANY($3::bigint[])
       AND u.id <> $4
       AND u.is_active = TRUE`,
    [mention.taskId, mention.message, mention.userIds, mention.actorId],
  );
}

/** Keeps a notification readable when the text it quotes is long. */
export function shortenForNotification(text: string, limit = 120) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit)}...` : clean;
}
