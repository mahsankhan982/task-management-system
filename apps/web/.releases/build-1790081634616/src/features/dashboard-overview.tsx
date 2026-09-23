import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Clock3,
  FolderKanban,
  ListTodo,
  Users,
} from "lucide-react";

import {
  dashboardStats,
  recentBoards,
  recentTasks,
} from "@/data/dashboard";

const statIcons = [
  ListTodo,
  CircleDot,
  Clock3,
  CheckCircle2,
];

const priorityStyles = {
  Critical: "bg-red-50 text-red-700 border-red-100",
  High: "bg-orange-50 text-orange-700 border-orange-100",
  Medium: "bg-blue-50 text-blue-700 border-blue-100",
  Low: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function DashboardOverview() {
  return (
    <div className="mx-auto max-w-[1500px] p-5 md:p-8">
      <div className="mb-8">
        <p className="text-sm text-slate-500">
          Monday, 11 August
        </p>

        <div className="mt-1 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950">
              Good morning, Manager
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Here&apos;s what&apos;s happening across your teams today.
            </p>
          </div>

          <button className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#101828] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">
            <span className="text-lg leading-none">+</span>
            Create Task
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {dashboardStats.map((stat, index) => {
          const Icon = statIcons[index];

          return (
            <div
              key={stat.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <Icon size={19} strokeWidth={1.8} />
                </div>

                <ArrowUpRight
                  size={17}
                  className="text-slate-300"
                />
              </div>

              <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-950">
                {stat.value}
              </p>

              <p className="mt-1 text-sm font-medium text-slate-700">
                {stat.label}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                {stat.change}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        {/* Recent Tasks */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
            <div>
              <h3 className="font-semibold text-slate-950">
                Recent Tasks
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Latest work across your boards
              </p>
            </div>

            <button className="text-sm font-medium text-blue-600">
              View all
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {recentTasks.map((task) => (
              <div
                key={task.id}
                className="flex flex-col gap-4 px-6 py-5 transition hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityStyles[task.priority]}`}
                    >
                      {task.priority}
                    </span>

                    <span className="text-xs text-slate-400">
                      {task.status}
                    </span>
                  </div>

                  <h4 className="mt-2 truncate text-sm font-semibold text-slate-900">
                    {task.title}
                  </h4>

                  <p className="mt-1 text-xs text-slate-400">
                    {task.board}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                  <CalendarDays size={15} />
                  {task.dueDate}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Boards */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h3 className="font-semibold text-slate-950">
              Recent Boards
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Teams you work with
            </p>
          </div>

          <div className="space-y-3">
            {recentBoards.map((board) => (
              <button
                key={board.id}
                className="group flex w-full items-center gap-4 rounded-xl border border-slate-100 p-4 text-left transition hover:border-slate-200 hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <FolderKanban size={18} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {board.name}
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    {board.team}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-xs font-medium text-slate-700">
                    {board.taskCount} tasks
                  </p>

                  <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-slate-400">
                    <Users size={12} />
                    {board.members}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}