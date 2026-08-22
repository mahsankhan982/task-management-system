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
        throw "Could not apply: $label. The file may be different from the expected version. No Git commit has been made."
    }

    $text = $text.Replace($old, $new)
    Write-Utf8NoBom $fullPath $text
    Write-Host "Applied: $label" -ForegroundColor Green
}

if (-not (Test-Path "apps\web\src\app\dashboard\boards\page.tsx")) {
    throw "Run this script from C:\Users\Chakor\task-management-system"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $root ".task-ui-fix-backup-$timestamp"
New-Item -ItemType Directory -Force -Path $backup | Out-Null

$filesToBackup = @(
    "apps\web\src\app\dashboard\boards\page.tsx",
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

$boards = "apps\web\src\app\dashboard\boards\page.tsx"
$modal  = "apps\web\src\components\tasks\real-task-modal.tsx"

Replace-Required $boards @'
  Search,
  Trash2,
  UserRound,
'@ @'
  Search,
  UserRound,
'@ "Remove unused Delete Board icon import"

Replace-Required $boards @'
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
'@ @'
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const title = String(form.get("title") || "").trim();
'@ "Keep a stable form reference before async task creation"

Replace-Required $boards @'
      event.currentTarget.reset();
      setShowCreate(false);
'@ @'
      formElement.reset();
      setShowCreate(false);
'@ "Fix Cannot read properties of null (reading reset)"

Replace-Required $boards @'
  async function deleteBoard(board: Board) {
    if (!canManageBoards) return;
    if (!window.confirm(`Delete board "${board.name}"?`)) return;

    try {
      setError("");
      await apiRequest(`/boards/${board.id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to delete board. Delete or move its tasks first.",
      );
    }
  }

'@ @'
'@ "Remove Delete Board action"

Replace-Required $boards @'
                <button
                  type="button"
                  onClick={() => deleteBoard(selectedBoard)}
                  className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
                >
                  <Trash2 size={14} />
                  Delete Board
                </button>
'@ @'
'@ "Remove Delete Board button"

Replace-Required $boards @'
            {permissions.createTask && selectedBoardId ? (
              <button
                type="button"
                onClick={() => setShowCreate((value) => !value)}
                className="flex items-center gap-2 rounded-lg bg-[#0c66e4] px-4 py-2 text-sm font-semibold text-white"
              >
                <Plus size={16} />
                Create Task
              </button>
            ) : null}
'@ @'
'@ "Remove Create Task button from purple board header"

Replace-Required $boards @'
          </div>
        </div>

        {error ? (
'@ @'
          </div>
        </div>

        {permissions.createTask && selectedBoardId ? (
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => setShowCreate((value) => !value)}
              className="flex h-11 items-center gap-2 rounded-xl bg-violet-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-800"
            >
              <Plus size={17} />
              {showCreate ? "Close Add Task" : "Add Task"}
            </button>
          </div>
        ) : null}

        {error ? (
'@ "Move Add Task control below the board header"

Replace-Required $modal @'
  Loader2,
  MessageSquare,
  Pencil,
'@ @'
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
'@ "Add three-dot menu icon"

Replace-Required $modal @'
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [posting, setPosting] = useState(false);
'@ @'
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [taskMenuOpen, setTaskMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [posting, setPosting] = useState(false);
'@ "Add task edit/delete menu state"

Replace-Required $modal @'
      await loadTask();
      await onChanged?.();
      setSaved(true);
'@ @'
      await loadTask();
      await onChanged?.();
      setEditing(false);
      setTaskMenuOpen(false);
      setSaved(true);
'@ "Exit edit mode after Save"

Replace-Required $modal @'
  async function toggleChecklist(item: ChecklistItem) {
'@ @'
  async function deleteTask() {
    if (!task || !permissions.editTask) return;

    const confirmed = window.confirm(
      `Delete task "${task.title}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      setDeleting(true);
      setError("");
      await apiRequest(`/tasks/${taskId}`, {
        method: "DELETE",
      });
      await onChanged?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete task");
    } finally {
      setDeleting(false);
      setTaskMenuOpen(false);
    }
  }

  async function toggleChecklist(item: ChecklistItem) {
'@ "Add Delete Task handler"

Replace-Required $modal @'
          <div className="ml-4 flex items-center gap-2">
            {(permissions.editTask || permissions.moveTask || permissions.assignTask) && task ? (
              <button
                type="button"
                onClick={saveTask}
                disabled={saving}
                className={`flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white transition disabled:opacity-60 ${saved ? "bg-emerald-600" : "bg-violet-700"}`}
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {saving ? "Saving..." : saved ? "Saved" : "Save"}
              </button>
            ) : null}

            <button
'@ @'
          <div className="ml-4 flex items-center gap-2">
            {(permissions.editTask || permissions.moveTask || permissions.assignTask) && task ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setTaskMenuOpen((value) => !value)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                  title="Task actions"
                  aria-label="Task actions"
                >
                  <MoreHorizontal size={19} />
                </button>

                {taskMenuOpen ? (
                  <div className="absolute right-0 top-11 z-50 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(true);
                        setTaskMenuOpen(false);
                        window.setTimeout(() => {
                          document.getElementById("task-title-input")?.focus();
                        }, 0);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      <Pencil size={15} />
                      Edit Task
                    </button>

                    {permissions.editTask ? (
                      <button
                        type="button"
                        onClick={() => void deleteTask()}
                        disabled={deleting}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 size={15} />
                        {deleting ? "Deleting..." : "Delete Task"}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {editing &&
            (permissions.editTask || permissions.moveTask || permissions.assignTask) &&
            task ? (
              <button
                type="button"
                onClick={saveTask}
                disabled={saving}
                className={`flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white transition disabled:opacity-60 ${saved ? "bg-emerald-600" : "bg-violet-700"}`}
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {saving ? "Saving..." : saved ? "Saved" : "Save"}
              </button>
            ) : null}

            <button
'@ "Add three-dot Edit Task / Delete Task menu"

Replace-Required $modal @'
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={!permissions.editTask}
'@ @'
                <input
                  id="task-title-input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={!editing || !permissions.editTask}
'@ "Make task title editable only after Edit Task"

Replace-Required $modal @'
                    disabled={!permissions.moveTask}
                    className="mt-2 h-11 w-full rounded-xl border bg-white px-3 text-sm normal-case text-slate-800 disabled:bg-slate-50"
'@ @'
                    disabled={!editing || !permissions.moveTask}
                    className="mt-2 h-11 w-full rounded-xl border bg-white px-3 text-sm normal-case text-slate-800 disabled:bg-slate-50"
'@ "Make stage editable only after Edit Task"

$modalPath = Join-Path $root $modal
$modalText = Normalize-LF ([System.IO.File]::ReadAllText($modalPath))
$needle = 'disabled={!permissions.editTask}'
$count = ([regex]::Matches($modalText, [regex]::Escape($needle))).Count

if ($count -lt 3) {
    throw "Could not safely update Priority/Due date/Description edit mode. Expected at least 3 remaining editTask disabled fields, found $count."
}

$modalText = $modalText.Replace($needle, 'disabled={!editing || !permissions.editTask}')
Write-Utf8NoBom $modalPath $modalText
Write-Host "Applied: Make Priority, Due date and Description editable only after Edit Task" -ForegroundColor Green

Replace-Required $modal @'
                    <select
                      value={assigneeIds[0] ?? ""}
                      onChange={(event) =>
                        setAssigneeIds(event.target.value ? [event.target.value] : [])
                      }
                      className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
'@ @'
                    <select
                      value={assigneeIds[0] ?? ""}
                      onChange={(event) =>
                        setAssigneeIds(event.target.value ? [event.target.value] : [])
                      }
                      disabled={!editing || !permissions.assignTask}
                      className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50"
'@ "Make assignee editable only after Edit Task"

Write-Host ""
Write-Host "Building frontend..." -ForegroundColor Cyan
Push-Location "apps\web"
npm run build
Pop-Location

Write-Host ""
Write-Host "SUCCESS: task UI fixes applied and frontend build passed." -ForegroundColor Green
Write-Host "Changed files:" -ForegroundColor Cyan
Write-Host "  apps/web/src/app/dashboard/boards/page.tsx"
Write-Host "  apps/web/src/components/tasks/real-task-modal.tsx"
Write-Host ""
Write-Host "Next: git add these two files, then git status." -ForegroundColor Yellow
