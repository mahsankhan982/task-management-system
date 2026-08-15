"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, LayoutDashboard, PanelsTopLeft, Users } from "lucide-react";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/boards", label: "Boards", icon: PanelsTopLeft },
  { href: "/dashboard/teams", label: "Teams", icon: Users },
  { href: "/dashboard/activity", label: "Activity", icon: Activity },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-4 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-2xl backdrop-blur">
      {links.map(({ href, label, icon: Icon }) => {
        const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className={`flex h-10 min-w-[88px] items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition ${active ? "bg-blue-50 text-[#0c66e4]" : "text-slate-700 hover:bg-slate-100"}`}
          >
            <Icon size={17} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
