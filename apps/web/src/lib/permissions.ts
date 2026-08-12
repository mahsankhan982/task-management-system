"use client";

export type UserRole = "Manager" | "Coordinator" | "Team Lead" | "Team Member";

export const rolePermissions = {
  Manager: {
    createTask: true,
    assignTask: true,
    editTask: true,
    moveTask: true,
    deleteTask: true,
    comment: true,
  },
  Coordinator: {
    createTask: true,
    assignTask: true,
    editTask: true,
    moveTask: true,
    deleteTask: true,
    comment: true,
  },
  "Team Lead": {
    createTask: true,
    assignTask: true,
    editTask: true,
    moveTask: true,
    deleteTask: true,
    comment: true,
  },
  "Team Member": {
    createTask: false,
    assignTask: false,
    editTask: false,
    moveTask: false,
    deleteTask: false,
    comment: true,
  },
} as const;

export function getPermissions(role: UserRole) {
  return rolePermissions[role];
}
