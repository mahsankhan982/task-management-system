"use client";

import {
  Bell,
  CircleHelp,
  Grid2X2,
  Megaphone,
  Plus,
  Search,
} from "lucide-react";
import { usePathname } from "next/navigation";
import RoleSwitcher from "@/components/layout/role-switcher";

const getPageTitle = (pathname: string) => {
  if (pathname.startsWith("/dashboard/boards")) return "Boards";
  if (pathname.startsWith("/dashboard/teams")) return "Teams";
  if (pathname.startsWith("/dashboard/activity")) return "Activity";
  return "Dashboard";
};

export default function TopHeader() {
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center gap-3 border-b border-white/10 bg-[#51417f] px-4 text-white shadow-sm md:px-5">
      <button
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white"
        aria-label="Apps"
      >
        <Grid2X2 size={18} />
      </button>

      <div className="hidden min-w-[150px] items-center gap-2 lg:flex">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-xs font-black text-[#51417f]">
          TM
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Task Manager</p>
          <p className="text-[10px] text-violet-200">{pageTitle}</p>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center">
        <div className="flex h-9 w-full max-w-[760px] items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 transition focus-within:bg-white/15">
          <Search size={16} className="shrink-0 text-violet-100" />
          <input
            type="text"
            placeholder="Search tasks, boards, people..."
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-violet-200"
          />
        </div>
      </div>

      <button
        type="button"
        className="hidden h-9 items-center gap-2 rounded-lg bg-[#0c66e4] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0055cc] sm:flex"
      >
        <Plus size={17} />
        Create
      </button>

      <RoleSwitcher />

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          className="hidden h-9 w-9 items-center justify-center rounded-lg text-white/85 transition hover:bg-white/10 sm:flex"
          aria-label="Announcements"
        >
          <Megaphone size={17} />
        </button>

        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-white/85 transition hover:bg-white/10"
          aria-label="Notifications"
        >
          <Bell size={17} />
        </button>

        <button
          type="button"
          className="hidden h-9 w-9 items-center justify-center rounded-lg text-white/85 transition hover:bg-white/10 md:flex"
          aria-label="Help"
        >
          <CircleHelp size={17} />
        </button>

        <div className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-[#0c66e4] text-[11px] font-bold text-white ring-2 ring-white/20">
          MK
        </div>
      </div>
    </header>
  );
}
