"use client";

import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDot,
  Clock3,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type Member = {
  id: number;
  name: string;
  initials: string;
  email: string;
  role: "Manager" | "Coordinator" | "Team Lead" | "Team Member";
  activeTasks: number;
};

type Team = {
  id: number;
  name: string;
  description: string;
  members: Member[];
};

const teams: Team[] = [
  {
    id: 1,
    name: "Marketing",
    description: "Campaigns, content planning and social media execution.",
    members: [
      { id: 1, name: "Muhammad Khan", initials: "MK", email: "manager@company.com", role: "Manager", activeTasks: 6 },
      { id: 2, name: "Usman Raza", initials: "UR", email: "usman@company.com", role: "Coordinator", activeTasks: 5 },
      { id: 3, name: "Ali Khan", initials: "AK", email: "ali@company.com", role: "Team Lead", activeTasks: 4 },
      { id: 4, name: "Sara Ahmed", initials: "SA", email: "sara@company.com", role: "Team Member", activeTasks: 3 },
    ],
  },
  {
    id: 2,
    name: "Web Development",
    description: "Frontend, backend and product implementation work.",
    members: [
      { id: 5, name: "Hamza Shah", initials: "HS", email: "hamza@company.com", role: "Team Lead", activeTasks: 7 },
      { id: 6, name: "Farhan Ali", initials: "FA", email: "farhan@company.com", role: "Team Member", activeTasks: 4 },
      { id: 7, name: "Areeba Noor", initials: "AN", email: "areeba@company.com", role: "Team Member", activeTasks: 3 },
    ],
  },
  {
    id: 3,
    name: "Graphic Design",
    description: "Brand, campaign and visual design production.",
    members: [
      { id: 8, name: "Maha Ali", initials: "MA", email: "maha@company.com", role: "Team Lead", activeTasks: 5 },
      { id: 9, name: "Hina Malik", initials: "HM", email: "hina@company.com", role: "Team Member", activeTasks: 4 },
      { id: 10, name: "Zain Raza", initials: "ZR", email: "zain@company.com", role: "Team Member", activeTasks: 2 },
    ],
  },
  {
    id: 4,
    name: "SEO",
    description: "Search strategy, content optimization and reporting.",
    members: [
      { id: 11, name: "Hassan Mir", initials: "HM", email: "hassan@company.com", role: "Team Lead", activeTasks: 5 },
      { id: 12, name: "Fiza Ahmed", initials: "FA", email: "fiza@company.com", role: "Team Member", activeTasks: 3 },
    ],
  },
];

const roleStyles: Record<Member["role"], string> = {
  Manager: "border-violet-200 bg-violet-50 text-violet-700",
  Coordinator: "border-blue-200 bg-blue-50 text-blue-700",
  "Team Lead": "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Team Member": "border-slate-200 bg-slate-100 text-slate-600",
};

export default function TeamsPage() {
  const [selectedTeamId, setSelectedTeamId] = useState(teams[0].id);
  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) ?? teams[0],
    [selectedTeamId]
  );

  const totalMembers = teams.reduce((total, team) => total + team.members.length, 0);
  const totalActiveTasks = teams.reduce(
    (total, team) =>
      total + team.members.reduce((sum, member) => sum + member.activeTasks, 0),
    0
  );

  return (
    <div className="mx-auto min-h-full w-full max-w-[1500px] rounded-[28px] bg-gradient-to-br from-violet-50/80 via-white to-slate-50 p-5 md:p-8">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-500">
            Team Management
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#24193f]">
            Teams
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Review team structure, member roles and current workload across the workspace.
          </p>
        </div>

        <Link
          href="/dashboard/boards"
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#5e46a3] to-[#44327a] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-95"
        >
          Open Boards
          <ArrowRight size={16} />
        </Link>
      </section>

      <section className="mt-7 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-violet-100 bg-white/95 p-5 shadow-[0_8px_24px_rgba(50,35,90,0.08)]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
            <BriefcaseBusiness size={18} />
          </div>
          <p className="mt-4 text-3xl font-semibold text-[#24193f]">{teams.length}</p>
          <p className="mt-1 text-sm font-medium text-slate-700">Teams</p>
        </div>

        <div className="rounded-2xl border border-violet-100 bg-white/95 p-5 shadow-[0_8px_24px_rgba(50,35,90,0.08)]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
            <Users size={18} />
          </div>
          <p className="mt-4 text-3xl font-semibold text-[#24193f]">{totalMembers}</p>
          <p className="mt-1 text-sm font-medium text-slate-700">Members</p>
        </div>

        <div className="rounded-2xl border border-violet-100 bg-white/95 p-5 shadow-[0_8px_24px_rgba(50,35,90,0.08)]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
            <CircleDot size={18} />
          </div>
          <p className="mt-4 text-3xl font-semibold text-[#24193f]">{totalActiveTasks}</p>
          <p className="mt-1 text-sm font-medium text-slate-700">Active assignments</p>
        </div>
      </section>

      <section className="mt-7 grid gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="rounded-2xl border border-violet-100 bg-white/95 p-3 shadow-[0_8px_24px_rgba(50,35,90,0.08)]">
          <div className="px-3 py-3">
            <h2 className="text-sm font-semibold text-slate-900">All teams</h2>
            <p className="mt-1 text-xs text-violet-500">Select a team to review members.</p>
          </div>

          <div className="space-y-2">
            {teams.map((team) => {
              const active = team.id === selectedTeamId;
              return (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => setSelectedTeamId(team.id)}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    active
                      ? "border-[#67509a] bg-gradient-to-r from-[#5b458d] to-[#6d52a5] text-white shadow-md"
                      : "border-slate-100 bg-white text-slate-900 hover:border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{team.name}</p>
                      <p className={`mt-1 text-xs ${active ? "text-slate-300" : "text-violet-500"}`}>
                        {team.members.length} members
                      </p>
                    </div>
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${active ? "bg-white/10" : "bg-slate-100 text-slate-600"}`}>
                      <Users size={16} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-[0_10px_30px_rgba(50,35,90,0.10)]">
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[#24193f]">{selectedTeam.name}</h2>
                <p className="mt-1 text-sm text-slate-600">{selectedTeam.description}</p>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                <ShieldCheck size={15} />
                Role-based permissions active
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {selectedTeam.members.map((member) => (
              <div
                key={member.id}
                className="flex flex-col gap-4 px-6 py-5 transition hover:bg-slate-50 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#5e46a3] to-[#44327a] text-xs font-semibold text-white">
                    {member.initials}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{member.name}</p>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${roleStyles[member.role]}`}>
                        {member.role}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-violet-500">{member.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-5">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">{member.activeTasks}</p>
                    <p className="text-[11px] text-violet-500">active tasks</p>
                  </div>

                  {member.activeTasks >= 6 ? (
                    <Clock3 size={18} className="text-orange-500" />
                  ) : (
                    <CheckCircle2 size={18} className="text-emerald-500" />
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-violet-100 bg-violet-50/50 px-6 py-4">
            <p className="text-xs leading-5 text-slate-600">
              Manager, Coordinator and Team Lead can create and assign tasks. Team Members can view task details and add comments only.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
