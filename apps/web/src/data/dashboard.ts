import type {
  BoardSummary,
  DashboardStat,
  DashboardTask,
} from "@/types/dashboard";

export const dashboardStats: DashboardStat[] = [
  {
    id: 1,
    label: "Total Tasks",
    value: 24,
    change: "Across all boards",
  },
  {
    id: 2,
    label: "In Progress",
    value: 8,
    change: "Currently active",
  },
  {
    id: 3,
    label: "Waiting for Review",
    value: 4,
    change: "Awaiting review",
  },
  {
    id: 4,
    label: "Completed",
    value: 12,
    change: "This month",
  },
];

export const recentBoards: BoardSummary[] = [
  {
    id: 1,
    name: "Marketing Board",
    team: "Marketing",
    taskCount: 16,
    members: 6,
  },
  {
    id: 2,
    name: "Web Development",
    team: "Development",
    taskCount: 21,
    members: 8,
  },
  {
    id: 3,
    name: "Graphic Design",
    team: "Design",
    taskCount: 12,
    members: 5,
  },
  {
    id: 4,
    name: "SEO Board",
    team: "SEO",
    taskCount: 9,
    members: 4,
  },
];

export const recentTasks: DashboardTask[] = [
  {
    id: 1,
    title: "Homepage responsive implementation",
    board: "Web Development",
    priority: "High",
    dueDate: "14 Aug",
    status: "In Progress",
  },
  {
    id: 2,
    title: "Citadel One3 launch banner",
    board: "Graphic Design",
    priority: "Critical",
    dueDate: "12 Aug",
    status: "Waiting for Review",
  },
  {
    id: 3,
    title: "August campaign keyword research",
    board: "SEO Board",
    priority: "Medium",
    dueDate: "17 Aug",
    status: "To Do",
  },
  {
    id: 4,
    title: "Social media content calendar",
    board: "Marketing Board",
    priority: "Low",
    dueDate: "19 Aug",
    status: "Review",
  },
];
