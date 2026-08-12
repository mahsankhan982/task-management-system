"use client";

import {
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Clock3,
  MessageSquare,
  Plus,
  Search,
  UserRound,
} from "lucide-react";
import type { DragEvent, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { api, apiRequest } from "@/lib/api";
import { useRole } from "@/contexts/role-context";
import RealTaskModal from "@/components/tasks/real-task-modal";

type Priority = "Critical" | "High" | "Medium" | "Low";

type Board = {
  id: number;
  name: string;
  description: string | null;
  team_id: number | null;
  team_name: string | null;
};

type WorkflowStage = {
  id: number;
  name: string;
  position: number;
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
};

const stageIcons = {
  "To Do": CircleDot,
  "In Progress": Clock3,
  "Waiting for Lead": UserRound,
  Review: MessageSquare,
  Completed: CheckCircle2,
} as const;

const priorityClass: Record<Priority, string> = {
  Critical: "bg-red-50 text-red-700 border-red-200",
  High: "bg-orange-50 text-orange-700 border-orange-200",
  Medium: "bg-blue-50 text-blue-700 border-blue-200",
  Low: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function BoardsPage() {
  const { permissions } = useRole();
  const [boards, setBoards] = useState<Board[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowStage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  async function loadData() {
    try {
      setError("");
      const [boardsResponse, tasksResponse, workflowResponse] = (await Promise.all([
        api.boards(),
        api.tasks(),
        api.workflow(),
      ])) as [
        { success: boolean; data: Board[] },
        { success: boolean; data: Task[] },
        { success: boolean; data: WorkflowStage[] },
      ];

      const nextBoards = boardsResponse.data ?? [];
      setBoards(nextBoards);
      setTasks(tasksResponse.data ?? []);
      setWorkflow((workflowResponse.data ?? []).sort((a, b) => a.position - b.position));

      setSelectedBoardId((current) => {
        if (current && nextBoards.some((board) => board.id === current)) return current;
        return nextBoards[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load board data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const selectedBoard = boards.find((board) => board.id === selectedBoardId);

  const boardTasks = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (task.board_id !== selectedBoardId) return false;
      if (!clean) return true;
      return (
        task.title.toLowerCase().includes(clean) ||
        task.priority.toLowerCase().includes(clean) ||
        task.stage_name.toLowerCase().includes(clean)
      );
    });
  }, [tasks, selectedBoardId, query]);

  async function moveTask(taskId: number, stageId: number) {
    if (!permissions.moveTask) return;

    const previous = tasks;
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              stage_id: stageId,
              stage_name: workflow.find((stage) => stage.id === stageId)?.name ?? task.stage_name,
            }
          : task,
      ),
    );

    try {
      await apiRequest(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ stage_id: stageId }),
      });
    } catch (err) {
      setTasks(previous);
      setError(err instanceof Error ? err.message : "Unable to move task");
    }
  }

  function handleDragStart(event: DragEvent<HTMLElement>, taskId: number) {
    if (!permissions.moveTask) return;
    setDraggedTaskId(taskId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(taskId));
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBoardId || !permissions.createTask) return;

    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    const priority = String(form.get("priority") || "Medium") as Priority;
    const stageId = Number(form.get("stage_id"));

    if (!title || !stageId) return;

    setCreating(true);
    setError("");

    try {
      await apiRequest("/tasks", {
        method: "POST",
        body: JSON.stringify({
          board_id: selectedBoardId,
          stage_id: stageId,
          title,
          priority,
        }),
      });

      event.currentTarget.reset();
      setShowCreate(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create task");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">Loading board...</div>;
  }

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-[#f3f5f9] p-4 md:p-6">
      <div className="mx-auto max-w-[1800px]">
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">
              Live Workspace
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">
              {selectedBoard?.name ?? "Boards"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {selectedBoard?.team_name ?? "No team"} · PostgreSQL data
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {boards.map((board) => (
              <button
                key={board.id}
                type="button"
                onClick={() => setSelectedBoardId(board.id)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                  board.id === selectedBoardId
                    ? "bg-violet-700 text-white"
                    : "border bg-white text-slate-700"
                }`}
              >
                {board.name}
              </button>
            ))}

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
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
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
              defaultValue={String(workflow[0]?.id ?? "")}
              className="h-11 rounded-xl border px-3 text-sm"
            >
              {workflow.map((stage) => (
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

        <div className="mb-4 flex items-center rounded-xl border bg-white px-3 shadow-sm">
          <Search size={16} className="text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks..."
            className="h-11 w-full bg-transparent px-3 text-sm outline-none"
          />
        </div>

        {boards.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-white p-12 text-center text-sm text-slate-500">
            No boards found in the database.
          </div>
        ) : (
          <div className="overflow-x-auto pb-3">
            <div className="flex min-w-max items-start gap-3">
              {workflow.map((stage) => {
                const Icon = stageIcons[stage.name as keyof typeof stageIcons] ?? CircleDot;
                const stageTasks = boardTasks.filter((task) => task.stage_id === stage.id);

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
                    className="w-[300px] shrink-0 rounded-xl bg-[#e9edf3] p-3"
                  >
                    <div className="mb-3 flex items-center gap-2 px-1">
                      <Icon size={16} className="text-slate-600" />
                      <h2 className="text-sm font-semibold text-slate-800">{stage.name}</h2>
                      <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">
                        {stageTasks.length}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {stageTasks.map((task) => (
                        <article
                          key={task.id}
                          draggable={permissions.moveTask}
                          onClick={() => setSelectedTaskId(task.id)}
                          onDragStart={(event) => handleDragStart(event, task.id)}
                          onDragEnd={() => setDraggedTaskId(null)}
                          className="cursor-pointer rounded-xl border bg-white p-4 shadow-sm transition hover:border-violet-300 hover:shadow-md"
                        >
                          <span
                            className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${priorityClass[task.priority]}`}
                          >
                            {task.priority}
                          </span>

                          <h3 className="mt-3 text-sm font-semibold leading-5 text-slate-900">
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
            </div>
          </div>
        )}

        {selectedTaskId ? (
          <RealTaskModal
            taskId={selectedTaskId}
            onClose={() => setSelectedTaskId(null)}
          />
        ) : null}
      </div>
    </div>
  );
}
