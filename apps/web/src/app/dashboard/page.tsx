"use client";

import Link from "next/link";
import { Code2, Megaphone, Palette } from "lucide-react";

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

export default function DashboardPage() {
  return (
    <div className="min-h-full w-full bg-gradient-to-br from-[#64499a] via-[#a85dbd] to-[#d46bb6] p-5 md:p-8">
      <section className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-100">
          Live Workspace
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Dashboard</h1>
        <p className="mt-2 text-sm text-white/80">
          Select the workspace you want to manage.
        </p>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        {workspaces.map((workspace) => {
          const Icon = workspace.icon;

          return (
            <Link
              key={workspace.title}
              href={workspace.href}
              className="group min-h-[170px] rounded-2xl border border-white/40 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-violet-300 hover:shadow-xl"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-700 transition group-hover:bg-violet-700 group-hover:text-white">
                <Icon size={21} />
              </div>

              <h2 className="mt-7 text-xl font-semibold text-slate-950">
                {workspace.title}
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                {workspace.description}
              </p>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
