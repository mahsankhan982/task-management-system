"use client";

import { Plus } from "lucide-react";
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
    <header className="sticky top-0 z-50 flex h-16 items-center gap-3 border-b border-white/10 bg-[#51417f] px-4 text-white shadow-sm md:px-5">
      <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-black text-[#51417f]">
          TM
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold">Task Manager</p>
          <p className="text-[10px] text-violet-200">{pageTitle}</p>
        </div>
      </Link>

      <div className="flex-1" />

      {permissions.createTask ? (
        <Link
          href="/dashboard/boards"
          className="hidden h-9 items-center gap-2 rounded-lg bg-[#0c66e4] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0055cc] sm:flex"
        >
          <Plus size={17} />
          Create Task
        </Link>
      ) : null}

      <div className="hidden text-right sm:block">
        <p className="max-w-[180px] truncate text-xs font-semibold">{user.full_name}</p>
        <p className="text-[10px] text-violet-200">{user.role}</p>
      </div>

      <div
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0c66e4] text-[11px] font-bold text-white ring-2 ring-white/20"
        title={`${user.full_name} · ${user.role}`}
      >
        {initials(user.full_name)}
      </div>
    </header>
  );
}
