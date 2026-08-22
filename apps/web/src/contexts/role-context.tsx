"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, clearAuthToken, getAuthToken } from "@/lib/api";
import { getPermissions, type UserRole } from "@/lib/permissions";

type AuthUser = {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
  team_id: number | null;
};

type RoleContextValue = {
  user: AuthUser;
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

function isUserRole(value: unknown): value is UserRole {
  return roles.includes(value as UserRole);
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [role, setRole] = useState<UserRole>("Manager");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      const token = getAuthToken();

      if (!token) {
        window.location.replace("/");
        return;
      }

      try {
        const response = (await api.me()) as { success: boolean; data: AuthUser };

        if (!response.data || !isUserRole(response.data.role)) {
          throw new Error("Invalid user session");
        }

        setUser(response.data);
        setRole(response.data.role);
        localStorage.setItem("task_management_user", JSON.stringify(response.data));
      } catch {
        clearAuthToken();
        localStorage.removeItem("task_management_user");
        window.location.replace("/");
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, []);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading workspace...
      </div>
    );
  }

  return (
    <RoleContext.Provider
      value={{ user, role, setRole, permissions: getPermissions(role) }}
    >
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
