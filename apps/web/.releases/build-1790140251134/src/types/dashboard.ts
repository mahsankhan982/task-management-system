export type Priority = "Critical" | "High" | "Medium" | "Low";

export interface DashboardStat {
  id: number;
  label: string;
  value: number;
  change: string;
}

export interface BoardSummary {
  id: number;
  name: string;
  team: string;
  taskCount: number;
  members: number;
}

export interface DashboardTask {
  id: number;
  title: string;
  board: string;
  priority: Priority;
  dueDate: string;
  status:
    | "To Do"
    | "In Progress"
    | "Waiting for Review"
    | "Review"
    | "Completed";
}
