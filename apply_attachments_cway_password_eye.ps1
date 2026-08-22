$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Normalize-LF([string]$text) {
    return $text.Replace("`r`n", "`n").Replace("`r", "`n")
}

function Write-Utf8NoBom([string]$relativePath, [string]$content) {
    $fullPath = Join-Path $root $relativePath
    $parent = Split-Path -Parent $fullPath
    if ($parent -and -not (Test-Path $parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($fullPath, (Normalize-LF $content), $utf8)
}

function Replace-Required([string]$relativePath, [string]$oldText, [string]$newText, [string]$label) {
    $fullPath = Join-Path $root $relativePath
    if (-not (Test-Path $fullPath)) {
        throw "File not found: $relativePath"
    }

    $text = Normalize-LF ([System.IO.File]::ReadAllText($fullPath))
    $old = Normalize-LF $oldText
    $new = Normalize-LF $newText

    if (-not $text.Contains($old)) {
        throw "Could not apply: $label. The file is different from the expected version. No Git commit has been made."
    }

    $text = $text.Replace($old, $new)
    Write-Utf8NoBom $relativePath $text
    Write-Host "Applied: $label" -ForegroundColor Green
}

if (-not (Test-Path "apps\web\src\components\tasks\real-task-modal.tsx")) {
    throw "Run this script from C:\Users\Chakor\task-management-system"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $root ".attachments-cway-eye-backup-$timestamp"
New-Item -ItemType Directory -Force -Path $backup | Out-Null

$filesToBackup = @(
    "apps\api\src\app.ts",
    "apps\api\src\middleware\auth.ts",
    "apps\web\src\app\dashboard\page.tsx",
    "apps\web\src\app\page.tsx",
    "apps\web\src\lib\api.ts",
    "apps\web\src\components\tasks\real-task-modal.tsx"
)

foreach ($file in $filesToBackup) {
    if (Test-Path $file) {
        $dest = Join-Path $backup $file
        $destParent = Split-Path -Parent $dest
        New-Item -ItemType Directory -Force -Path $destParent | Out-Null
        Copy-Item $file $dest -Force
    }
}

Write-Host "Backup created: $backup" -ForegroundColor Cyan

Write-Utf8NoBom "apps\api\src\db\migrations\007_task_attachments_and_cway_board.sql" @'
CREATE TABLE IF NOT EXISTS task_attachments (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  attachment_type VARCHAR(20) NOT NULL CHECK (attachment_type IN ('file', 'link')),
  file_name VARCHAR(255),
  mime_type VARCHAR(150),
  file_size BIGINT,
  file_data BYTEA,
  url TEXT,
  label VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT task_attachments_payload_check CHECK (
    (attachment_type = 'file' AND file_data IS NOT NULL AND file_name IS NOT NULL)
    OR
    (attachment_type = 'link' AND url IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id
  ON task_attachments(task_id, created_at DESC);

DO $$
DECLARE
  creator_id BIGINT;
  cway_id BIGINT;
  cway_team_id BIGINT;
BEGIN
  SELECT id
  INTO creator_id
  FROM users
  ORDER BY CASE WHEN role = 'Manager' THEN 0 ELSE 1 END, id
  LIMIT 1;

  SELECT id
  INTO cway_team_id
  FROM teams
  WHERE LOWER(name) LIKE '%cway%'
     OR LOWER(name) LIKE '%ceway%'
     OR LOWER(name) LIKE '%c-way%'
  ORDER BY id
  LIMIT 1;

  SELECT id
  INTO cway_id
  FROM boards
  WHERE LOWER(name) LIKE '%cway%'
     OR LOWER(name) LIKE '%ceway%'
     OR LOWER(name) LIKE '%c-way%'
     OR LOWER(COALESCE(description, '')) LIKE '%cway%'
     OR LOWER(COALESCE(description, '')) LIKE '%ceway%'
  ORDER BY id
  LIMIT 1;

  IF cway_id IS NULL THEN
    INSERT INTO boards (name, description, team_id, created_by)
    VALUES ('CWAY Board', 'CWAY workspace board', cway_team_id, creator_id)
    RETURNING id INTO cway_id;
  ELSE
    UPDATE boards
    SET name = 'CWAY Board',
        description = COALESCE(description, 'CWAY workspace board'),
        team_id = COALESCE(team_id, cway_team_id),
        updated_at = NOW()
    WHERE id = cway_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM workflow_stages WHERE board_id = cway_id) THEN
    INSERT INTO workflow_stages (board_id, name, position) VALUES
      (cway_id, 'To Do', 1),
      (cway_id, 'In Progress', 2),
      (cway_id, 'Waiting for Lead', 3),
      (cway_id, 'Review', 4),
      (cway_id, 'Completed', 5);
  END IF;
END $$;
'@

Write-Utf8NoBom "apps\api\src\routes\attachments.ts" @'
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
'@

Replace-Required "apps\api\src\app.ts" @'
import notificationsRouter from "./routes/notifications";
'@ @'
import notificationsRouter from "./routes/notifications";
import attachmentsRouter from "./routes/attachments";
'@ "Import attachments API route"

Replace-Required "apps\api\src\app.ts" @'
app.use("/api/notifications", notificationsRouter);

export default app;
'@ @'
app.use("/api/notifications", notificationsRouter);
app.use("/api/attachments", attachmentsRouter);

export default app;
'@ "Register attachments API route"

Replace-Required "apps\api\src\middleware\auth.ts" @'
  if (req.path.startsWith("/api/notifications")) {
    return next();
  }

  if (
'@ @'
  if (req.path.startsWith("/api/notifications")) {
    return next();
  }

  if (req.path.startsWith("/api/attachments")) {
    return next();
  }

  if (
'@ "Allow attachment actions through Team Member middleware"

Replace-Required "apps\api\src\middleware\auth.ts" @'
      message: "Team Members have read-only access except for comments and their assigned task status",
'@ @'
      message: "Team Members have read-only access except for comments, attachments on assigned tasks, and their assigned task status",
'@ "Update Team Member access message"

Replace-Required "apps\web\src\lib\api.ts" @'
export const api = {
'@ @'
export async function apiBlobRequest(path: string): Promise<Blob> {
  const token = getAuthToken();
  const headers = new Headers();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      data?.message || `Request failed with status ${response.status}`,
    );
  }

  return response.blob();
}

export const api = {
'@ "Add authenticated file opener"

Replace-Required "apps\web\src\app\dashboard\page.tsx" @'
  UserPlus,
  X,
'@ @'
  UserPlus,
  Waypoints,
  X,
'@ "Add CWAY workspace icon"

Replace-Required "apps\web\src\app\dashboard\page.tsx" @'
  {
    title: "Digital",
    description: "Open the Digital workspace.",
    aliases: ["digital"],
    icon: Megaphone,
  },
];
'@ @'
  {
    title: "Digital",
    description: "Open the Digital workspace.",
    aliases: ["digital"],
    icon: Megaphone,
  },
  {
    title: "CWAY",
    description: "Open the CWAY workspace.",
    aliases: ["cway", "ceway", "c-way"],
    icon: Waypoints,
  },
];
'@ "Add CWAY as fourth workspace"

Replace-Required "apps\web\src\app\dashboard\page.tsx" @'
      <section className="grid gap-5 md:grid-cols-3">
'@ @'
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
'@ "Lay out four workspace cards cleanly"

Replace-Required "apps\web\src\app\page.tsx" @'
import { useRouter } from "next/navigation";
import { api, setAuthToken } from "@/lib/api";
'@ @'
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { api, setAuthToken } from "@/lib/api";
'@ "Add password visibility icons"

Replace-Required "apps\web\src\app\page.tsx" @'
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
'@ @'
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
'@ "Add password visibility state"

Replace-Required "apps\web\src\app\page.tsx" @'
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              className="h-12 w-full rounded-xl border border-slate-300 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
'@ @'
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                className="h-12 w-full rounded-xl border border-slate-300 px-4 pr-12 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
'@ "Add eye button to login password field"

Replace-Required "apps\web\src\components\tasks\real-task-modal.tsx" @'
  Activity,
  CheckSquare,
  Loader2,
'@ @'
  Activity,
  CheckSquare,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
'@ "Add attachment icons part 1"

Replace-Required "apps\web\src\components\tasks\real-task-modal.tsx" @'
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserRound,
  X,
'@ @'
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  UserRound,
  Video,
  X,
'@ "Add attachment icons part 2"

Replace-Required "apps\web\src\components\tasks\real-task-modal.tsx" @'
import { apiRequest } from "@/lib/api";
'@ @'
import { apiBlobRequest, apiRequest } from "@/lib/api";
'@ "Import authenticated file opener"

Replace-Required "apps\web\src\components\tasks\real-task-modal.tsx" @'
type ActivityEntry = {
  id: Id;
  action: string;
  user_name: string | null;
  created_at: string;
};

type TaskDetails = {
'@ @'
type ActivityEntry = {
  id: Id;
  action: string;
  user_name: string | null;
  created_at: string;
};

type TaskAttachment = {
  id: Id;
  task_id: Id;
  uploaded_by: Id | null;
  attachment_type: "file" | "link";
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  url: string | null;
  label: string | null;
  uploader_name: string | null;
  created_at: string;
};

type TaskDetails = {
'@ "Add attachment data type"

Replace-Required "apps\web\src\components\tasks\real-task-modal.tsx" @'
  const [busyChecklistId, setBusyChecklistId] = useState<string | null>(null);
  const [error, setError] = useState("");
'@ @'
  const [busyChecklistId, setBusyChecklistId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachmentLabel, setAttachmentLabel] = useState("");
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [error, setError] = useState("");
'@ "Add attachment state"

Replace-Required "apps\web\src\components\tasks\real-task-modal.tsx" @'
  const loadOptions = useCallback(async (boardId: Id) => {
'@ @'
  const loadAttachments = useCallback(async () => {
    try {
      const response = await apiRequest<{
        success: boolean;
        data: TaskAttachment[];
      }>(`/attachments?task_id=${taskId}`);

      setAttachments(response.data ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load attachments",
      );
    }
  }, [taskId]);

  const loadOptions = useCallback(async (boardId: Id) => {
'@ "Add attachment loader"

Replace-Required "apps\web\src\components\tasks\real-task-modal.tsx" @'
  useEffect(() => {
    if (!task?.board_id) return;

    void Promise.resolve().then(() => loadOptions(task.board_id));
  }, [task?.board_id, loadOptions]);

  const selectedAssignees = useMemo(
'@ @'
  useEffect(() => {
    if (!task?.board_id) return;

    void Promise.resolve().then(() => loadOptions(task.board_id));
  }, [task?.board_id, loadOptions]);

  useEffect(() => {
    void Promise.resolve().then(() => loadAttachments());
  }, [loadAttachments]);

  const selectedAssignees = useMemo(
'@ "Load attachments when task opens"

Replace-Required "apps\web\src\components\tasks\real-task-modal.tsx" @'
  async function addChecklist(event: FormEvent<HTMLFormElement>) {
'@ @'
  async function uploadAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;

    if (!attachmentFile || attachmentBusy) return;

    if (attachmentFile.size > 3 * 1024 * 1024) {
      setError(
        "Maximum direct upload size is 3 MB. For a larger video, paste its Drive/YouTube/other link instead.",
      );
      return;
    }

    try {
      setAttachmentBusy(true);
      setError("");

      const fileData = await attachmentFile.arrayBuffer();

      await apiRequest(
        `/attachments/file?task_id=${taskId}&file_name=${encodeURIComponent(
          attachmentFile.name,
        )}&mime_type=${encodeURIComponent(
          attachmentFile.type || "application/octet-stream",
        )}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
          },
          body: fileData,
        },
      );

      setAttachmentFile(null);
      formElement.reset();
      await loadAttachments();
      await loadTask(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to upload attachment",
      );
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function addLinkAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const url = attachmentUrl.trim();
    if (!url || attachmentBusy) return;

    try {
      setAttachmentBusy(true);
      setError("");

      await apiRequest("/attachments/link", {
        method: "POST",
        body: JSON.stringify({
          task_id: Number(taskId),
          url,
          label: attachmentLabel.trim() || null,
        }),
      });

      setAttachmentUrl("");
      setAttachmentLabel("");
      await loadAttachments();
      await loadTask(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add link");
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function openAttachment(attachment: TaskAttachment) {
    try {
      if (attachment.attachment_type === "link" && attachment.url) {
        window.open(attachment.url, "_blank", "noopener,noreferrer");
        return;
      }

      const blob = await apiBlobRequest(`/attachments/${attachment.id}/content`);
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank", "noopener,noreferrer");

      window.setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 60000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to open attachment",
      );
    }
  }

  async function deleteAttachment(attachment: TaskAttachment) {
    const canDelete =
      role !== "Team Member" ||
      Number(attachment.uploaded_by) === Number(user.id);

    if (!canDelete) return;

    const name =
      attachment.label ||
      attachment.file_name ||
      attachment.url ||
      "attachment";

    if (!window.confirm(`Delete attachment "${name}"?`)) return;

    try {
      setAttachmentBusy(true);
      setError("");

      await apiRequest(`/attachments/${attachment.id}`, {
        method: "DELETE",
      });

      await loadAttachments();
      await loadTask(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to delete attachment",
      );
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function addChecklist(event: FormEvent<HTMLFormElement>) {
'@ "Add attachment actions"

Replace-Required "apps\web\src\components\tasks\real-task-modal.tsx" @'
              <div className="mt-6">
                <div className="flex items-center gap-2">
                  <UserRound size={17} />
                  <h3 className="text-sm font-semibold text-slate-900">Assignees</h3>
                </div>
'@ @'
              <div className="mt-6 border-t border-slate-200 pt-6">
                <div className="flex items-center gap-2">
                  <Paperclip size={17} />
                  <h3 className="text-sm font-semibold text-slate-900">
                    Attachments
                  </h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    {attachments.length}
                  </span>
                </div>

                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Upload a file, image or small video up to 3 MB. For larger
                  videos, Google Drive, YouTube or any other resource, add a
                  link.
                </p>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <form
                    onSubmit={uploadAttachment}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Upload file / image / video
                    </label>

                    <input
                      type="file"
                      onChange={(event) =>
                        setAttachmentFile(event.target.files?.[0] ?? null)
                      }
                      className="mt-2 block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-violet-700"
                    />

                    <button
                      type="submit"
                      disabled={!attachmentFile || attachmentBusy}
                      className="mt-3 flex h-9 items-center gap-2 rounded-lg bg-violet-700 px-4 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {attachmentBusy ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Upload size={14} />
                      )}
                      Upload
                    </button>
                  </form>

                  <form
                    onSubmit={addLinkAttachment}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Add link
                    </label>

                    <input
                      type="url"
                      required
                      value={attachmentUrl}
                      onChange={(event) => setAttachmentUrl(event.target.value)}
                      placeholder="https://..."
                      className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:border-violet-500"
                    />

                    <input
                      value={attachmentLabel}
                      onChange={(event) =>
                        setAttachmentLabel(event.target.value)
                      }
                      placeholder="Display text (optional)"
                      className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:border-violet-500"
                    />

                    <button
                      type="submit"
                      disabled={!attachmentUrl.trim() || attachmentBusy}
                      className="mt-3 flex h-9 items-center gap-2 rounded-lg bg-slate-800 px-4 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      <Link2 size={14} />
                      Add link
                    </button>
                  </form>
                </div>

                <div className="mt-4 space-y-2">
                  {attachments.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                      No attachments yet.
                    </div>
                  ) : (
                    attachments.map((attachment) => {
                      const isImage =
                        attachment.mime_type?.startsWith("image/") ?? false;
                      const isVideo =
                        attachment.mime_type?.startsWith("video/") ?? false;
                      const AttachmentIcon =
                        attachment.attachment_type === "link"
                          ? Link2
                          : isImage
                            ? ImageIcon
                            : isVideo
                              ? Video
                              : FileText;

                      const canDelete =
                        role !== "Team Member" ||
                        Number(attachment.uploaded_by) === Number(user.id);

                      return (
                        <div
                          key={String(attachment.id)}
                          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
                            <AttachmentIcon size={18} />
                          </div>

                          <button
                            type="button"
                            onClick={() => void openAttachment(attachment)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="truncate text-sm font-semibold text-slate-900 hover:text-violet-700">
                              {attachment.label ||
                                attachment.file_name ||
                                attachment.url ||
                                "Attachment"}
                            </p>

                            <p className="mt-1 truncate text-xs text-slate-500">
                              {attachment.attachment_type === "file"
                                ? `${attachment.mime_type || "File"}${
                                    attachment.file_size
                                      ? ` · ${Math.max(
                                          1,
                                          Math.round(
                                            Number(attachment.file_size) / 1024,
                                          ),
                                        )} KB`
                                      : ""
                                  }`
                                : attachment.url}
                              {attachment.uploader_name
                                ? ` · Added by ${attachment.uploader_name}`
                                : ""}
                            </p>
                          </button>

                          {canDelete ? (
                            <button
                              type="button"
                              onClick={() =>
                                void deleteAttachment(attachment)
                              }
                              disabled={attachmentBusy}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                              title="Delete attachment"
                              aria-label="Delete attachment"
                            >
                              <Trash2 size={15} />
                            </button>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-center gap-2">
                  <UserRound size={17} />
                  <h3 className="text-sm font-semibold text-slate-900">Assignees</h3>
                </div>
'@ "Add Trello-style attachment area below Description"

Write-Host ""
Write-Host "Building backend..." -ForegroundColor Cyan
Push-Location "apps\api"
npm run build
Pop-Location

Write-Host ""
Write-Host "Building frontend..." -ForegroundColor Cyan
Push-Location "apps\web"
npm run build
Pop-Location

Write-Host ""
Write-Host "SUCCESS: attachments, CWAY board card, and password eye changes are ready." -ForegroundColor Green
Write-Host "Next: run migration 007, then stage only the required source files." -ForegroundColor Yellow
