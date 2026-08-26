import { env } from "../config/env";
import { db } from "../db/pool";

import type { MakeEvent, MakeTaskRef } from "./notifyMake";

async function resolveUser(userId: number) {
  const result = await db.query(
    "SELECT full_name, email FROM users WHERE id = $1 LIMIT 1",
    [userId],
  );
  const row = result.rows[0];
  return row?.full_name ?? row?.email ?? "Unknown user";
}

async function resolveMember(memberId: unknown) {
  const id = Number(memberId);
  if (!Number.isInteger(id) || id <= 0) return "";
  const result = await db.query(
    "SELECT full_name, email FROM users WHERE id = $1 LIMIT 1",
    [id],
  );
  const row = result.rows[0];
  return row?.full_name ?? row?.email ?? "";
}

async function resolveStage(stageId: unknown) {
  const id = Number(stageId);
  if (!Number.isInteger(id) || id <= 0) return "";
  const result = await db.query(
    "SELECT name FROM workflow_stages WHERE id = $1 LIMIT 1",
    [id],
  );
  return result.rows[0]?.name ?? "";
}

function clean(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

export async function notifySlack(
  event: MakeEvent,
  task: MakeTaskRef,
  userId: number,
  data: Record<string, unknown> = {},
): Promise<void> {
  if (!env.SLACK_WEBHOOK_URL) return;

  try {
    const actor = await resolveUser(userId);
    const taskUrl = `${env.CLIENT_URL}/dashboard/boards?boardId=${task.board_id}`;

    let heading = "Task Activity";
    const fields: string[] = [
      `*Task:* <${taskUrl}|${task.title}>`,
      `*Board:* ${task.board_name || task.board_id}`,
    ];

    if (event === "task_created") {
      heading = "📌 New Task Created";
      if (data.priority) fields.push(`*Priority:* ${clean(data.priority)}`);
      if (data.due_date) fields.push(`*Due:* ${clean(data.due_date)}`);
      fields.push(`*Created by:* ${actor}`);
    } else if (event === "member_added") {
      heading = "👤 Task Assignment Updated";
      const member = await resolveMember(data.member_id);
      if (member) fields.push(`*Assigned to:* ${member}`);
      fields.push(`*Assigned by:* ${actor}`);
    } else if (event === "task_moved") {
      heading = "🔄 Task Moved";
      let previousStage = clean(data.previous_stage_name);
      let currentStage = clean(data.stage_name);
      if (!previousStage && data.previous_stage_id) previousStage = await resolveStage(data.previous_stage_id);
      if (!currentStage && data.stage_id) currentStage = await resolveStage(data.stage_id);
      if (previousStage || currentStage) fields.push(`*Stage:* ${previousStage || "Previous"} → ${currentStage || "Updated"}`);
      fields.push(`*Updated by:* ${actor}`);
    } else if (event === "comment_added") {
      heading = "💬 New Comment";
      fields.push(`*By:* ${actor}`);
      if (data.comment) fields.push(`*Comment:* ${clean(data.comment).slice(0, 300)}`);
    } else if (event === "priority_changed") {
      heading = "⚡ Priority Changed";
      fields.push(`*Priority:* ${clean(data.previous)} → ${clean(data.current)}`);
      fields.push(`*Updated by:* ${actor}`);
    } else if (event === "due_date_changed") {
      heading = "📅 Deadline Changed";
      fields.push(`*Deadline:* ${clean(data.previous) || "Not set"} → ${clean(data.current) || "Not set"}`);
      fields.push(`*Updated by:* ${actor}`);
    } else if (event === "description_changed") {
      heading = "📝 Description Updated";
      fields.push(`*Updated by:* ${actor}`);
    } else if (event === "file_attached") {
      heading = "📎 File Attached";
      fields.push(`*Uploaded by:* ${actor}`);
      const fileName = clean(data.file_name || data.filename || data.name);
      if (fileName) fields.push(`*File:* ${fileName}`);
    }

    const payload = {
      text: `${heading}: ${task.title}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${heading}*\n${fields.join("\n")}`,
          },
        },
      ],
    };

    const response = await fetch(env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`notifySlack(${event}) got HTTP ${response.status} from Slack`);
    }
  } catch (error) {
    console.error(`notifySlack(${event}) failed:`, error);
  }
}
