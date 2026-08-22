"use client";

import Link from "next/link";
import {
  Code2,
  Megaphone,
  Palette,
  UserPlus,
  Waypoints,
  X,
} from "lucide-react";
import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import { api, apiRequest } from "@/lib/api";
import { useRole } from "@/contexts/role-context";

type Team = {
  id: number | string;
  name: string;
};

type Board = {
  id: number;
  name: string;
  team_name: string | null;
};

type Role = "Coordinator" | "Team Lead" | "Team Member";

const workspaces = [
  {
    title: "Creative",
    description: "Open the Creative workspace.",
    aliases: ["creative", "crative"],
    icon: Palette,
  },
  {
    title: "Website",
    description: "Open the Website workspace.",
    aliases: ["website", "web site"],
    icon: Code2,
  },
  {
    title: "Digital",
    description: "Open the Digital workspace.",
    aliases: ["digital"],
    icon: Megaphone,
  },
  {
    title: "QA",
    description: "Open the QA workspace.",
    aliases: ["qa"],
    icon: Waypoints,
  },
];

export default function DashboardPage() {
  const { role } = useRole();
  const canJoinEmployee = role === "Manager";

  const [teams, setTeams] = useState<Team[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [showJoin, setShowJoin] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joinSuccess, setJoinSuccess] = useState("");

  useEffect(() => {
    void Promise.resolve().then(async () => {
      try {
        const response = (await api.boards()) as {
          success: boolean;
          data: Board[];
        };
        setBoards(response.data ?? []);
      } catch {
        setBoards([]);
      }
    });
  }, []);

  useEffect(() => {
    if (!canJoinEmployee) return;

    void Promise.resolve().then(async () => {
      try {
        const response = (await api.teams()) as {
          success: boolean;
          data: Team[];
        };
        setTeams(response.data ?? []);
      } catch {
        setTeams([]);
      }
    });
  }, [canJoinEmployee]);

  async function joinEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!canJoinEmployee || joining) return;

    const form = new FormData(event.currentTarget);

    const full_name = String(form.get("full_name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const employeeRole = String(form.get("role") ?? "Team Member") as Role;
    const teamValue = String(form.get("team_id") ?? "").trim();
    const team_id = teamValue ? Number(teamValue) : null;

    if (!full_name || !email || !password) {
      setJoinError("Name, email and temporary password are required.");
      return;
    }

    if (password.length < 8) {
      setJoinError("Temporary password must be at least 8 characters.");
      return;
    }

    try {
      setJoining(true);
      setJoinError("");
      setJoinSuccess("");

      await apiRequest("/users", {
        method: "POST",
        body: JSON.stringify({
          full_name,
          email,
          password,
          role: employeeRole,
          team_id,
        }),
      });

      setJoinSuccess(`${full_name} joined successfully.`);
      formElement.reset();

      window.setTimeout(() => {
        setShowJoin(false);
        setJoinSuccess("");
      }, 1500);
    } catch (err) {
      setJoinError(
        err instanceof Error ? err.message : "Unable to join employee.",
      );
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="min-h-full w-full bg-gradient-to-br from-[#64499a] via-[#a85dbd] to-[#d46bb6] p-5 md:p-8">
      <section className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-100">
            Live Workspace
          </p>

          <h1 className="mt-2 text-3xl font-semibold text-white">
            Dashboard
          </h1>

          <p className="mt-2 text-sm text-white/80">
            Select the workspace you want to manage.
          </p>
        </div>

        {canJoinEmployee ? (
          <button
            type="button"
            onClick={() => {
              setJoinError("");
              setJoinSuccess("");
              setShowJoin(true);
            }}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-violet-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <UserPlus size={18} />
            Join Employee
          </button>
        ) : null}
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {workspaces.map((workspace) => {
          const Icon = workspace.icon;

          const board = boards.find((item) => {
            const searchable = `${item.name} ${item.team_name ?? ""}`.toLowerCase();
            return workspace.aliases.some((alias) => searchable.includes(alias));
          });

          const cardContent = (
            <>
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                board
                  ? "bg-violet-50 text-violet-700 transition group-hover:bg-violet-700 group-hover:text-white"
                  : "bg-slate-100 text-slate-400"
              }`}>
                <Icon size={21} />
              </div>

              <h2 className="mt-7 text-xl font-semibold text-slate-950">
                {workspace.title}
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                {board
                  ? `Open ${board.name}.`
                  : "No board data available yet."}
              </p>
            </>
          );

          if (!board) {
            return (
              <div
                key={workspace.title}
                aria-disabled="true"
                className="min-h-[170px] cursor-not-allowed rounded-2xl border border-white/30 bg-white/80 p-6 opacity-70 shadow-sm"
              >
                {cardContent}
              </div>
            );
          }

          return (
            <Link
              key={workspace.title}
              href={`/dashboard/boards?boardId=${board.id}`}
              className="group min-h-[170px] rounded-2xl border border-white/40 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-violet-300 hover:shadow-xl"
            >
              {cardContent}
            </Link>
          );
        })}
      </section>

      {showJoin && canJoinEmployee ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close join employee"
            onClick={() => setShowJoin(false)}
            className="absolute inset-0"
          />

          <div className="relative z-10 w-full max-w-xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">
                  Employee Joining
                </p>

                <h2 className="mt-1 text-xl font-semibold text-slate-950">
                  Join Employee
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Create the employee login account using name and email.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowJoin(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={joinEmployee} className="p-6">
              {joinError ? (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {joinError}
                </div>
              ) : null}

              {joinSuccess ? (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
                  {joinSuccess}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">
                  Full Name
                  <input
                    name="full_name"
                    required
                    placeholder="Employee name"
                    className="mt-2 h-11 w-full rounded-xl border px-3 text-sm font-normal outline-none focus:border-violet-500"
                  />
                </label>

                <label className="text-sm font-semibold text-slate-700">
                  Email
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="employee@company.com"
                    className="mt-2 h-11 w-full rounded-xl border px-3 text-sm font-normal outline-none focus:border-violet-500"
                  />
                </label>

                <label className="text-sm font-semibold text-slate-700">
                  Temporary Password
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    placeholder="Minimum 8 characters"
                    className="mt-2 h-11 w-full rounded-xl border px-3 text-sm font-normal outline-none focus:border-violet-500"
                  />
                </label>

                <label className="text-sm font-semibold text-slate-700">
                  Role
                  <select
                    name="role"
                    defaultValue="Team Member"
                    className="mt-2 h-11 w-full rounded-xl border bg-white px-3 text-sm font-normal outline-none focus:border-violet-500"
                  >
                    <option value="Team Member">Team Member</option>
                    <option value="Team Lead">Team Lead</option>
                    <option value="Coordinator">Coordinator</option>
                  </select>
                </label>

                <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                  Team
                  <select
                    name="team_id"
                    defaultValue=""
                    className="mt-2 h-11 w-full rounded-xl border bg-white px-3 text-sm font-normal outline-none focus:border-violet-500"
                  >
                    <option value="">No team</option>
                    {teams.map((team) => (
                      <option key={String(team.id)} value={String(team.id)}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowJoin(false)}
                  className="h-10 rounded-xl border px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={joining}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-700 px-5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <UserPlus size={16} />
                  {joining ? "Joining..." : "Join Employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
