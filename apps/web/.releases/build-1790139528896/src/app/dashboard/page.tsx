"use client";

import Link from "next/link";
import {
  ArrowRight,
  Code2,
  Megaphone,
  Palette,
  Pencil,
  Plus,
  Trash2,
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
  description?: string | null;
  team_id?: number | null;
  created_by?: number | null;
  is_system?: boolean;
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
  const canJoinEmployee = role === "Manager" || role === "Team Lead";
  const canManageBoards = ["Manager", "Admin", "Coordinator", "Team Lead"].includes(role);

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
    if (!canJoinEmployee && !canManageBoards) return;

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
  }, [canJoinEmployee, canManageBoards]);

  async function createBoard() {
    if (!canManageBoards) return;
    const name = window.prompt("Board name:")?.trim();
    if (!name) return;
    const description = window.prompt("Board description (optional):")?.trim() || null;
    const teamChoices = teams.map((team) => `${team.id}: ${team.name}`).join("\n");
    const teamInput = window.prompt(`Enter Team ID (optional):\n\n${teamChoices}`, "")?.trim();
    const team_id = teamInput ? Number(teamInput) : null;
    if (teamInput && (!Number.isInteger(team_id) || !teams.some((team) => Number(team.id) === team_id))) {
      window.alert("Invalid Team ID");
      return;
    }
    try {
      const response = (await apiRequest("/boards", {
        method: "POST",
        body: JSON.stringify({ name, description, team_id }),
      })) as { data: Board };
      setBoards((current) => [response.data, ...current]);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Unable to create board");
    }
  }

  async function editBoard(board: Board) {
    if (!canManageBoards || board.is_system) return;
    const name = window.prompt("Board name:", board.name)?.trim();
    if (!name) return;
    const description = window.prompt("Board description:", board.description ?? "")?.trim() || null;
    try {
      const response = (await apiRequest(`/boards/${board.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, description }),
      })) as { data: Board };
      setBoards((current) => current.map((item) => item.id === board.id ? { ...item, ...response.data } : item));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Unable to edit board");
    }
  }

  async function deleteBoard(board: Board) {
    if (!canManageBoards || board.is_system || !window.confirm(`Delete board "${board.name}"?`)) return;
    try {
      await apiRequest(`/boards/${board.id}`, { method: "DELETE" });
      setBoards((current) => current.filter((item) => item.id !== board.id));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Unable to delete board");
    }
  }

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
    <div className="relative min-h-full w-full overflow-hidden bg-[#0c1230] p-5 md:p-8">
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/chakor-building-bg.png)" }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0a0f2b] via-[#0a0f2b]/85 to-[#0a0f2b]/40"
        aria-hidden="true"
      />

      <p
        aria-hidden="true"
        className="pointer-events-none absolute bottom-6 left-5 select-none text-[13vw] font-black uppercase leading-none tracking-tight text-amber-100/10 md:left-8 md:text-6xl"
      >
        Chakor
        <span className="mt-1 block text-[3vw] font-semibold tracking-[0.35em] text-amber-100/10 md:text-xs">
          Building a Brighter Tomorrow
        </span>
      </p>

      <div className="relative z-10">
      <section className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">
            Live Workspace
          </p>

          <h1 className="mt-2 text-3xl font-semibold text-white">
            Dashboard
          </h1>

          <p className="mt-2 text-sm text-white/70">
            Select the workspace you want to manage.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
        {canManageBoards ? (
          <button type="button" onClick={() => void createBoard()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[#161f45] shadow-sm transition hover:-translate-y-0.5 hover:bg-amber-50 hover:shadow-lg">
            <Plus size={18} /> Add New Board
          </button>
        ) : null}
        {canJoinEmployee ? (
          <button
            type="button"
            onClick={() => {
              setJoinError("");
              setJoinSuccess("");
              setShowJoin(true);
            }}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/40 bg-white/10 px-5 text-sm font-semibold text-white shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/20 hover:shadow-lg"
          >
            <UserPlus size={18} />
            Join Employee
          </button>
        ) : null}
        </div>
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
                  ? "bg-amber-100 text-[#161f45] transition group-hover:bg-amber-300"
                  : "bg-white/10 text-white/40"
              }`}>
                <Icon size={21} />
              </div>

              <h2 className="mt-7 text-xl font-semibold text-white">
                {workspace.title}
              </h2>

              <p className="mt-2 text-sm text-white/60">
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
                className="min-h-[170px] cursor-not-allowed rounded-2xl border border-white/15 bg-white/5 p-6 opacity-70 backdrop-blur-sm"
              >
                {cardContent}
              </div>
            );
          }

          return (
            <Link
              key={workspace.title}
              href={`/dashboard/boards?boardId=${board.id}`}
              className="group relative min-h-[170px] rounded-2xl border border-amber-200/25 bg-[#0f1638]/70 p-6 shadow-lg backdrop-blur-sm transition hover:-translate-y-1 hover:border-amber-200/60 hover:shadow-xl"
            >
              <span className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-amber-200/40 text-amber-200 transition group-hover:bg-amber-200 group-hover:text-[#161f45]">
                <ArrowRight size={16} />
              </span>
              {cardContent}
            </Link>
          );
        })}

        {boards
          .filter((board) => !workspaces.some((workspace) => {
            const searchable = `${board.name} ${board.team_name ?? ""}`.toLowerCase();
            return workspace.aliases.some((alias) => searchable.includes(alias));
          }))
          .map((board) => (
            <div key={board.id} className="relative min-h-[170px] rounded-2xl border border-amber-200/25 bg-[#0f1638]/70 p-6 shadow-lg backdrop-blur-sm transition hover:-translate-y-1 hover:border-amber-200/60 hover:shadow-xl">
              <Link href={`/dashboard/boards?boardId=${board.id}`} className="group block">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-[#161f45] transition group-hover:bg-amber-300">
                  <Waypoints size={21} />
                </div>
                <h2 className="mt-7 pr-20 text-xl font-semibold text-white">{board.name}</h2>
                <p className="mt-2 text-sm text-white/60">{board.description || `Open ${board.name}.`}</p>
              </Link>
              {canManageBoards && !board.is_system ? (
                <div className="absolute right-4 top-4 flex gap-1">
                  <button type="button" title="Edit board" onClick={() => void editBoard(board)} className="rounded-lg border border-white/20 bg-white/10 p-2 text-white/70 hover:text-amber-200"><Pencil size={15} /></button>
                  <button type="button" title="Delete board" onClick={() => void deleteBoard(board)} className="rounded-lg border border-white/20 bg-white/10 p-2 text-white/70 hover:border-red-300/40 hover:text-red-300"><Trash2 size={15} /></button>
                </div>
              ) : null}
            </div>
          ))}
      </section>
      </div>

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



