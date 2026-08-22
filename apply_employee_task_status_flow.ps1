$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Normalize-LF([string]$text) {
    return $text.Replace("`r`n", "`n").Replace("`r", "`n")
}

function Write-Utf8NoBom([string]$path, [string]$content) {
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($path, (Normalize-LF $content), $utf8)
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
    Write-Utf8NoBom $fullPath $text
    Write-Host "Applied: $label" -ForegroundColor Green
}

if (-not (Test-Path "apps\api\src\routes\tasks.ts")) {
    throw "Run this script from C:\Users\Chakor\task-management-system"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $root ".employee-status-backup-$timestamp"
New-Item -ItemType Directory -Force -Path $backup | Out-Null

$filesToBackup = @(
    "apps\api\src\middleware\auth.ts",
    "apps\api\src\routes\tasks.ts",
    "apps\web\src\components\tasks\real-task-modal.tsx"
)

foreach ($file in $filesToBackup) {
    $source = Join-Path $root $file
    $dest = Join-Path $backup $file
    $destParent = Split-Path -Parent $dest
    New-Item -ItemType Directory -Force -Path $destParent | Out-Null
    Copy-Item $source $dest -Force
}

Write-Host "Backup created: $backup" -ForegroundColor Cyan

$auth = "apps\api\src\middleware\auth.ts"
$tasks = "apps\api\src\routes\tasks.ts"
$modal = "apps\web\src\components\tasks\real-task-modal.tsx"

# ---------------------------------------------------------------------------
# BACKEND MIDDLEWARE:
# Allow a Team Member to update only the status of a task assigned to them.
# ---------------------------------------------------------------------------
Replace-Required $auth @'
  if (req.path.startsWith("/api/notifications")) {
    return next();
  }

  if (req.user?.role === "Team Member") {
'@ @'
  if (req.path.startsWith("/api/notifications")) {
    return next();
  }

  if (
    req.user?.role === "Team Member" &&
    req.method === "PATCH" &&
    /^\/api\/tasks\/\d+\/status$/.test(req.path)
  ) {
    return next();
  }

  if (req.user?.role === "Team Member") {
'@ "Allow Team Member assigned-task status endpoint through middleware"

Replace-Required $auth @'
      message: "Team Members have read-only access except for comments",
'@ @'
      message: "Team Members have read-only access except for comments and their assigned task status",
'@ "Update Team Member permission message"

# ---------------------------------------------------------------------------
# BACKEND TASK STATUS ENDPOINT:
# Team Member can set ONLY their own assigned task to In Progress or Completed.
# ---------------------------------------------------------------------------
Replace-Required $tasks @'
router.put("/:id/assignees", async (req, res) => {
'@ @'
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

    if (!["In Progress", "Completed"].includes(stage_name)) {
      return res.status(400).json({
        success: false,
        message: "Team Members can only set assigned tasks to In Progress or Completed",
      });
    }

    await client.query("BEGIN");

    const taskResult = await client.query(
      `SELECT t.id, t.board_id, t.stage_id, t.title
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

    const stageResult = await client.query(
      `SELECT id, name
       FROM workflow_stages
       WHERE board_id = $1 AND name = $2
       LIMIT 1`,
      [task.board_id, stage_name],
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
        JSON.stringify({ stage_name }),
      ],
    );

    await client.query("COMMIT");

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
'@ "Add secure Team Member task status endpoint"

# ---------------------------------------------------------------------------
# FRONTEND TASK MODAL:
# Add Start Work / Mark Complete buttons for assigned Team Members.
# ---------------------------------------------------------------------------
Replace-Required $modal @'
  const { permissions } = useRole();
'@ @'
  const { permissions, role, user } = useRole();
'@ "Read current role and user in task modal"

Replace-Required $modal @'
  const [deleting, setDeleting] = useState(false);
  const [posting, setPosting] = useState(false);
'@ @'
  const [deleting, setDeleting] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [posting, setPosting] = useState(false);
'@ "Add Team Member status loading state"

Replace-Required $modal @'
  const selectedAssignees = useMemo(
    () => users.filter((user) => assigneeIds.includes(String(user.id))),
    [users, assigneeIds],
  );

'@ @'
  const selectedAssignees = useMemo(
    () => users.filter((user) => assigneeIds.includes(String(user.id))),
    [users, assigneeIds],
  );

  const isAssignedToMe = useMemo(
    () =>
      (task?.assignees ?? []).some(
        (assignee) => Number(assignee.id) === Number(user.id),
      ),
    [task?.assignees, user.id],
  );

'@ "Detect whether the Team Member owns the assigned task"

Replace-Required $modal @'
  async function deleteTask() {
'@ @'
  async function updateMyTaskStatus(stageName: "In Progress" | "Completed") {
    if (role !== "Team Member" || !task || !isAssignedToMe) return;

    try {
      setStatusUpdating(true);
      setError("");

      await apiRequest(`/tasks/${taskId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          stage_name: stageName,
        }),
      });

      await loadTask();
      await onChanged?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update task status",
      );
    } finally {
      setStatusUpdating(false);
    }
  }

  async function deleteTask() {
'@ "Add Team Member Start Work / Complete action"

Replace-Required $modal @'
          <div className="ml-4 flex items-center gap-2">
            {!editing &&
'@ @'
          <div className="ml-4 flex items-center gap-2">
            {role === "Team Member" && task && isAssignedToMe ? (
              <>
                {task.stage_name === "Completed" ? (
                  <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                    Completed
                  </span>
                ) : task.stage_name === "In Progress" ? (
                  <button
                    type="button"
                    onClick={() => void updateMyTaskStatus("Completed")}
                    disabled={statusUpdating}
                    className="flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {statusUpdating ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <CheckSquare size={15} />
                    )}
                    {statusUpdating ? "Updating..." : "Mark Complete"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void updateMyTaskStatus("In Progress")}
                    disabled={statusUpdating}
                    className="flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {statusUpdating ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Activity size={15} />
                    )}
                    {statusUpdating ? "Updating..." : "Start Work"}
                  </button>
                )}
              </>
            ) : null}

            {!editing &&
'@ "Show Start Work / Mark Complete for assigned Team Members"

# ---------------------------------------------------------------------------
# BUILD CHECKS
# ---------------------------------------------------------------------------
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
Write-Host "SUCCESS: Team Members can move only their assigned tasks to In Progress and Completed." -ForegroundColor Green
Write-Host "Changed files:" -ForegroundColor Cyan
Write-Host "  apps/api/src/middleware/auth.ts"
Write-Host "  apps/api/src/routes/tasks.ts"
Write-Host "  apps/web/src/components/tasks/real-task-modal.tsx"
Write-Host ""
Write-Host "Next: stage only these three files and check git status." -ForegroundColor Yellow
