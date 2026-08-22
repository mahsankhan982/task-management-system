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

if (-not (Test-Path "apps\web\src\app\dashboard\boards\page.tsx")) {
    throw "Run this script from C:\Users\Chakor\task-management-system"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $root ".task-create-flow-backup-$timestamp"
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
$modal = "apps\web\src\components\tasks\real-task-modal.tsx"

# 1) Track whether a task was just created, so its first modal opens directly in edit/save mode.
Replace-Required $boards @'
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
'@ @'
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedTaskInitialEdit, setSelectedTaskInitialEdit] = useState(false);
'@ "Add first-save state for newly created tasks"

# 2) Capture the new task ID and open it immediately for assignment/details.
Replace-Required $boards @'
      await apiRequest("/tasks", {
        method: "POST",
        body: JSON.stringify({
          board_id: selectedBoardId,
          stage_id: stageId,
          title,
          priority,
        }),
      });

      formElement.reset();
      setShowCreate(false);
      await loadData();
'@ @'
      const result = await apiRequest<{
        success: boolean;
        data: { id: number | string };
      }>("/tasks", {
        method: "POST",
        body: JSON.stringify({
          board_id: selectedBoardId,
          stage_id: stageId,
          title,
          priority,
        }),
      });

      formElement.reset();
      setShowCreate(false);
      await loadData();

      if (result.data?.id) {
        setSelectedTaskInitialEdit(true);
        setSelectedTaskId(Number(result.data.id));
      }
'@ "Open a newly created task directly in first-save mode"

# 3) Remove the floating Add Task button row under the purple header.
Replace-Required $boards @'
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

'@ @'
'@ "Remove Add Task button from top-right area"

# 4) Existing task cards should open locked; only a newly created task opens editable.
Replace-Required $boards @'
                          onClick={() => setSelectedTaskId(task.id)}
'@ @'
                          onClick={() => {
                            setSelectedTaskInitialEdit(false);
                            setSelectedTaskId(task.id);
                          }}
'@ "Open existing task cards in normal locked mode"

# 5) Put Add Task at the bottom of the To Do list, where the user marked.
Replace-Required $boards @'
                      {stageTasks.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-400">
                          No tasks
                        </div>
                      ) : null}
                    </div>
                  </section>
'@ @'
                      {stageTasks.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-400">
                          No tasks
                        </div>
                      ) : null}
                    </div>

                    {stage.name === "To Do" &&
                    permissions.createTask &&
                    selectedBoardId ? (
                      <button
                        type="button"
                        onClick={() => setShowCreate((value) => !value)}
                        className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white/80 px-3 text-sm font-semibold text-slate-700 transition hover:border-violet-400 hover:bg-white hover:text-violet-700"
                      >
                        <Plus size={16} />
                        {showCreate ? "Close Add Task" : "Add Task"}
                      </button>
                    ) : null}
                  </section>
'@ "Move Add Task button to bottom of To Do column"

# 6) Pass first-save mode to the task modal and clear it on close.
Replace-Required $boards @'
        {selectedTaskId ? (
          <RealTaskModal
            taskId={selectedTaskId}
            onClose={() => setSelectedTaskId(null)}
            onChanged={loadData}
          />
        ) : null}
'@ @'
        {selectedTaskId ? (
          <RealTaskModal
            taskId={selectedTaskId}
            initialEditMode={selectedTaskInitialEdit}
            onClose={() => {
              setSelectedTaskInitialEdit(false);
              setSelectedTaskId(null);
            }}
            onChanged={loadData}
          />
        ) : null}
'@ "Pass first-save mode into task details"

# 7) Add initialEditMode prop.
Replace-Required $modal @'
type Props = {
  taskId: Id;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
};
'@ @'
type Props = {
  taskId: Id;
  initialEditMode?: boolean;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
};
'@ "Add initialEditMode prop"

Replace-Required $modal @'
export default function RealTaskModal({ taskId, onClose, onChanged }: Props) {
'@ @'
export default function RealTaskModal({
  taskId,
  initialEditMode = false,
  onClose,
  onChanged,
}: Props) {
'@ "Accept initialEditMode in task modal"

Replace-Required $modal @'
  const [editing, setEditing] = useState(false);
'@ @'
  const [editing, setEditing] = useState(initialEditMode);
'@ "Open new tasks directly in editable mode"

# Keep mode synced if a newly created task opens.
Replace-Required $modal @'
  useEffect(() => {
    void Promise.resolve().then(() => {
      void loadTask();
    });
  }, [loadTask]);

'@ @'
  useEffect(() => {
    setEditing(initialEditMode);
  }, [taskId, initialEditMode]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      void loadTask();
    });
  }, [loadTask]);

'@ "Sync first-save edit mode"

# Hide three-dot menu while actively editing. First-time task shows Save directly.
Replace-Required $modal @'
            {(permissions.editTask || permissions.moveTask || permissions.assignTask) && task ? (
              <div className="relative">
'@ @'
            {!editing &&
            (permissions.editTask || permissions.moveTask || permissions.assignTask) &&
            task ? (
              <div className="relative">
'@ "Show three-dot menu only after task has been saved"

Write-Host ""
Write-Host "Building frontend..." -ForegroundColor Cyan
Push-Location "apps\web"
npm run build
Pop-Location

Write-Host ""
Write-Host "SUCCESS: Add Task placement and first-save task flow are fixed." -ForegroundColor Green
Write-Host "Changed files:" -ForegroundColor Cyan
Write-Host "  apps/web/src/app/dashboard/boards/page.tsx"
Write-Host "  apps/web/src/components/tasks/real-task-modal.tsx"
Write-Host ""
Write-Host "Next: stage only these two files and check git status." -ForegroundColor Yellow
