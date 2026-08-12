"use client";

import { ShieldCheck } from "lucide-react";
import { roles, useRole } from "@/contexts/role-context";
import type { UserRole } from "@/lib/permissions";

export default function RoleSwitcher() {
  const { role, setRole } = useRole();

  return (
    <div className="hidden items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-2 py-1.5 md:flex">
      <ShieldCheck size={15} className="text-violet-200" />
      <select
        value={role}
        onChange={(event) => setRole(event.target.value as UserRole)}
        className="cursor-pointer bg-transparent text-xs font-semibold text-white outline-none"
        aria-label="Current role"
      >
        {roles.map((item) => (
          <option key={item} value={item} className="bg-white text-slate-900">
            {item}
          </option>
        ))}
      </select>
      {role === "Team Member" && (
        <span className="rounded-md bg-amber-300 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-950">Read only</span>
      )}
    </div>
  );
}
