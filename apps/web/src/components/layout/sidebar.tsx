"use client";

import { Activity, LayoutDashboard, LogOut, PanelsTopLeft, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import ChakorLogo from "@/components/brand/chakor-logo";
import UserAvatar from "@/components/brand/user-avatar";
import { useRole } from "@/contexts/role-context";
import { clearAuthToken } from "@/lib/api";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Boards", href: "/dashboard/boards", icon: PanelsTopLeft },
  { name: "Teams", href: "/dashboard/teams", icon: Users },
  { name: "Activity", href: "/dashboard/activity", icon: Activity },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useRole();

  function signOut() {
    clearAuthToken();
    localStorage.removeItem("task_management_user");
    router.replace("/");
  }

  return (
    <aside className="hidden h-[calc(100vh-4rem)] w-[260px] shrink-0 border-r border-slate-200 bg-[#fafbfc] lg:flex lg:flex-col">
      <div className="flex h-[72px] items-center border-b border-slate-200 bg-white px-5">
        <div className="flex items-center gap-3">
          <ChakorLogo size={40} />
          <div>
            <p className="text-sm font-semibold text-slate-950">Task Manager</p>
            <p className="text-xs text-slate-400">Workspace</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-3 py-5">
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          Workspace
        </p>

        <nav className="space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition ${
                  active
                    ? "bg-[#e9f2ff] font-semibold text-[#0c66e4]"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
              >
                <Icon size={18} strokeWidth={1.8} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-slate-100 pt-5">
          <button
            type="button"
            onClick={signOut}
            className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={18} strokeWidth={1.8} />
            Sign out
          </button>
        </div>
      </div>

      <div className="border-t border-slate-100 p-4">
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <UserAvatar
            name={user.full_name}
            avatarUrl={user.avatar_url}
            size={36}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">{user.full_name}</p>
            <p className="truncate text-xs text-slate-400">{user.email}</p>
            <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-wide text-violet-600">
              {user.role}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
