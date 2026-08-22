import express, { Router } from "express";
import { db } from "../db/pool";

const router = Router();
const MAX_FILE_BYTES = 3 * 1024 * 1024;

async function canAddAttachment(taskId: number, userId: number, role: string) {
  if (role !== "Team Member") {
    const task = await db.query("SELECT id FROM tasks WHERE id = $1 LIMIT 1", [taskId]);
    return Boolean(task.rows[0]);
  }

  const assigned = await db.query(
    `SELECT 1
     FROM task_assignees
     WHERE task_id = $1 AND user_id = $2
     LIMIT 1`,
    [taskId, userId],
  );

  return Boolean(assigned.rows[0]);
}

router.get("/", async (req, res) => {
  try {
    const taskId = Number(req.query.task_id);

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ success: false, message: "Valid task_id is required" });
    }

    const result = await db.query(
      `SELECT
         a.id,
         a.task_id,
         a.uploaded_by,
         a.attachment_type,
         a.file_name,
         a.mime_type,
         a.file_size,
         a.url,
         a.label,
         a.created_at,
         u.full_name AS uploader_name
       FROM task_attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.task_id = $1
       ORDER BY a.created_at DESC, a.id DESC`,
      [taskId],
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get attachments failed:", error);
    return res.status(500).json({ success: false, message: "Unable to load attachments" });
  }
});

router.post(
  "/file",
  express.raw({ type: "application/octet-stream", limit: MAX_FILE_BYTES }),
  async (req, res) => {
    try {
      const taskId = Number(req.query.task_id);
      const fileName = String(req.query.file_name ?? "").trim();
      const mimeType =
        String(req.query.mime_type ?? "").trim() || "application/octet-stream";
      const fileData = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

      if (!Number.isInteger(taskId) || taskId <= 0) {
        return res.status(400).json({ success: false, message: "Valid task_id is required" });
      }

      if (!fileName) {
        return res.status(400).json({ success: false, message: "File name is required" });
      }

      if (!fileData.length) {
        return res.status(400).json({ success: false, message: "Choose a file to upload" });
      }

      if (fileData.length > MAX_FILE_BYTES) {
        return res.status(413).json({
          success: false,
          message: "File is too large. Maximum direct upload size is 3 MB. Add larger videos as a link.",
        });
      }

      const allowed = await canAddAttachment(taskId, req.user!.id, req.user!.role);

      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: "You can only attach files to tasks assigned to you",
        });
      }

      const result = await db.query(
        `INSERT INTO task_attachments
           (task_id, uploaded_by, attachment_type, file_name, mime_type, file_size, file_data)
         VALUES ($1,$2,'file',$3,$4,$5,$6)
         RETURNING id, task_id, uploaded_by, attachment_type, file_name, mime_type, file_size, url, label, created_at`,
        [
          taskId,
          req.user!.id,
          fileName.slice(0, 255),
          mimeType.slice(0, 150),
          fileData.length,
          fileData,
        ],
      );

      await db.query(
        `INSERT INTO activity_logs (task_id, user_id, action, details)
         VALUES ($1,$2,$3,$4::jsonb)`,
        [
          taskId,
          req.user!.id,
          "attachment_added",
          JSON.stringify({ type: "file", file_name: fileName }),
        ],
      );

      return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error: any) {
      if (error?.type === "entity.too.large") {
        return res.status(413).json({
          success: false,
          message: "File is too large. Maximum direct upload size is 3 MB. Add larger videos as a link.",
        });
      }

      console.error("Upload attachment failed:", error);
      return res.status(500).json({ success: false, message: "Unable to upload attachment" });
    }
  },
);

router.post("/link", async (req, res) => {
  try {
    const taskId = Number(req.body?.task_id);
    const rawUrl = String(req.body?.url ?? "").trim();
    const label = String(req.body?.label ?? "").trim();

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ success: false, message: "Valid task_id is required" });
    }

    let parsed: URL;

    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).json({ success: false, message: "Enter a valid link" });
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return res.status(400).json({
        success: false,
        message: "Only http and https links are allowed",
      });
    }

    const allowed = await canAddAttachment(taskId, req.user!.id, req.user!.role);

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You can only attach links to tasks assigned to you",
      });
    }

    const result = await db.query(
      `INSERT INTO task_attachments
         (task_id, uploaded_by, attachment_type, url, label)
       VALUES ($1,$2,'link',$3,$4)
       RETURNING id, task_id, uploaded_by, attachment_type, file_name, mime_type, file_size, url, label, created_at`,
      [taskId, req.user!.id, parsed.toString(), label.slice(0, 255) || null],
    );

    await db.query(
      `INSERT INTO activity_logs (task_id, user_id, action, details)
       VALUES ($1,$2,$3,$4::jsonb)`,
      [
        taskId,
        req.user!.id,
        "attachment_added",
        JSON.stringify({ type: "link", url: parsed.toString(), label }),
      ],
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Add link attachment failed:", error);
    return res.status(500).json({ success: false, message: "Unable to add link" });
  }
});

router.get("/:id/content", async (req, res) => {
  try {
    const attachmentId = Number(req.params.id);

    if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
      return res.status(400).json({ success: false, message: "Invalid attachment" });
    }

    const result = await db.query(
      `SELECT file_name, mime_type, file_data
       FROM task_attachments
       WHERE id = $1 AND attachment_type = 'file'
       LIMIT 1`,
      [attachmentId],
    );

    const attachment = result.rows[0];

    if (!attachment || !attachment.file_data) {
      return res.status(404).json({ success: false, message: "Attachment file not found" });
    }

    const safeName = String(attachment.file_name ?? "attachment").replace(/["\r\n]/g, "");

    res.setHeader("Content-Type", attachment.mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);

    return res.status(200).send(attachment.file_data);
  } catch (error) {
    console.error("Open attachment failed:", error);
    return res.status(500).json({ success: false, message: "Unable to open attachment" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const attachmentId = Number(req.params.id);

    if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
      return res.status(400).json({ success: false, message: "Invalid attachment" });
    }

    const current = await db.query(
      `SELECT id, task_id, uploaded_by, attachment_type, file_name, url
       FROM task_attachments
       WHERE id = $1
       LIMIT 1`,
      [attachmentId],
    );

    const attachment = current.rows[0];

    if (!attachment) {
      return res.status(404).json({ success: false, message: "Attachment not found" });
    }

    const isOwner = Number(attachment.uploaded_by) === Number(req.user!.id);
    const canManage = req.user!.role !== "Team Member";

    if (!isOwner && !canManage) {
      return res.status(403).json({
        success: false,
        message: "You can only delete attachments you uploaded",
      });
    }

    await db.query("DELETE FROM task_attachments WHERE id = $1", [attachmentId]);

    await db.query(
      `INSERT INTO activity_logs (task_id, user_id, action, details)
       VALUES ($1,$2,$3,$4::jsonb)`,
      [
        attachment.task_id,
        req.user!.id,
        "attachment_deleted",
        JSON.stringify({
          type: attachment.attachment_type,
          file_name: attachment.file_name,
          url: attachment.url,
        }),
      ],
    );

    return res.status(200).json({ success: true, message: "Attachment deleted" });
  } catch (error) {
    console.error("Delete attachment failed:", error);
    return res.status(500).json({ success: false, message: "Unable to delete attachment" });
  }
});

export default router;
