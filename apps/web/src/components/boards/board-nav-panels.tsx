"use client";

import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Inbox,
  Search,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import RealTaskModal from "@/components/tasks/real-task-modal";
import { useRole } from "@/contexts/role-context";
import { apiRequest } from "@/lib/api";

type Board = {
  id: number;
  name: string;
  team_name: string | null;
};

type Assignee = {
  id: number;
  full_name: string;
  email: string;
  role: string;
};

type Task = {
  id: number;
  board_id: number;
  title: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  due_date: string | null;
  board_name: string;
  stage_name: string;
  assignees?: Assignee[];
};

const priorityClass: Record<Task["priority"], string> = {
  Critical: "border-red-200 bg-red-50 text-red-700",
  High: "border-orange-200 bg-orange-50 text-orange-700",
  Medium: "border-blue-200 bg-blue-50 text-blue-700",
  Low: "border-slate-200 bg-slate-100 text-slate-600",
};

function dueDateOnly(value: string | null) {
  if (!value) return null;

  const raw = value.slice(0, 10);
  const date = new Date(`${raw}T00:00:00`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function localDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function formatDue(value: string | null) {
  const date = dueDateOnly(value);
  return date ? date.toLocaleDateString() : "No due date";
}

function TaskRow({
  task,
  onOpen,
}: {
  task: Task;
  onOpen: (taskId: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-violet-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            {task.title}
          </p>

          <p className="mt-1 truncate text-xs text-slate-500">
            {task.board_name} · {task.stage_name}
          </p>
        </div>

        <span
          className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${
            priorityClass[task.priority]
          }`}
        >
          {task.priority}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <CalendarDays size={13} />
          {formatDue(task.due_date)}
        </span>

        <span>#{task.id}</span>
      </div>
    </button>
  );
}

function PlannerSection({
  title,
  items,
  tone,
  onOpen,
}: {
  title: string;
  items: Task[];
  tone: "red" | "blue" | "slate";
  onOpen: (taskId: number) => void;
}) {
  const headingClass =
    tone === "red"
      ? "text-red-700"
      : tone === "blue"
        ? "text-blue-700"
        : "text-slate-700";

  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h3
          className={`text-xs font-bold uppercase tracking-wide ${headingClass}`}
        >
          {title}
        </h3>

        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-400">
          No tasks here.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((task) => (
            <TaskRow key={task.id} task={task} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function BoardNavPanels({
  boards,
  selectedBoardId,
  onSelectBoard,
}: {
  boards: Board[];
  selectedBoardId: number | null;
  onSelectBoard: (id: number) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useRole();

  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  const view = searchParams.get("view") ?? "board";
  const switchOpen = searchParams.get("switch") === "1";
  const taskFromUrl = searchParams.get("task");

  const taskIdFromUrl = useMemo(() => {
    if (!taskFromUrl) return null;

    const taskId = Number(taskFromUrl);

    return Number.isInteger(taskId) && taskId > 0 ? taskId : null;
  }, [taskFromUrl]);

  const activeTaskId = selectedTaskId ?? taskIdFromUrl;

  const filteredBoards = useMemo(() => {
    const q = query.trim().toLowerCase();

    return q
      ? boards.filter((board) => board.name.toLowerCase().includes(q))
      : boards;
  }, [boards, query]);

  const loadTasks = useCallback(async () => {
    try {
      setPanelLoading(true);
      setPanelError("");

      const response = await apiRequest<{
        success: boolean;
        data: Task[];
      }>("/tasks");

      setTasks(response.data ?? []);
    } catch (err) {
      setPanelError(
        err instanceof Error ? err.message : "Unable to load task data",
      );
    } finally {
      setPanelLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view !== "inbox" && view !== "planner") return;

    void Promise.resolve().then(() => loadTasks());
  }, [view, loadTasks]);

  const myTasks = useMemo(
    () =>
      tasks
        .filter((task) =>
          (task.assignees ?? []).some(
            (assignee) => Number(assignee.id) === Number(user.id),
          ),
        )
        .sort((a, b) => {
          if (a.stage_name === "Completed" && b.stage_name !== "Completed") {
            return 1;
          }

          if (a.stage_name !== "Completed" && b.stage_name === "Completed") {
            return -1;
          }

          const aDate =
            dueDateOnly(a.due_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const bDate =
            dueDateOnly(b.due_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;

          return aDate - bDate;
        }),
    [tasks, user.id],
  );

  const inboxTasks = useMemo(
    () => myTasks.filter((task) => task.stage_name !== "Completed"),
    [myTasks],
  );

  const planner = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayKey = localDateKey(today);

    const dated = myTasks.filter(
      (task) =>
        task.stage_name !== "Completed" && dueDateOnly(task.due_date),
    );

    const overdue: Task[] = [];
    const todayTasks: Task[] = [];
    const upcoming: Task[] = [];

    dated.forEach((task) => {
      const date = dueDateOnly(task.due_date);
      if (!date) return;

      const key = localDateKey(date);

      if (key === todayKey) {
        todayTasks.push(task);
      } else if (date.getTime() < today.getTime()) {
        overdue.push(task);
      } else {
        upcoming.push(task);
      }
    });

    return {
      overdue,
      todayTasks,
      upcoming,
    };
  }, [myTasks]);

  function closePanel() {
    router.push("/dashboard/boards?view=board");
  }

  function openTask(taskId: number) {
    setSelectedTaskId(taskId);
  }

  function closeTask() {
    setSelectedTaskId(null);

    if (taskIdFromUrl) {
      router.push("/dashboard/boards?view=board");
    }
  }

  return (
    <>
      {view === "inbox" || view === "planner" ? (
        <aside className="fixed bottom-0 left-0 top-14 z-[70] w-[380px] max-w-[92vw] overflow-hidden border-r border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 p-4">
            <div className="flex items-center gap-2">
              {view === "planner" ? (
                <CalendarDays size={18} />
              ) : (
                <Inbox size={18} />
              )}

              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {view === "planner" ? "Planner" : "Inbox"}
                </h2>

                <p className="text-xs text-slate-500">
                  {view === "planner"
                    ? "Your assigned tasks by due date"
                    : "Open tasks assigned to you"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={closePanel}
              className="rounded-lg p-2 hover:bg-slate-100"
            >
              <X size={17} />
            </button>
          </div>

          <div className="h-[calc(100vh-7.5rem)] overflow-y-auto p-4 pb-24">
            {panelLoading ? (
              <div className="rounded-xl border bg-slate-50 p-5 text-sm text-slate-500">
                Loading tasks...
              </div>
            ) : panelError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {panelError}
              </div>
            ) : view === "planner" ? (
              <>
                <div className="mb-5 rounded-xl bg-violet-50 p-4">
                  <div className="flex items-center gap-2 text-violet-700">
                    <Clock3 size={17} />
                    <span className="text-sm font-semibold">My Planner</span>
                  </div>

                  <p className="mt-2 text-xs leading-5 text-violet-700/80">
                    Tasks with due dates are grouped into overdue, today and
                    upcoming.
                  </p>
                </div>

                <PlannerSection
                  title="Overdue"
                  items={planner.overdue}
                  tone="red"
                  onOpen={openTask}
                />

                <PlannerSection
                  title="Today"
                  items={planner.todayTasks}
                  tone="blue"
                  onOpen={openTask}
                />

                <PlannerSection
                  title="Upcoming"
                  items={planner.upcoming}
                  tone="slate"
                  onOpen={openTask}
                />
              </>
            ) : inboxTasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <CheckCircle2
                  className="mx-auto text-emerald-500"
                  size={30}
                />

                <p className="mt-3 text-sm font-semibold text-slate-700">
                  Inbox is clear
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  When a task is assigned to you, it will appear here
                  automatically.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Assigned to me
                  </span>

                  <span className="rounded-full bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700">
                    {inboxTasks.length}
                  </span>
                </div>

                {inboxTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onOpen={openTask}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>
      ) : null}

      {switchOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Switch boards
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Select the board you want to open.
                </p>
              </div>

              <button
                type="button"
                onClick={closePanel}
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <X size={17} />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-xl border bg-slate-50 px-3">
              <Search size={16} className="text-slate-400" />

              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your boards"
                className="h-11 w-full bg-transparent text-sm outline-none"
              />
            </div>

            <div className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {filteredBoards.length === 0 ? (
                <div className="rounded-xl border border-dashed p-5 text-center text-sm text-slate-500">
                  No boards found.
                </div>
              ) : (
                filteredBoards.map((board) => (
                  <button
                    key={board.id}
                    type="button"
                    onClick={() => {
                      onSelectBoard(board.id);
                      router.push("/dashboard/boards?view=board");
                    }}
                    className={`w-full rounded-xl border p-3 text-left transition hover:border-[#0c66e4] ${
                      board.id === selectedBoardId
                        ? "border-[#0c66e4] bg-blue-50"
                        : "border-slate-200"
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {board.name}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {board.team_name ?? "No team"}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {activeTaskId ? (
        <RealTaskModal
          taskId={activeTaskId}
          onClose={closeTask}
          onChanged={loadTasks}
        />
      ) : null}
    </>
  );
}
