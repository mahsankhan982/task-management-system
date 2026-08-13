"use client";

import Link from "next/link";
import { Activity, CheckCircle2, CircleDot, Clock3, ListTodo, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Task = {
  id: number | string;
  stage_name: string;
};

type Team = {
  id: number | string;
};

type ApiList<T> = {
  data: T[];
};

export default function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [activityCount, setActivityCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.tasks(), api.teams(), api.activity()])
      .then(([taskResult, teamResult, activityResult]) => {
        setTasks((taskResult as ApiList<Task>).data ?? []);
        setTeams((teamResult as ApiList<Team>).data ?? []);
        setActivityCount((activityResult as ApiList<unknown>).data?.length ?? 0);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  const stats = [
    { label: "Total Tasks", value: tasks.length, icon: ListTodo },
    {
      label: "In Progress",
      value: tasks.filter((task) => task.stage_name === "In Progress").length,
      icon: CircleDot,
    },
    {
      label: "Waiting for Lead",
      value: tasks.filter((task) => task.stage_name === "Waiting for Lead").length,
      icon: Clock3,
    },
    {
      label: "Completed",
      value: tasks.filter((task) => task.stage_name === "Completed").length,
      icon: CheckCircle2,
    },
  ];

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">Loading dashboard...</div>;
  }

  return (
    <div className="mx-auto max-w-[1500px] p-5 md:p-8">
      <section className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">
          Live Workspace
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Dashboard</h1>
        <p className="mt-2 text-sm text-slate-500">
          Real task, team and activity data from PostgreSQL.
        </p>
      </section>

      {error ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <article key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <Icon size={19} className="text-violet-700" />
              <p className="mt-5 text-3xl font-semibold text-slate-950">{stat.value}</p>
              <p className="mt-1 text-sm font-medium text-slate-600">{stat.label}</p>
            </article>
          );
        })}
      </section>

      <section className="mt-7 grid gap-4 md:grid-cols-3">
        <Link href="/dashboard/boards" className="rounded-2xl border bg-white p-5 shadow-sm hover:border-violet-300">
          <ListTodo size={19} className="text-violet-700" />
          <p className="mt-4 font-semibold text-slate-950">Boards</p>
          <p className="mt-1 text-sm text-slate-500">Open tasks and workflow.</p>
        </Link>

        <Link href="/dashboard/teams" className="rounded-2xl border bg-white p-5 shadow-sm hover:border-violet-300">
          <Users size={19} className="text-violet-700" />
          <p className="mt-4 text-2xl font-semibold text-slate-950">{teams.length}</p>
          <p className="mt-1 text-sm text-slate-500">Teams in workspace</p>
        </Link>

        <Link href="/dashboard/activity" className="rounded-2xl border bg-white p-5 shadow-sm hover:border-violet-300">
          <Activity size={19} className="text-violet-700" />
          <p className="mt-4 text-2xl font-semibold text-slate-950">{activityCount}</p>
          <p className="mt-1 text-sm text-slate-500">Recorded activities</p>
        </Link>
      </section>
    </div>
  );
}
