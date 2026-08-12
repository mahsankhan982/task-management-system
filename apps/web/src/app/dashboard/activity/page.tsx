"use client";

import {
  Activity,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  Search,
  UserRoundPlus,
} from "lucide-react";
import { useMemo, useState } from "react";

type ActivityType = "Task" | "Comment" | "Assignment" | "Workflow";

type ActivityItem = {
  id: number;
  type: ActivityType;
  actor: string;
  initials: string;
  action: string;
  task: string;
  team: string;
  time: string;
};

const items: ActivityItem[] = [
  {
    id: 1,
    type: "Workflow",
    actor: "Ali Khan",
    initials: "AK",
    action: "moved a task from To Do to In Progress",
    task: "Prepare September campaign brief",
    team: "Marketing",
    time: "5 min ago",
  },
  {
    id: 2,
    type: "Comment",
    actor: "Sara Ahmed",
    initials: "SA",
    action: "added a comment",
    task: "Homepage responsive implementation",
    team: "Web Development",
    time: "18 min ago",
  },
  {
    id: 3,
    type: "Assignment",
    actor: "Muhammad Khan",
    initials: "MK",
    action: "assigned a task to Hina Malik",
    task: "Final brochure copy review",
    team: "Content",
    time: "42 min ago",
  },
  {
    id: 4,
    type: "Task",
    actor: "Usman Raza",
    initials: "UR",
    action: "created a new task",
    task: "August content calendar review",
    team: "Marketing",
    time: "1 hr ago",
  },
  {
    id: 5,
    type: "Workflow",
    actor: "Hassan Mir",
    initials: "HM",
    action: "moved a task to Waiting for Lead",
    task: "SEO keyword research approval",
    team: "SEO",
    time: "2 hrs ago",
  },
  {
    id: 6,
    type: "Task",
    actor: "Maha Ali",
    initials: "MA",
    action: "marked a task as completed",
    task: "Social media launch artwork",
    team: "Graphic Design",
    time: "3 hrs ago",
  },
];

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

export default function ActivityPage() {
  const [filter, setFilter] = useState<Filter>("All");
  const [query, setQuery] = useState("");

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
  }, [filter, query]);

  return (
    <div className="min-h-full bg-gradient-to-br from-violet-50/80 via-white to-slate-50 p-5 md:p-8">
      <div className="mx-auto w-full max-w-[1450px]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-500">
              Workspace activity
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#24193f]">
              Activity
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Track task creation, assignments, comments and workflow changes across the workspace.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 self-start rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm">
            <Activity size={16} className="text-violet-600" />
            Live activity feed
          </div>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Recent activities" value={items.length} />
          <Stat label="Workflow changes" value={items.filter((x) => x.type === "Workflow").length} />
          <Stat label="Comments" value={items.filter((x) => x.type === "Comment").length} />
          <Stat label="Assignments" value={items.filter((x) => x.type === "Assignment").length} />
        </div>

        <section className="mt-7 overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-[0_10px_30px_rgba(50,35,90,0.08)]">
          <div className="border-b border-violet-100 p-4 md:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#24193f]">Recent activity</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Latest changes made by workspace members.
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
            {visibleItems.map((item) => (
              <article
                key={item.id}
                className="flex flex-col gap-4 px-5 py-5 transition hover:bg-violet-50/35 md:flex-row md:items-center"
              >
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#654bb0] to-[#45327d] text-xs font-semibold text-white shadow-sm">
                    {item.initials}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{item.actor}</p>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${badge[item.type]}`}>
                        <TypeIcon type={item.type} />
                        {item.type}
                      </span>
                    </div>

                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.action}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-[#5e46a3]">{item.task}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-400">{item.team}</span>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 text-xs text-slate-400">{item.time}</div>
              </article>
            ))}

            {visibleItems.length === 0 && (
              <div className="px-6 py-14 text-center">
                <p className="text-sm font-medium text-slate-700">No activity found.</p>
                <p className="mt-1 text-xs text-slate-400">
                  Try another filter or search term.
                </p>
              </div>
            )}
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
