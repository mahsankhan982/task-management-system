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
    createTask: true,
    assignTask: true,
    editTask: true,
    moveTask: true,
    deleteTask: true,
    comment: true,
  },
} as const;

export type TaskPermissions = {
  createTask: boolean;
  assignTask: boolean;
  editTask: boolean;
  moveTask: boolean;
  deleteTask: boolean;
  comment: boolean;
};

export function getPermissions(role: UserRole) {
  return rolePermissions[role];
}

/** True when this user raised the task, so it is theirs to change. */
export function isTaskCreator(
  userId: number | string | null | undefined,
  createdBy: number | string | null | undefined,
): boolean {
  if (userId === null || userId === undefined) return false;
  if (createdBy === null || createdBy === undefined) return false;
  return Number(userId) === Number(createdBy);
}

/**
 * Permissions for one specific task. Team Members may create tasks and assign
 * them to anyone, but a task raised by somebody else stays read-only for them:
 * they can still comment, and move it through the status flow when it is
 * assigned to them. Everyone above Team Member keeps their role permissions.
 */
export function getTaskPermissions(
  role: UserRole,
  userId: number | string | null | undefined,
  createdBy: number | string | null | undefined,
): TaskPermissions {
  const base = getPermissions(role);

  if (role !== "Team Member") {
    return { ...base };
  }

  const owns = isTaskCreator(userId, createdBy);

  return {
    ...base,
    editTask: owns,
    assignTask: owns,
    moveTask: owns,
    deleteTask: owns,
  };
}
