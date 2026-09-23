"use client";

import {
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  Search,
  UserRoundPlus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type Id = number | string;
type ActivityType = "Task" | "Comment" | "Assignment" | "Workflow";

type RawActivity = {
  id: Id;
  task_id: Id | null;
  user_id: Id | null;
  action: string;
  details: Record<string, unknown> | null;
  user_name: string | null;
  created_at: string;
};

type Task = {
  id: Id;
  title: string;
  board_id: Id;
};

type Board = {
  id: Id;
  name: string;
  team_id: Id;
};

type Team = {
  id: Id;
  name: string;
};

type ActivityItem = {
  id: Id;
  type: ActivityType;
  actor: string;
  initials: string;
  action: string;
  task: string;
  team: string;
  createdAt: string;
};

const filters = ["All", "Task", "Comment", "Assignment", "Workflow"] as const;
type Filter = (typeof filters)[number];

const badge: Record<ActivityType, string> = {
  Task: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Comment: "border-blue-200 bg-blue-50 text-blue-700",
  Assignment: "border-amber-200 bg-amber-50 text-amber-700",
  Workflow: "border-violet-200 bg-violet-50 text-violet-700",
};

function TypeIcon({ type }: { type: ActivityType }) {
  if (type === "Comment") return <MessageSquare size={14} />;
  if (type === "Assignment") return <UserRoundPlus size={14} />;
  if (type === "Workflow") return <RefreshCw size={14} />;
  return <CheckCircle2 size={14} />;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SY";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function activityType(entry: RawActivity): ActivityType {
  const action = entry.action.toLowerCase();
  if (action.includes("comment")) return "Comment";
  if (action.includes("assignee") || action.includes("assign")) return "Assignment";
  if (
    action.includes("workflow") ||
    action.includes("stage") ||
    (action === "task_updated" &&
      entry.details &&
      Object.prototype.hasOwnProperty.call(entry.details, "stage_id"))
  ) {
    return "Workflow";
  }
  return "Task";
}

function describe(entry: RawActivity) {
  const action = entry.action.toLowerCase();
  if (action === "task_created") return "created a new task";
  if (action === "task_deleted") return "deleted a task";
  if (action === "task_assignees_updated") return "updated task assignees";
  if (action.includes("comment")) return "added a comment";
  if (action.includes("label")) return "updated task labels";
  if (action.includes("stage") || action.includes("workflow")) return "changed task workflow";
  if (action === "task_updated") {
    const details = entry.details ?? {};
    const keys = Object.keys(details).filter(
      (key) => details[key] !== null && details[key] !== undefined,
    );
    if (keys.length === 1 && keys[0] === "stage_id") {
      return "moved the task to another workflow stage";
    }
    if (keys.includes("stage_id")) return "updated task details and workflow stage";
    if (keys.includes("priority")) return "updated task details and priority";
    return "updated task details";
  }
  return entry.action.replaceAll("_", " ");
}

function timeAgo(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;

  return date.toLocaleString();
}

export default function ActivityPage() {
  const [entries, setEntries] = useState<RawActivity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [filter, setFilter] = useState<Filter>("All");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function loadData() {
    try {
      const [activityResponse, taskResponse, boardResponse, teamResponse] =
        await Promise.all([api.activity(), api.tasks(), api.boards(), api.teams()]);
      setError("");

      setEntries(
        ((activityResponse as { success: boolean; data: RawActivity[] }).data ?? []),
      );
      setTasks(((taskResponse as { success: boolean; data: Task[] }).data ?? []));
      setBoards(((boardResponse as { success: boolean; data: Board[] }).data ?? []));
      setTeams(((teamResponse as { success: boolean; data: Team[] }).data ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load activity");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadData());
  }, []);

  const items = useMemo<ActivityItem[]>(() => {
    const taskMap = new Map(tasks.map((task) => [String(task.id), task]));
    const boardMap = new Map(boards.map((board) => [String(board.id), board]));
    const teamMap = new Map(teams.map((team) => [String(team.id), team]));

    return entries.map((entry) => {
      const task =
        entry.task_id == null ? undefined : taskMap.get(String(entry.task_id));
      const board = task ? boardMap.get(String(task.board_id)) : undefined;
      const team = board ? teamMap.get(String(board.team_id)) : undefined;
      const actor = entry.user_name || "System";
      const deletedTitle =
        entry.details && typeof entry.details.title === "string"
          ? entry.details.title
          : null;

      return {
        id: entry.id,
        type: activityType(entry),
        actor,
        initials: initials(actor),
        action: describe(entry),
        task:
          task?.title ||
          deletedTitle ||
          (entry.task_id ? `Task #${entry.task_id}` : "Workspace"),
        team: team?.name || board?.name || "Workspace",
        createdAt: entry.created_at,
      };
    });
  }, [entries, tasks, boards, teams]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesType = filter === "All" || item.type === filter;
      const matchesQuery =
        !q ||
        `${item.actor} ${item.action} ${item.task} ${item.team}`
          .toLowerCase()
          .includes(q);
      return matchesType && matchesQuery;
    });
  }, [filter, items, query]);

  return (
    <div className="min-h-full bg-gradient-to-br from-[#64499a] via-[#a85dbd] to-[#d46bb6] p-5 md:p-8">
      <div className="mx-auto w-full max-w-[1450px]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-100">
              Workspace activity
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
              Activity
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">
              Live task, assignment and workflow activity from PostgreSQL.
            </p>
          </div>

          <button
            type="button"
            onClick={() => { setRefreshing(true); void loadData(); }}
            disabled={refreshing}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm disabled:opacity-60"
          >
            <RefreshCw
              size={16}
              className={
                refreshing
                  ? "animate-spin text-violet-600"
                  : "text-violet-600"
              }
            />
            {refreshing ? "Refreshing..." : "Refresh activity"}
          </button>
        </div>

        {error ? (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Recent activities" value={items.length} />
          <Stat
            label="Workflow changes"
            value={items.filter((x) => x.type === "Workflow").length}
          />
          <Stat
            label="Comments"
            value={items.filter((x) => x.type === "Comment").length}
          />
          <Stat
            label="Assignments"
            value={items.filter((x) => x.type === "Assignment").length}
          />
        </div>

        <section className="mt-7 overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-[0_10px_30px_rgba(50,35,90,0.08)]">
          <div className="border-b border-violet-100 p-4 md:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#24193f]">
                  Recent activity
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Latest database activity, newest first.
                </p>
              </div>

              <div className="flex flex-col gap-3 md:flex-row">
                <div className="flex h-10 min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 md:w-[300px]">
                  <Search size={15} className="shrink-0 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search activity..."
                    className="w-full bg-transparent text-sm text-slate-700 outline-none"
                  />
                </div>

                <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1">
                  {filters.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setFilter(item)}
                      className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition ${
                        filter === item
                          ? "bg-[#5e46a3] text-white shadow-sm"
                          : "text-slate-600 hover:bg-white"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="px-6 py-14 text-center text-sm text-slate-500">
                Loading activity...
              </div>
            ) : (
              visibleItems.map((item) => (
                <article
                  key={String(item.id)}
                  className="flex flex-col gap-4 px-5 py-5 transition hover:bg-violet-50/35 md:flex-row md:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#654bb0] to-[#45327d] text-xs font-semibold text-white shadow-sm">
                      {item.initials}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {item.actor}
                        </p>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${badge[item.type]}`}
                        >
                          <TypeIcon type={item.type} />
                          {item.type}
                        </span>
                      </div>

                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {item.action}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-medium text-[#5e46a3]">
                          {item.task}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-400">{item.team}</span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 text-xs text-slate-400">
                    {timeAgo(item.createdAt)}
                  </div>
                </article>
              ))
            )}

            {!loading && visibleItems.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <p className="text-sm font-medium text-slate-700">
                  No activity found.
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Try another filter or search term.
                </p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-violet-100 bg-white p-5 shadow-[0_8px_24px_rgba(50,35,90,0.08)]">
      <p className="text-3xl font-semibold text-[#24193f]">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{label}</p>
    </div>
  );
}
