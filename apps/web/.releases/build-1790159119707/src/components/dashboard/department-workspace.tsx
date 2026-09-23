"use client";

import Link from "next/link";
import { ArrowLeft, LayoutDashboard, ListTodo } from "lucide-react";

type Props = {
  title: string;
  description: string;
};

export default function DepartmentWorkspace({ title, description }: Props) {
  return (
    <div className="min-h-full w-full bg-gradient-to-br from-[#64499a] via-[#a85dbd] to-[#d46bb6] p-5 md:p-8">
      <section className="mb-7 flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#5b3f88]/90 p-6 text-white shadow-lg md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-200">
            Workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm text-white/75">{description}</p>
        </div>

        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/15 px-4 text-sm font-semibold text-white transition hover:bg-white/25"
        >
          <ArrowLeft size={16} />
          Dashboard
        </Link>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <Link
          href="/dashboard/boards"
          className="rounded-2xl border bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-violet-300 hover:shadow-lg"
        >
          <ListTodo size={22} className="text-violet-700" />
          <h2 className="mt-5 text-lg font-semibold text-slate-950">
            Task Board
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Open tasks, workflow and assignments for this workspace.
          </p>
        </Link>

        <Link
          href="/dashboard"
          className="rounded-2xl border bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-violet-300 hover:shadow-lg"
        >
          <LayoutDashboard size={22} className="text-violet-700" />
          <h2 className="mt-5 text-lg font-semibold text-slate-950">
            Main Dashboard
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Return to Creative, Website and Digital workspace selection.
          </p>
        </Link>
      </section>
    </div>
  );
}
