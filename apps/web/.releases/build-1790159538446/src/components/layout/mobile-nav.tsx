"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarDays, Inbox, LayoutDashboard, PanelsTopLeft } from "lucide-react";

const links = [
  { href: "/dashboard/boards?view=inbox", label: "Inbox", icon: Inbox, key: "inbox" },
  { href: "/dashboard/boards?view=planner", label: "Planner", icon: CalendarDays, key: "planner" },
  { href: "/dashboard/boards?view=board", label: "Board", icon: LayoutDashboard, key: "board" },
  { href: "/dashboard/boards?switch=1", label: "Switch boards", icon: PanelsTopLeft, key: "switch" },
];

export default function MobileNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const switchOpen = searchParams.get("switch") === "1";

  return (
    <nav className="fixed bottom-4 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-2xl backdrop-blur">
      {links.map(({ href, label, icon: Icon, key }) => {
        const active =
          pathname.startsWith("/dashboard/boards") &&
          (key === "switch"
            ? switchOpen
            : !switchOpen && (view === key || (key === "board" && !view)));

        return (
          <Link
            key={key}
            href={href}
            className={`flex h-10 min-w-[96px] items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition ${
              active
                ? "bg-blue-50 text-[#0c66e4]"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <Icon size={17} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
