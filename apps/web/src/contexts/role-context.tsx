"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { getPermissions, type UserRole } from "@/lib/permissions";

type RoleContextValue = {
  role: UserRole;
  setRole: (role: UserRole) => void;
  permissions: ReturnType<typeof getPermissions>;
};

const RoleContext = createContext<RoleContextValue | null>(null);

export const roles: UserRole[] = [
  "Manager",
  "Coordinator",
  "Team Lead",
  "Team Member",
];

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole>("Manager");

  return (
    <RoleContext.Provider value={{ role, setRole, permissions: getPermissions(role) }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);

  if (!context) {
    throw new Error("useRole must be used inside RoleProvider");
  }

  return context;
}
