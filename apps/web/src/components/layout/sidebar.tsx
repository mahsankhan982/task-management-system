"use client";

import {
  Activity,
  LayoutDashboard,
  LogOut,
  PanelsTopLeft,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Boards",
    href: "/dashboard/boards",
    icon: PanelsTopLeft,
  },
  {
    name: "Teams",
    href: "/dashboard/teams",
    icon: Users,
  },
  {
    name: "Activity",
    href: "/dashboard/activity",
    icon: Activity,
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-[calc(100vh-4rem)] w-[250px] shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
      {/* Logo */}
      <div className="flex h-20 items-center border-b border-slate-100 px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#101828] text-sm font-bold text-white">
            TM
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-950">
              Task Manager
            </p>

            <p className="text-xs text-slate-400">
              Workspace
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex flex-1 flex-col px-4 py-6">
        <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Workspace
        </p>

        <nav className="space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;

            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${
                  active
                    ? "bg-[#101828] text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
              >
                <Icon size={18} strokeWidth={1.8} />

                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Navigation */}
        <div className="mt-auto border-t border-slate-100 pt-5">
          <button
            type="button"
            className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
          >
            <Settings size={18} strokeWidth={1.8} />
            Settings
          </button>

          <Link
            href="/"
            className="mt-1 flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={18} strokeWidth={1.8} />
            Sign out
          </Link>
        </div>
      </div>

      {/* User */}
      <div className="border-t border-slate-100 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#101828] text-xs font-semibold text-white">
            MK
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              Manager
            </p>

            <p className="truncate text-xs text-slate-400">
              manager@company.com
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}