export function canEditTaskDueDate(role: string): boolean {
  return ["Admin", "Manager", "Coordinator", "Team Lead"].includes(role);
}
