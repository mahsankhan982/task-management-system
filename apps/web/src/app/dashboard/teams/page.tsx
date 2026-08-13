"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type Role = "Manager" | "Coordinator" | "Team Lead" | "Team Member";
type Team = { id: number | string; name: string; description: string | null };
type User = {
  id: number | string;
  full_name: string;
  email: string;
  role: Role;
  team_id: number | string | null;
  is_active: boolean;
};

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.teams(), api.users()])
      .then(([teamResult, userResult]) => {
        const teamData = (teamResult as { data: Team[] }).data ?? [];
        const userData = (userResult as { data: User[] }).data ?? [];
        setTeams(teamData);
        setUsers(userData);
        if (teamData[0]) setSelectedId(String(teamData[0].id));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load teams"))
      .finally(() => setLoading(false));
  }, []);

  const selectedTeam = useMemo(
    () => teams.find((team) => String(team.id) === selectedId),
    [teams, selectedId],
  );

  const members = useMemo(
    () => users.filter((user) => selectedTeam && String(user.team_id) === String(selectedTeam.id)),
    [users, selectedTeam],
  );

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">Loading teams...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] p-5 md:p-8">
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">Team Management</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Teams</h1>
        <p className="mt-2 text-sm text-slate-600">Live teams and users from PostgreSQL.</p>
      </div>

      {error ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="mb-7 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <p className="text-3xl font-semibold">{teams.length}</p>
          <p className="mt-1 text-sm text-slate-500">Teams</p>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <p className="text-3xl font-semibold">{users.length}</p>
          <p className="mt-1 text-sm text-slate-500">Users</p>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <p className="text-3xl font-semibold">{users.filter((user) => user.is_active).length}</p>
          <p className="mt-1 text-sm text-slate-500">Active users</p>
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">
          No teams found in the database.
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
          <div className="rounded-2xl border bg-white p-3 shadow-sm">
            {teams.map((team) => {
              const count = users.filter((user) => String(user.team_id) === String(team.id)).length;
              const active = String(team.id) === selectedId;
              return (
                <button
                  key={String(team.id)}
                  type="button"
                  onClick={() => setSelectedId(String(team.id))}
                  className={`mb-2 w-full rounded-xl p-4 text-left transition ${active ? "bg-violet-700 text-white" : "hover:bg-slate-50"}`}
                >
                  <p className="font-semibold">{team.name}</p>
                  <p className={`mt-1 text-xs ${active ? "text-violet-100" : "text-slate-500"}`}>
                    {count} member{count === 1 ? "" : "s"}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="border-b p-6">
              <h2 className="text-xl font-semibold">{selectedTeam?.name}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {selectedTeam?.description || "No description added."}
              </p>
            </div>

            <div className="divide-y">
              {members.length === 0 ? (
                <div className="p-8 text-sm text-slate-500">No users assigned to this team yet.</div>
              ) : (
                members.map((member) => (
                  <div key={String(member.id)} className="flex items-center justify-between gap-4 p-6">
                    <div>
                      <p className="font-semibold text-slate-900">{member.full_name}</p>
                      <p className="mt-1 text-sm text-slate-500">{member.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-violet-700">{member.role}</p>
                      <p className={`mt-1 text-xs ${member.is_active ? "text-emerald-600" : "text-slate-400"}`}>
                        {member.is_active ? "Active" : "Inactive"}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
