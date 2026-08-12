"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, LayoutDashboard, Users } from "lucide-react";

const links = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/dashboard/boards", label: "Boards", icon: LayoutDashboard },
  { href: "/dashboard/teams", label: "Teams", icon: Users },
  { href: "/dashboard/activity", label: "Activity", icon: Activity },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-3 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-violet-100 bg-white/95 p-1.5 shadow-xl backdrop-blur lg:hidden">
      {links.map(({ href, label, icon: Icon }) => {
        const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className={`flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-semibold transition ${active ? "bg-[#5e46a3] text-white shadow-sm" : "text-slate-500 hover:bg-violet-50 hover:text-violet-700"}`}
          >
            <Icon size={17} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
