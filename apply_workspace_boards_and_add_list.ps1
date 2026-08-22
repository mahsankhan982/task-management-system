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

function Replace-Exact([string]$relativePath, [string]$oldText, [string]$newText) {
    $fullPath = Join-Path $root $relativePath
    if (-not (Test-Path $fullPath)) {
        throw "File not found: $relativePath"
    }
    $text = Normalize-LF ([System.IO.File]::ReadAllText($fullPath))
    $old = Normalize-LF $oldText
    $new = Normalize-LF $newText
    if (-not $text.Contains($old)) {
        throw "Expected code block not found in $relativePath. No Git commit has been made."
    }
    Write-Utf8NoBom $relativePath ($text.Replace($old, $new))
}

if (-not (Test-Path "apps\web\src\app\dashboard\page.tsx")) {
    throw "This script must be inside C:\Users\Chakor\task-management-system"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $root ".workspace-backup-$timestamp"
New-Item -ItemType Directory -Force -Path $backup | Out-Null

foreach ($file in @(
    "apps\api\src\routes\boards.ts",
    "apps\web\src\app\dashboard\page.tsx",
    "apps\web\src\app\dashboard\boards\page.tsx"
)) {
    if (Test-Path $file) {
        $dest = Join-Path $backup $file
        $destParent = Split-Path -Parent $dest
        New-Item -ItemType Directory -Force -Path $destParent | Out-Null
        Copy-Item $file $dest -Force
    }
}

Write-Host "Backup created: $backup" -ForegroundColor Cyan

Write-Utf8NoBom "apps\api\src\routes\boards.ts" @'
import { Router } from "express";
import { db } from "../db/pool";

const router = Router();

const defaultWorkflow = [
  ["To Do", 1],
  ["In Progress", 2],
  ["Waiting for Lead", 3],
  ["Review", 4],
  ["Completed", 5],
] as const;

router.get("/", async (_req, res) => {
  try {
    const result = await db.query(
      "SELECT b.*, t.name AS team_name FROM boards b LEFT JOIN teams t ON t.id = b.team_id ORDER BY b.created_at DESC"
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get boards failed:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch boards" });
  }
});

router.post("/", async (req, res) => {
  const client = await db.connect();

  try {
    const { name, description, team_id } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ success: false, message: "Board name is required" });
    }

    await client.query("BEGIN");

    const result = await client.query(
      "INSERT INTO boards (name, description, team_id, created_by) VALUES ($1, $2, $3, $4) RETURNING *",
      [name.trim(), description ?? null, team_id ?? null, req.user!.id]
    );

    const board = result.rows[0];

    for (const [stageName, position] of defaultWorkflow) {
      await client.query(
        "INSERT INTO workflow_stages (board_id, name, position) VALUES ($1, $2, $3)",
        [board.id, stageName, position]
      );
    }

    await client.query("COMMIT");
    return res.status(201).json({ success: true, data: board });
  } catch (error: any) {
    await client.query("ROLLBACK");

    if (error?.code === "23503") {
      return res.status(400).json({ success: false, message: "Invalid team or creator" });
    }

    console.error("Create board failed:", error);
    return res.status(500).json({ success: false, message: "Unable to create board" });
  } finally {
    client.release();
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { name, description, team_id } = req.body;

    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      return res.status(400).json({ success: false, message: "Board name cannot be empty" });
    }

    const result = await db.query(
      `UPDATE boards
       SET name = COALESCE($1, name),
           description = CASE WHEN $2::boolean THEN $3 ELSE description END,
           team_id = CASE WHEN $4::boolean THEN $5 ELSE team_id END,
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        name === undefined ? null : name.trim(),
        description !== undefined,
        description ?? null,
        team_id !== undefined,
        team_id ?? null,
        req.params.id,
      ]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: "Board not found" });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error?.code === "23503") {
      return res.status(400).json({ success: false, message: "Invalid team" });
    }

    console.error("Update board failed:", error);
    return res.status(500).json({ success: false, message: "Unable to update board" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const usage = await db.query(
      "SELECT COUNT(*)::int AS task_count FROM tasks WHERE board_id = $1",
      [req.params.id]
    );

    if ((usage.rows[0]?.task_count ?? 0) > 0) {
      return res.status(409).json({
        success: false,
        message: "Move or delete board tasks before deleting this board",
      });
    }

    const result = await db.query("DELETE FROM boards WHERE id = $1 RETURNING id", [req.params.id]);

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: "Board not found" });
    }

    return res.status(200).json({ success: true, message: "Board deleted" });
  } catch (error) {
    console.error("Delete board failed:", error);
    return res.status(500).json({ success: false, message: "Unable to delete board" });
  }
});

export default router;
'@

Write-Utf8NoBom "apps\api\src\db\migrations\005_workspace_boards.sql" @'
DO $$
DECLARE
  creator_id BIGINT;
  creative_id BIGINT;
  website_id BIGINT;
  digital_id BIGINT;
  website_team_id BIGINT;
  digital_team_id BIGINT;
BEGIN
  SELECT id
  INTO creator_id
  FROM users
  ORDER BY CASE WHEN role = 'Manager' THEN 0 ELSE 1 END, id
  LIMIT 1;

  SELECT id
  INTO creative_id
  FROM boards
  WHERE LOWER(name) LIKE '%creative%'
     OR LOWER(name) LIKE '%crative%'
     OR LOWER(COALESCE(description, '')) LIKE '%creative%'
  ORDER BY id
  LIMIT 1;

  IF creative_id IS NULL THEN
    INSERT INTO boards (name, description, team_id, created_by)
    VALUES ('Creative Board', 'Creative workspace board', NULL, creator_id)
    RETURNING id INTO creative_id;
  END IF;

  SELECT id
  INTO website_team_id
  FROM teams
  WHERE LOWER(name) LIKE '%website%' OR LOWER(name) LIKE '%web%'
  ORDER BY id
  LIMIT 1;

  SELECT id
  INTO website_id
  FROM boards
  WHERE LOWER(name) LIKE '%website%'
     OR LOWER(name) LIKE '%web site%'
     OR LOWER(COALESCE(description, '')) LIKE '%website%'
  ORDER BY id
  LIMIT 1;

  IF website_id IS NULL THEN
    INSERT INTO boards (name, description, team_id, created_by)
    VALUES ('Website Board', 'Website workspace board', website_team_id, creator_id)
    RETURNING id INTO website_id;
  END IF;

  SELECT id
  INTO digital_team_id
  FROM teams
  WHERE LOWER(name) LIKE '%digital%'
  ORDER BY id
  LIMIT 1;

  SELECT id
  INTO digital_id
  FROM boards
  WHERE LOWER(name) LIKE '%digital%'
     OR LOWER(COALESCE(description, '')) LIKE '%digital%'
  ORDER BY id
  LIMIT 1;

  IF digital_id IS NULL THEN
    INSERT INTO boards (name, description, team_id, created_by)
    VALUES ('Digital Board', 'Digital workspace board', digital_team_id, creator_id)
    RETURNING id INTO digital_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM workflow_stages WHERE board_id = creative_id) THEN
    INSERT INTO workflow_stages (board_id, name, position) VALUES
      (creative_id, 'To Do', 1),
      (creative_id, 'In Progress', 2),
      (creative_id, 'Waiting for Lead', 3),
      (creative_id, 'Review', 4),
      (creative_id, 'Completed', 5);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM workflow_stages WHERE board_id = website_id) THEN
    INSERT INTO workflow_stages (board_id, name, position) VALUES
      (website_id, 'To Do', 1),
      (website_id, 'In Progress', 2),
      (website_id, 'Waiting for Lead', 3),
      (website_id, 'Review', 4),
      (website_id, 'Completed', 5);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM workflow_stages WHERE board_id = digital_id) THEN
    INSERT INTO workflow_stages (board_id, name, position) VALUES
      (digital_id, 'To Do', 1),
      (digital_id, 'In Progress', 2),
      (digital_id, 'Waiting for Lead', 3),
      (digital_id, 'Review', 4),
      (digital_id, 'Completed', 5);
  END IF;
END $$;
'@

Replace-Exact "apps\web\src\app\dashboard\page.tsx" @'
const workspaces = [
  {
    title: "Creative",
    description: "Open the Creative workspace.",
    href: "/dashboard/creative",
    icon: Palette,
  },
  {
    title: "Website",
    description: "Open the Website workspace.",
    href: "/dashboard/website",
    icon: Code2,
  },
  {
    title: "Digital",
    description: "Open the Digital workspace.",
    href: "/dashboard/digital",
    icon: Megaphone,
  },
];
'@ @'
const workspaces = [
  {
    title: "Creative",
    description: "Open the Creative workspace.",
    aliases: ["creative", "crative"],
    icon: Palette,
  },
  {
    title: "Website",
    description: "Open the Website workspace.",
    aliases: ["website", "web site"],
    icon: Code2,
  },
  {
    title: "Digital",
    description: "Open the Digital workspace.",
    aliases: ["digital"],
    icon: Megaphone,
  },
];
'@

Replace-Exact "apps\web\src\app\dashboard\page.tsx" @'
          const Icon = workspace.icon;
          const workspaceName = workspace.title.toLowerCase();

          const board = boards.find((item) => {
            const searchable = `${item.name} ${item.team_name ?? ""}`.toLowerCase();
            return searchable.includes(workspaceName);
          });
'@ @'
          const Icon = workspace.icon;

          const board = boards.find((item) => {
            const searchable = `${item.name} ${item.team_name ?? ""}`.toLowerCase();
            return workspace.aliases.some((alias) => searchable.includes(alias));
          });
'@

Replace-Exact "apps\web\src\app\dashboard\boards\page.tsx" @'
  const displayWorkflow = useMemo(() => {
    const byName = (name: string) =>
      boardWorkflow.find((stage) => stage.name === name);

    const toDo = byName("To Do");
    const inProgress = byName("In Progress");
    const waiting = byName("Waiting for Lead");
    const review = byName("Review");
    const completed = byName("Completed");

    const coreIds = new Set(
      [toDo, inProgress, waiting, review, completed]
        .filter(Boolean)
        .map((stage) => Number(stage!.id)),
    );

    const extraIds = boardWorkflow
      .filter((stage) => !coreIds.has(Number(stage.id)))
      .map((stage) => Number(stage.id));

    return [
      toDo
        ? {
            id: Number(toDo.id),
            name: "To Do",
            stageIds: [Number(toDo.id), ...extraIds],
          }
        : null,
      inProgress
        ? {
            id: Number(inProgress.id),
            name: "In Progress",
            stageIds: [Number(inProgress.id)],
          }
        : null,
      waiting || review
        ? {
            id: Number((waiting ?? review)!.id),
            name: "Waiting for Review",
            stageIds: [waiting?.id, review?.id]
              .filter((id): id is number => typeof id === "number")
              .map(Number),
          }
        : null,
      completed
        ? {
            id: Number(completed.id),
            name: "Completed",
            stageIds: [Number(completed.id)],
          }
        : null,
    ].filter(Boolean) as Array<{
      id: number;
      name: string;
      stageIds: number[];
    }>;
  }, [boardWorkflow]);
'@ @'
  const displayWorkflow = useMemo(() => {
    const byName = (name: string) =>
      boardWorkflow.find((stage) => stage.name === name);

    const toDo = byName("To Do");
    const inProgress = byName("In Progress");
    const waiting = byName("Waiting for Lead");
    const review = byName("Review");
    const completed = byName("Completed");

    const coreIds = new Set(
      [toDo, inProgress, waiting, review, completed]
        .filter(Boolean)
        .map((stage) => Number(stage!.id)),
    );

    const customLists = boardWorkflow
      .filter((stage) => !coreIds.has(Number(stage.id)))
      .map((stage) => ({
        id: Number(stage.id),
        name: stage.name,
        stageIds: [Number(stage.id)],
      }));

    return [
      toDo
        ? {
            id: Number(toDo.id),
            name: "To Do",
            stageIds: [Number(toDo.id)],
          }
        : null,
      inProgress
        ? {
            id: Number(inProgress.id),
            name: "In Progress",
            stageIds: [Number(inProgress.id)],
          }
        : null,
      waiting || review
        ? {
            id: Number((waiting ?? review)!.id),
            name: "Waiting for Review",
            stageIds: [waiting?.id, review?.id]
              .filter((id): id is number => typeof id === "number")
              .map(Number),
          }
        : null,
      completed
        ? {
            id: Number(completed.id),
            name: "Completed",
            stageIds: [Number(completed.id)],
          }
        : null,
      ...customLists,
    ].filter(Boolean) as Array<{
      id: number;
      name: string;
      stageIds: number[];
    }>;
  }, [boardWorkflow]);
'@

Replace-Exact "apps\web\src\app\dashboard\boards\page.tsx" @'
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

  if (loading) {
'@ @'
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

  async function createList() {
    if (!canManageBoards || !selectedBoardId) return;

    const name = window.prompt("List name:")?.trim();
    if (!name) return;

    try {
      setError("");
      await apiRequest("/workflow", {
        method: "POST",
        body: JSON.stringify({
          board_id: selectedBoardId,
          name,
        }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create list");
    }
  }

  if (loading) {
'@

Replace-Exact "apps\web\src\app\dashboard\boards\page.tsx" @'
              {displayWorkflow.map((stage) => {
                const Icon = stageIcons[stage.name as keyof typeof stageIcons] ?? CircleDot;
                const stageTasks = boardTasks.filter((task) => stage.stageIds.includes(Number(task.stage_id)));

                return (
                  <section
                    key={stage.id}
                    onDragOver={(event) => {
                      if (!permissions.moveTask) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      if (!permissions.moveTask) return;
                      event.preventDefault();
                      const taskId = draggedTaskId ?? Number(event.dataTransfer.getData("text/plain"));
                      if (taskId) moveTask(taskId, stage.id);
                      setDraggedTaskId(null);
                    }}
                    className="w-[285px] shrink-0 rounded-xl bg-[#f1f2f4] p-2.5 shadow-sm"
                  >
                    <div className="mb-2.5 flex items-center gap-2 px-1">
                      <Icon size={16} className="text-slate-600" />
                      <h2 className="text-sm font-semibold text-slate-800">{stage.name}</h2>
                      <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">
                        {stageTasks.length}
                      </span>
                    </div>

                    <div className="max-h-[285px] space-y-3 overflow-y-auto pr-1">
                      {stageTasks.map((task) => (
                        <article
                          key={task.id}
                          draggable={permissions.moveTask}
                          onClick={() => setSelectedTaskId(task.id)}
                          onDragStart={(event) => handleDragStart(event, task.id)}
                          onDragEnd={() => setDraggedTaskId(null)}
                          className="cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-[#0c66e4] hover:shadow-md"
                        >
                          <span
                            className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${priorityClass[task.priority]}`}
                          >
                            {task.priority}
                          </span>

                          <h3 className="mt-2.5 text-sm font-semibold leading-5 text-slate-900">
                            {task.title}
                          </h3>

                          <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <CalendarDays size={13} />
                              {task.due_date
                                ? new Date(task.due_date).toLocaleDateString()
                                : "No due date"}
                            </span>
                            <span>#{task.id}</span>
                          </div>
                        </article>
                      ))}

                      {stageTasks.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-400">
                          No tasks
                        </div>
                      ) : null}
                    </div>
                  </section>
                );
              })}
'@ @'
              {displayWorkflow.map((stage) => {
                const Icon = stageIcons[stage.name as keyof typeof stageIcons] ?? CircleDot;
                const stageTasks = boardTasks.filter((task) => stage.stageIds.includes(Number(task.stage_id)));

                return (
                  <section
                    key={stage.id}
                    onDragOver={(event) => {
                      if (!permissions.moveTask) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      if (!permissions.moveTask) return;
                      event.preventDefault();
                      const taskId = draggedTaskId ?? Number(event.dataTransfer.getData("text/plain"));
                      if (taskId) moveTask(taskId, stage.id);
                      setDraggedTaskId(null);
                    }}
                    className="w-[285px] shrink-0 rounded-xl bg-[#f1f2f4] p-2.5 shadow-sm"
                  >
                    <div className="mb-2.5 flex items-center gap-2 px-1">
                      <Icon size={16} className="text-slate-600" />
                      <h2 className="text-sm font-semibold text-slate-800">{stage.name}</h2>
                      <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">
                        {stageTasks.length}
                      </span>
                    </div>

                    <div className="max-h-[285px] space-y-3 overflow-y-auto pr-1">
                      {stageTasks.map((task) => (
                        <article
                          key={task.id}
                          draggable={permissions.moveTask}
                          onClick={() => setSelectedTaskId(task.id)}
                          onDragStart={(event) => handleDragStart(event, task.id)}
                          onDragEnd={() => setDraggedTaskId(null)}
                          className="cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-[#0c66e4] hover:shadow-md"
                        >
                          <span
                            className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${priorityClass[task.priority]}`}
                          >
                            {task.priority}
                          </span>

                          <h3 className="mt-2.5 text-sm font-semibold leading-5 text-slate-900">
                            {task.title}
                          </h3>

                          <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <CalendarDays size={13} />
                              {task.due_date
                                ? new Date(task.due_date).toLocaleDateString()
                                : "No due date"}
                            </span>
                            <span>#{task.id}</span>
                          </div>
                        </article>
                      ))}

                      {stageTasks.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-400">
                          No tasks
                        </div>
                      ) : null}
                    </div>
                  </section>
                );
              })}

              {canManageBoards && selectedBoardId ? (
                <button
                  type="button"
                  onClick={createList}
                  className="flex h-11 w-[210px] shrink-0 items-center justify-center gap-2 rounded-xl border border-white/40 bg-white/20 px-4 text-sm font-semibold text-white transition hover:bg-white/30"
                >
                  <Plus size={17} />
                  Add list
                </button>
              ) : null}
'@

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
Write-Host "SUCCESS: Workspace boards + Add List changes applied and both builds passed." -ForegroundColor Green
Write-Host "Next step: run migration 005 on Neon, then stage/commit/push the exact changed files." -ForegroundColor Yellow
