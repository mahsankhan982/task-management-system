import crypto from "node:crypto";

import { env } from "../config/env";
import { db } from "../db/pool";
import { notifySlack } from "./notifySlack";

export type MakeEvent =
  | "task_created"
  | "description_changed"
  | "file_attached"
  | "priority_changed"
  | "due_date_changed"
  | "member_added"
  | "comment_added"
  | "task_moved";

export interface MakeTaskRef {
  id: number | string;
  title: string;
  board_id: number | string;
  board_name: string;
  previous_board_id?: number | string | null;
  previous_board_name?: string | null;
}

async function resolveUser(userId: number) {
  const result = await db.query(
    "SELECT full_name, email FROM users WHERE id = $1 LIMIT 1",
    [userId],
  );
  const row = result.rows[0];

  return {
    id: userId,
    name: row?.full_name ?? row?.email ?? "Unknown",
    email: row?.email ?? "",
  };
}

export async function getBoardName(boardId: number | string): Promise<string> {
  const result = await db.query("SELECT name FROM boards WHERE id = $1", [boardId]);
  return result.rows[0]?.name ?? "";
}

export async function notifyMake(
  event: MakeEvent,
  task: MakeTaskRef,
  userId: number,
  data: Record<string, unknown> = {},
): Promise<void> {
  void notifySlack(event, task, userId, data);
  return; // Make.com webhook disabled

  if (!env.MAKE_WEBHOOK_URL) {
    return;
  }

  try {
    const user = await resolveUser(userId);
    const payload = {
      event_id: crypto.randomUUID(),
      event,
      timestamp: new Date().toISOString(),
      task: {
        id: String(task.id),
        title: task.title,
        url: `${env.CLIENT_URL}/dashboard/boards?boardId=${task.board_id}`,
        board: {
          id: String(task.board_id),
          name: task.board_name,
        },
        previous_board:
          task.previous_board_id !== undefined && task.previous_board_id !== null
            ? {
                id: String(task.previous_board_id),
                name: task.previous_board_name ?? "",
              }
            : null,
      },
      user,
      data,
    };

    const response = await fetch(env.MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`notifyMake(${event}) got HTTP ${response.status} from Make`);
    }
  } catch (error) {
    console.error(`notifyMake(${event}) failed:`, error);
  }
}


