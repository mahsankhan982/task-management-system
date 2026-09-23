import type { ReactNode } from "react";

import DashboardShell from "@/components/layout/dashboard-shell";
import { RoleProvider } from "@/contexts/role-context";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <RoleProvider>
      <DashboardShell>{children}</DashboardShell>
    </RoleProvider>
  );
}
