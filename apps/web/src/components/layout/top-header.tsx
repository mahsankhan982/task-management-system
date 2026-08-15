"use client";

import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRole } from "@/contexts/role-context";

const getPageTitle = (pathname: string) => {
  if (pathname.startsWith("/dashboard/boards")) return "Boards";
  if (pathname.startsWith("/dashboard/teams")) return "Teams";
  if (pathname.startsWith("/dashboard/activity")) return "Activity";
  return "Dashboard";
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "TM";
}

export default function TopHeader() {
  const pathname = usePathname();
  const { user, permissions } = useRole();
  const pageTitle = getPageTitle(pathname);

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 text-slate-700 shadow-sm">
      <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0c66e4] text-xs font-black text-white shadow-sm">
          TM
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-bold text-slate-900">Task Manager</p>
          <p className="text-[10px] text-slate-400">{pageTitle}</p>
        </div>
      </Link>

      <div className="mx-auto hidden w-full max-w-2xl items-center md:flex"><div className="flex h-9 w-full items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 focus-within:border-[#0c66e4] focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100"><Search size={16} className="text-slate-400" /><input placeholder="Search your workspace" className="h-full w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" /></div></div><div className="flex-1 md:hidden" />

      {permissions.createTask ? (
        <Link
          href="/dashboard/boards"
          className="hidden h-9 items-center gap-2 rounded-lg bg-[#0c66e4] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0055cc] sm:flex"
        >
          <Plus size={17} />
          Create
        </Link>
      ) : null}

      <div className="hidden text-right sm:block">
        <p className="max-w-[180px] truncate text-xs font-semibold text-slate-900">{user.full_name}</p>
        <p className="text-[10px] text-slate-400">{user.role}</p>
      </div>

      <div
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0c66e4] text-[11px] font-bold text-white ring-2 ring-blue-100"
        title={`${user.full_name} · ${user.role}`}
      >
        {initials(user.full_name)}
      </div>
    </header>
  );
}
