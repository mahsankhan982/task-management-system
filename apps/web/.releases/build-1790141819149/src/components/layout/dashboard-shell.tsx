
"use client";

import type { ReactNode } from "react";
import MobileNav from "@/components/layout/mobile-nav";
import TopHeader from "@/components/layout/top-header";
import CallManager from "@/components/calling/call-manager";

export default function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg,#263B49 0%,#17364E 52%,#0E2D45 100%)" }}>
      <TopHeader />
      <div className="flex h-[calc(100vh-3.5rem)] min-h-0 overflow-hidden">
        <main className="min-w-0 flex-1 overflow-auto pb-24 lg:pb-0">{children}</main>
      </div>
      <MobileNav />
      <CallManager />
    </div>
  );
}
