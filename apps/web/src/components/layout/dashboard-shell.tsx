"use client";

import type { ReactNode } from "react";
import MobileNav from "@/components/layout/mobile-nav";
import Sidebar from "@/components/layout/sidebar";
import TopHeader from "@/components/layout/top-header";

export default function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f6f7fb]">
      <TopHeader />
      <div className="flex h-[calc(100vh-4rem)] min-h-0 overflow-hidden">
        <div className="hidden lg:block">
          <Sidebar />
        </div>
        <main className="min-w-0 flex-1 overflow-auto pb-24 lg:pb-0">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
