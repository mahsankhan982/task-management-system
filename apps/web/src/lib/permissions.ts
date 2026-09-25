"use client";

export type UserRole = "Admin" | "Manager" | "Coordinator" | "Team Lead" | "Team Member";

export function canEditTaskDueDate(role: string): boolean {
  return ["Admin", "Manager", "Coordinator", "Team Lead"].includes(role);
}

export const rolePermissions = {
  Admin: {
    createTask: true, assignTask: true, editTask: true,
    moveTask: true, deleteTask: true, comment: true,
  },
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
    moveTask: false,
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

/** Attachment edits retain their existing ownership rules. */
export function canEditAttachment(
  role: string,
  userId: number | string | null | undefined,
  createdBy: number | string | null | undefined,
): boolean {
  return (
    role === "Coordinator" ||
    isTaskCreator(userId, createdBy)
  );
}

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
    moveTask: false,
    deleteTask: owns,
  };
}

/** Movement is task-specific; it does not grant edit, due-date or list permissions. */
export function canMoveTask(role: UserRole, userId: number | string, task: {
  created_by?: number | string | null; assignees?: ReadonlyArray<{ id: number | string }>;
}): boolean {
  return getPermissions(role).moveTask || isTaskCreator(userId, task.created_by) ||
    Boolean(task.assignees?.some(person => Number(person.id) === Number(userId)));
}
