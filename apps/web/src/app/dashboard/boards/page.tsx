"use client";

import {
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Clock3,
  MessageSquare,
  Phone,
  Video,
  Pencil,
  Plus,
  Search,
  UserRound,
} from "lucide-react";
import type { DragEvent, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, apiRequest } from "@/lib/api";
import { useRole } from "@/contexts/role-context";
import { isTaskCreator } from "@/lib/permissions";
import RealTaskModal from "@/components/tasks/real-task-modal";
import BoardNavPanels from "@/components/boards/board-nav-panels";

type Priority = "Critical" | "High" | "Medium" | "Low";

type Board = {
  id: number;
  name: string;
  description: string | null;
  team_id: number | null;
  team_name: string | null;
};

type Team = {
  id: number;
  name: string;
};

type WorkflowStage = {
  id: number;
  name: string;
  position: number;
  board_id?: number;
};

type Task = {
  id: number;
  board_id: number;
  stage_id: number;
  title: string;
  description: string | null;
  priority: Priority;
  due_date: string | null;
  board_name: string;
  stage_name: string;
  created_by: number | null;
  created_by_name: string | null;
  assignees: Array<{ id: number; full_name: string }>;
};

const stageIcons = {
  "To Do": CircleDot,
  "In Progress": Clock3,
  "Waiting for Review": MessageSquare,
  Review: MessageSquare,
  Completed: CheckCircle2,
} as const;

const priorityClass: Record<Priority, string> = {
  Critical: "bg-red-50 text-red-700 border-red-200",
  High: "bg-red-50 text-red-700 border-red-200",
  Medium: "bg-yellow-50 text-yellow-700 border-yellow-200",
  Low: "bg-green-50 text-green-700 border-green-200",
};

const priorityBorderClass: Record<Priority, string> = {
  Critical: "border-l-red-500",
  High: "border-l-red-400",
  Medium: "border-l-yellow-400",
  Low: "border-l-green-400",
};

// Older boards still label the review column "Review" or "Waiting for Lead".
function normalizeStageName(name: string) {
  return ["Review", "Waiting for Lead"].includes(name) ? "Waiting for Review" : name;
}

// Stages an assignee may drag their task into, per stage it sits in now. The
// flow moves forward one step at a time and back to any earlier stage.
// Completed is missing on purpose: only a Team Lead, Manager or Coordinator
// puts a task there.
const assigneeStageMoves: Record<string, string[]> = {
  "To Do": ["In Progress"],
  "In Progress": ["To Do", "Waiting for Review"],
  "Waiting for Review": ["To Do", "In Progress"],
};

const COMPLETED_BY_LEAD_MESSAGE =
  "Only a Team Lead, Manager or Coordinator can move a task to Completed";

export default function BoardsPage() {
  const getDueState = (task: Task) => {
    if (!task.due_date || task.stage_name === "Completed") return "normal";
    const due = String(task.due_date).slice(0, 10);
    const now = new Date();
    const today = now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0");
    if (due < today) return "overdue";
    if (due === today) return "today";
    return "normal";
  };

  const searchParams = useSearchParams();
  const requestedBoardId = Number(searchParams.get("boardId"));
  const requestedTaskId = Number(searchParams.get("task"));

  const { permissions, role, user } = useRole();
  const canManageBoards = role !== "Team Member";
  const [boards, setBoards] = useState<Board[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowStage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedTaskInitialEdit, setSelectedTaskInitialEdit] = useState(false);

  async function loadData() {
    try {
      const [boardsResponse, tasksResponse, workflowResponse, teamsResponse] = (await Promise.all([
        api.boards(),
        api.tasks(),
        api.workflow(),
        api.teams(),
      ])) as [
        { success: boolean; data: Board[] },
        { success: boolean; data: Task[] },
        { success: boolean; data: WorkflowStage[] },
        { success: boolean; data: Team[] },
      ];

      const nextBoards = (boardsResponse.data ?? []).map((board) => ({
        ...board,
        id: Number(board.id),
        team_id: board.team_id === null ? null : Number(board.team_id),
      }));

      const nextTeams = (teamsResponse.data ?? []).map((team) => ({
        ...team,
        id: Number(team.id),
      }));

      const nextTasks = (tasksResponse.data ?? []).map((task) => ({
        ...task,
        id: Number(task.id),
        board_id: Number(task.board_id),
        stage_id: Number(task.stage_id),
        created_by: task.created_by === null || task.created_by === undefined
          ? null
          : Number(task.created_by),
      }));

      const nextWorkflow = (workflowResponse.data ?? [])
        .map((stage) => ({
          ...stage,
          id: Number(stage.id),
          board_id:
            stage.board_id === undefined
              ? undefined
              : Number(stage.board_id),
          position: Number(stage.position),
        }))
        .sort((a, b) => a.position - b.position);

      setError("");
      setBoards(nextBoards);
      setTeams(nextTeams);
      setTasks(nextTasks);
      setWorkflow(nextWorkflow);

      const requestedTask =
        Number.isFinite(requestedTaskId) && requestedTaskId > 0
          ? nextTasks.find((task) => Number(task.id) === requestedTaskId)
          : undefined;

      setSelectedBoardId((current) => {
        if (
          requestedTask &&
          nextBoards.some(
            (board) => Number(board.id) === Number(requestedTask.board_id),
          )
        ) {
          return Number(requestedTask.board_id);
        }

        if (
          Number.isFinite(requestedBoardId) &&
          requestedBoardId > 0 &&
          nextBoards.some((board) => Number(board.id) === requestedBoardId)
        ) {
          return requestedBoardId;
        }

        if (current && nextBoards.some((board) => Number(board.id) === Number(current))) {
          return Number(current);
        }

        return nextBoards[0]?.id ?? null;
      });

      if (requestedTask) {
        setSelectedTaskInitialEdit(false);
        setSelectedTaskId(Number(requestedTask.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load board data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadData());
  }, [requestedBoardId, requestedTaskId]);

  const selectedBoard = boards.find((board) => board.id === selectedBoardId);

  const boardWorkflow = useMemo(
    () =>
      workflow
        .filter(
          (stage) =>
            stage.board_id === undefined ||
            Number(stage.board_id) === Number(selectedBoardId),
        )
        .sort((a, b) => a.position - b.position),
    [workflow, selectedBoardId],
  );

  const displayWorkflow = useMemo(() => {
    const byName = (name: string) =>
      boardWorkflow.find((stage) => stage.name === name);

    const toDo = byName("To Do");
    const inProgress = byName("In Progress");
    const waiting = byName("Waiting for Review");
    const review = byName("Review");
    const waitingForLead = byName("Waiting for Lead");
    const completed = byName("Completed");

    const coreIds = new Set(
      [toDo, inProgress, waiting, review, waitingForLead, completed]
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
      waiting || review || waitingForLead
        ? {
            id: Number((waiting ?? review ?? waitingForLead)!.id),
            name: "Waiting for Review",
            stageIds: [waiting?.id, review?.id, waitingForLead?.id]
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

  // A Team Member cannot put a task in Completed, so the create form does not
  // offer it to them.
  const creatableWorkflow = useMemo(
    () =>
      role === "Team Member"
        ? displayWorkflow.filter((stage) => stage.name !== "Completed")
        : displayWorkflow,
    [displayWorkflow, role],
  );


  const assigneeOptions = useMemo(() => {
    const map = new Map<number, string>();
    tasks.forEach((task) => {
      task.assignees?.forEach((assignee) => {
        map.set(Number(assignee.id), assignee.full_name);
      });
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [tasks]);

  const boardTasks = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (task.board_id !== selectedBoardId) return false;
      if (assigneeFilter && !task.assignees?.some((a) => String(a.id) === assigneeFilter)) return false;
      if (!clean) return true;
      return (
        task.title.toLowerCase().includes(clean) ||
        task.priority.toLowerCase().includes(clean) ||
        task.stage_name.toLowerCase().includes(clean)
      );
    });
  }, [tasks, selectedBoardId, query, assigneeFilter]);

  async function moveTask(taskId: number, stageId: number) {
    const task = tasks.find((item) => item.id === taskId);
    const targetStage = boardWorkflow.find((stage) => stage.id === stageId);
    if (!task || !targetStage) return;
    const targetStageName = normalizeStageName(targetStage.name);

    // Team Members only ever move tasks assigned to them, and only through the
    // status flow, whether or not they created the task.
    const followsStatusFlow = role === "Team Member";

    if (followsStatusFlow) {
      const assignedToMe = task.assignees?.some((a) => Number(a.id) === Number(user.id));
      if (!assignedToMe) { setError("You can only move tasks that are assigned to you"); return; }
      if (targetStageName === "Completed") { setError(COMPLETED_BY_LEAD_MESSAGE); return; }
      const allowedMoves = assigneeStageMoves[normalizeStageName(task.stage_name)] ?? [];
      if (!allowedMoves.includes(targetStageName)) {
        setError("");
        return;
      }
    } else if (!permissions.moveTask) return;

    const previous = tasks;
    setTasks((current) => current.map((item) => item.id === taskId ? { ...item, stage_id: stageId, stage_name: targetStageName } : item));
    try {
      if (followsStatusFlow) {
        await apiRequest(`/tasks/${taskId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ stage_name: targetStageName }),
        });
      } else {
        await apiRequest(`/tasks/${taskId}`, {
          method: "PATCH",
          body: JSON.stringify({ stage_id: stageId }),
        });
      }
      setError("");
    } catch (err) {
      setTasks(previous);
      setError(err instanceof Error ? err.message : "Unable to move task");
    }
  }

  function handleDragStart(event: DragEvent<HTMLElement>, taskId: number) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) { event.preventDefault(); return; }
    if (role === "Team Member") {
      const assignedToMe = task.assignees?.some((a) => Number(a.id) === Number(user.id));
      if (!assignedToMe) { event.preventDefault(); return; }
    } else if (!permissions.moveTask) { event.preventDefault(); return; }
    setDraggedTaskId(taskId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(taskId));
  }
  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBoardId) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const title = String(form.get("title") || "").trim();
    const priority = String(form.get("priority") || "Medium") as Priority;
    const stageId = Number(form.get("stage_id"));

    if (!title || !stageId) return;

    setCreating(true);
    setError("");

    try {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create task");
    } finally {
      setCreating(false);
    }
  }

  function chooseTeam(currentTeamId?: number | null) {
    if (teams.length === 0) {
      window.alert("Create a team first from the Teams page.");
      return undefined;
    }

    const choices = teams.map((team) => `${team.id}: ${team.name}`).join("\n");
    const raw = window.prompt(
      `Enter Team ID for this board:\n\n${choices}`,
      currentTeamId ? String(currentTeamId) : String(teams[0].id),
    );

    if (raw === null) return undefined;
    if (!raw.trim()) return null;

    const teamId = Number(raw);
    if (!Number.isFinite(teamId) || !teams.some((team) => Number(team.id) === teamId)) {
      window.alert("Invalid Team ID.");
      return undefined;
    }

    return teamId;
  }

  async function createBoard() {
    if (!permissions.moveTask) return;

    const name = window.prompt("Board name:")?.trim();
    if (!name) return;

    const description = window.prompt("Board description (optional):")?.trim() || null;
    const team_id = chooseTeam();
    if (team_id === undefined) return;

    try {
      setError("");
      const result = (await apiRequest("/boards", {
        method: "POST",
        body: JSON.stringify({ name, description, team_id }),
      })) as { data: Board };

      await loadData();
      if (result.data?.id) setSelectedBoardId(Number(result.data.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create board");
    }
  }

  async function editBoard(board: Board) {
    if (!permissions.moveTask) return;

    const name = window.prompt("Board name:", board.name)?.trim();
    if (!name) return;

    const description =
      window.prompt("Board description:", board.description ?? "")?.trim() || null;
    const team_id = chooseTeam(board.team_id);
    if (team_id === undefined) return;

    try {
      setError("");
      await apiRequest(`/boards/${board.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, description, team_id }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update board");
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
    return <div className="p-8 text-sm text-slate-500">Loading board...</div>;
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden bg-gradient-to-br from-[#64499a] via-[#a85dbd] to-[#d46bb6] p-3 md:p-4">
      <BoardNavPanels boards={boards} selectedBoardId={selectedBoardId} onSelectBoard={(id) => setSelectedBoardId(id)} />
      <div className="mx-auto flex min-h-0 w-full flex-1 flex-col max-w-none">
        <div className="mb-3 flex flex-col gap-3 rounded-xl border border-white/10 bg-[#5b3f88]/95 p-3 text-white shadow-lg backdrop-blur lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-200">
              Live Workspace
            </p>
            <h1 className="mt-1 text-xl font-bold text-white">
              {selectedBoard?.name ?? "Boards"}
            </h1>
            <p className="mt-1 text-xs text-white/70">
              {selectedBoard?.team_name ?? "No team"} Ãƒâ€šÃ‚Â· PostgreSQL data
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {canManageBoards ? (
              <button
                type="button"
                onClick={createBoard}
                className="flex items-center gap-2 rounded-md bg-white/15 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/25"
              >
                <Plus size={15} />
                New Board
              </button>
            ) : null}

            {selectedBoard && canManageBoards ? (
              <>
                <button
                  type="button"
                  onClick={() => editBoard(selectedBoard)}
                  className="flex items-center gap-2 rounded-md bg-white/15 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/25"
                >
                  <Pencil size={14} />
                  Edit Board
                </button>

              </>
            ) : null}

            {boards.map((board) => (
              <button
                key={board.id}
                type="button"
                onClick={() => setSelectedBoardId(board.id)}
                className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
                  board.id === selectedBoardId
                    ? "bg-white text-[#5b3f88] shadow-sm"
                    : "bg-white/15 text-white hover:bg-white/25"
                }`}
              >
                {board.name}
              </button>
            ))}


          </div>
        </div>


        {error ? (
          error.includes("Team Members cannot perform this action") ? (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3.5 text-sm font-medium text-violet-800 shadow-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                i
              </span>
              {error}
            </div>
          ) : (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )
        ) : null}

        {showCreate && permissions.createTask ? (
          <form
            onSubmit={handleCreateTask}
            className="mb-4 grid gap-3 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-[1fr_180px_220px_auto]"
          >
            <input
              name="title"
              required
              placeholder="Task title"
              className="h-11 rounded-xl border px-3 text-sm outline-none focus:border-violet-500"
            />
            <select
              name="priority"
              defaultValue="Medium"
              className="h-11 rounded-xl border px-3 text-sm"
            >
              <option>Critical</option>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
            <select
              name="stage_id"
              defaultValue={String(creatableWorkflow[0]?.id ?? "")}
              className="h-11 rounded-xl border px-3 text-sm"
            >
              {creatableWorkflow.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={creating}
              className="h-11 rounded-xl bg-violet-700 px-5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {creating ? "Creating..." : "Add Task"}
            </button>
          </form>
        ) : null}

        <div className="mb-3 flex items-center rounded-lg border border-white/30 bg-white/95 px-3 shadow-sm">
          <Search size={16} className="text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks..."
            className="h-11 w-full bg-transparent px-3 text-sm outline-none"
          />

          <div className="mb-3 flex items-center rounded-lg border border-white/30 bg-white/95 px-3 shadow-sm">
            <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className="h-11 w-full bg-transparent px-3 text-sm font-medium text-slate-700 outline-none">
              <option value="">All Employees / Assignees</option>
              {assigneeOptions.map(([id, name]) => (
                <option key={id} value={String(id)}>{name}</option>
              ))}
            </select>
          </div>
        </div>

        {boards.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-white p-12 text-center text-sm text-slate-500">
            No boards found in the database.
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-x-auto rounded-xl bg-black/10 p-2 pb-4">
            <div className="flex h-full min-w-max items-stretch gap-3">
              {displayWorkflow.map((stage) => {
                const Icon = stageIcons[stage.name as keyof typeof stageIcons] ?? CircleDot;
                const stageTasks = boardTasks.filter((task) => stage.stageIds.includes(Number(task.stage_id)));

                return (
                  <section
                    key={stage.id}
                    onDragOver={(event) => {
                      if (role !== "Team Member" && !permissions.moveTask) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      if (role !== "Team Member" && !permissions.moveTask) return;
                      event.preventDefault();
                      const taskId = draggedTaskId ?? Number(event.dataTransfer.getData("text/plain"));
                      if (taskId) moveTask(taskId, stage.id);
                      setDraggedTaskId(null);
                    }}
                    className="flex h-full max-h-full w-[285px] shrink-0 flex-col rounded-xl bg-[#f1f2f4] p-2.5 shadow-sm"
                  >
                    <div className="mb-2.5 flex items-center gap-2 px-1">
                      <Icon size={16} className="text-slate-600" />
                      <h2 className="text-sm font-semibold text-slate-800">{stage.name} ({stageTasks.length})</h2>
                    </div>

                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                      {stageTasks.map((task) => (
                        <article
                          key={task.id}
                          draggable={
                            role === "Team Member"
                              ? Boolean(task.assignees?.some((a) => Number(a.id) === Number(user.id)))
                              : permissions.moveTask
                          }
                          onClick={() => {
                            setSelectedTaskInitialEdit(false);
                            setSelectedTaskId(task.id);
                          }}
                          onDragStart={(event) => handleDragStart(event, task.id)}
                          onDragEnd={() => setDraggedTaskId(null)}
                          className={`cursor-pointer rounded-lg border border-l-4 p-3 shadow-sm transition hover:border-[#0c66e4] hover:shadow-md ${priorityBorderClass[task.priority]} ${getDueState(task) === "overdue" ? "!border-red-500 !bg-red-50" : getDueState(task) === "today" ? "!border-yellow-500 !bg-yellow-50" : "border-slate-200 bg-white"}`}
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${priorityClass[task.priority]}`}
                            >
                              {task.priority}
                            </span>

                            {isTaskCreator(user.id, task.created_by) ? (
                              <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700">
                                Created by you
                              </span>
                            ) : null}
                          </div>

                          <h3 className="mt-2.5 text-sm font-semibold leading-5 text-slate-900">
                            {task.title}
                          </h3>

                          {task.created_by_name && !isTaskCreator(user.id, task.created_by) ? (
                            <p className="mt-1.5 truncate text-[11px] text-slate-500">
                              Created by {task.created_by_name}
                            </p>
                          ) : null}

                          <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <CalendarDays size={13} />
                              {task.due_date
                                ? new Date(task.due_date).toLocaleDateString()
                                : "No due date"}
                            </span>
                            <div className="flex items-center gap-2">
                              {task.assignees?.length > 0 && (
                                <div className="flex -space-x-1.5">
                                  {task.assignees.map((a) => (
                                    <div key={a.id} className="flex items-center gap-1">
                                      <div title={a.full_name} className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
                                        {a.full_name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()}
                                      </div>
                                      <button type="button" onClick={(event) => { event.stopPropagation(); console.log("VOICE CALL CLICKED", Number(a.id)); window.dispatchEvent(new CustomEvent("taskmanager:start-call", { detail: { targetUserId: Number(a.id), type: "audio" } })); }} className="rounded-full p-1 text-slate-500 hover:bg-green-100 hover:text-green-600" title={"Voice call " + a.full_name}><Phone size={13} /></button>
                                      <button type="button" onClick={(event) => { event.stopPropagation(); console.log("VIDEO CALL CLICKED", Number(a.id)); window.dispatchEvent(new CustomEvent("taskmanager:start-call", { detail: { targetUserId: Number(a.id), type: "video" } })); }} className="rounded-full p-1 text-slate-500 hover:bg-blue-100 hover:text-blue-600" title={"Video call " + a.full_name}><Video size={13} /></button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <span>#{task.id}</span>
                            </div>
                          </div>
                        </article>
                      ))}

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
            </div>
          </div>
        )}

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
      </div>
    </div>
  );
}














