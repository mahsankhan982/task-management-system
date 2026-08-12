"use client";

import {
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Clock3,
  Filter,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Star,
  UserRound,
  Users,
  X,
} from "lucide-react";
import type { DragEvent } from "react";
import { FormEvent, useMemo, useState } from "react";
import BoardTaskModal from "@/components/tasks/board-task-modal";
import { useRole } from "@/contexts/role-context";

type Priority = "Critical" | "High" | "Medium" | "Low";
type Stage = "To Do" | "In Progress" | "Waiting for Lead" | "Review" | "Completed";

type Task = {
  id: number;
  title: string;
  team: string;
  priority: Priority;
  due: string;
  assignee: string;
  comments: number;
};

type Column = {
  title: Stage;
  icon: typeof CircleDot;
  tasks: Task[];
};

const initialColumns: Column[] = [
  {
    title: "To Do",
    icon: CircleDot,
    tasks: [
      {
        id: 1,
        title: "Prepare September campaign brief",
        team: "Marketing",
        priority: "High",
        due: "14 Aug",
        assignee: "AK",
        comments: 3,
      },
      {
        id: 2,
        title: "Create property landing page wireframe",
        team: "Web Development",
        priority: "Medium",
        due: "16 Aug",
        assignee: "HS",
        comments: 1,
      },
    ],
  },
  {
    title: "In Progress",
    icon: Clock3,
    tasks: [
      {
        id: 3,
        title: "Homepage responsive implementation",
        team: "Web Development",
        priority: "High",
        due: "14 Aug",
        assignee: "SA",
        comments: 5,
      },
      {
        id: 4,
        title: "Citadel One3 social media creatives",
        team: "Graphic Design",
        priority: "Critical",
        due: "13 Aug",
        assignee: "UR",
        comments: 4,
      },
    ],
  },
  {
    title: "Waiting for Lead",
    icon: UserRound,
    tasks: [
      {
        id: 5,
        title: "SEO keyword research approval",
        team: "SEO",
        priority: "Medium",
        due: "15 Aug",
        assignee: "HM",
        comments: 2,
      },
      {
        id: 6,
        title: "August content calendar review",
        team: "Marketing",
        priority: "Low",
        due: "17 Aug",
        assignee: "MA",
        comments: 6,
      },
    ],
  },
  {
    title: "Review",
    icon: MessageSquare,
    tasks: [
      {
        id: 7,
        title: "Final brochure copy review",
        team: "Content",
        priority: "Critical",
        due: "12 Aug",
        assignee: "MK",
        comments: 8,
      },
    ],
  },
  {
    title: "Completed",
    icon: CheckCircle2,
    tasks: [
      {
        id: 8,
        title: "Weekly analytics report",
        team: "SEO",
        priority: "Low",
        due: "10 Aug",
        assignee: "FA",
        comments: 2,
      },
      {
        id: 9,
        title: "Project launch email copy",
        team: "Marketing",
        priority: "Medium",
        due: "09 Aug",
        assignee: "ZR",
        comments: 4,
      },
    ],
  },
];

const priorityStyles: Record<Priority, string> = {
  Critical: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
  High: "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200",
  Medium: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
  Low: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200",
};

export default function BoardsPage() {
  const { permissions } = useRole();
  const [columns, setColumns] = useState<Column[]>(initialColumns);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<Stage>("To Do");
  const [query, setQuery] = useState("");
  const [selectedBoardTask, setSelectedBoardTask] = useState<{ task: Task; stage: Stage } | null>(null);

  const [draggedTask, setDraggedTask] = useState<{
    taskId: number;
    sourceStage: Stage;
  } | null>(null);

  const handleDragStart = (
    event: DragEvent<HTMLElement>,
    taskId: number,
    sourceStage: Stage,
  ) => {
    setDraggedTask({ taskId, sourceStage });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(taskId));
  };

  const handleDrop = (
    event: DragEvent<HTMLElement>,
    targetStage: Stage,
  ) => {
    event.preventDefault();

    if (!draggedTask) {
      return;
    }

    const { taskId, sourceStage } = draggedTask;

    if (sourceStage !== targetStage) {
      setColumns((currentColumns) => {
        const sourceColumn = currentColumns.find(
          (column) => column.title === sourceStage,
        );
        const taskToMove = sourceColumn?.tasks.find(
          (task) => task.id === taskId,
        );

        if (!taskToMove) {
          return currentColumns;
        }

        return currentColumns.map((column) => {
          if (column.title === sourceStage) {
            return {
              ...column,
              tasks: column.tasks.filter((task) => task.id !== taskId),
            };
          }

          if (column.title === targetStage) {
            return {
              ...column,
              tasks: [...column.tasks, taskToMove],
            };
          }

          return column;
        });
      });
    }

    setDraggedTask(null);
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
  };

  const visibleColumns = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();

    if (!cleanQuery) {
      return columns;
    }

    return columns.map((column) => ({
      ...column,
      tasks: column.tasks.filter(
        (task) =>
          task.title.toLowerCase().includes(cleanQuery) ||
          task.team.toLowerCase().includes(cleanQuery) ||
          task.priority.toLowerCase().includes(cleanQuery),
      ),
    }));
  }, [columns, query]);

  const openCreateTask = (stage: Stage = "To Do") => {
    setSelectedStage(stage);
    setModalOpen(true);
  };

  const handleCreateTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    const team = String(form.get("team") || "Marketing");
    const priority = String(form.get("priority") || "Medium") as Priority;
    const stage = String(form.get("stage") || selectedStage) as Stage;
    const assignee = String(form.get("assignee") || "MK");
    const dueDate = String(form.get("dueDate") || "");

    if (!title) {
      return;
    }

    const due = dueDate
      ? new Date(`${dueDate}T00:00:00`).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
        })
      : "No date";

    const newTask: Task = {
      id: Date.now(),
      title,
      team,
      priority,
      due,
      assignee,
      comments: 0,
    };

    setColumns((current) =>
      current.map((column) =>
        column.title === stage
          ? { ...column, tasks: [...column.tasks, newTask] }
          : column,
      ),
    );

    event.currentTarget.reset();
    setModalOpen(false);
  };

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-[#f3f5f9]">
      <div className="mx-auto max-w-[1800px] p-4 md:p-6">
        <div className="overflow-hidden rounded-[22px] border border-violet-300/40 bg-gradient-to-br from-[#5f4aa2] via-[#8855b8] to-[#d260b7] shadow-[0_20px_70px_rgba(91,69,155,0.18)]">
          <div className="border-b border-white/15 bg-[#5a438f]/90 px-4 py-3 text-white backdrop-blur md:px-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-200">
                    Team Workspace
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <h2 className="truncate text-xl font-semibold">
                      Marketing Board
                    </h2>
                    <Star size={17} className="text-violet-100" />
                    <Lock size={15} className="text-violet-100" />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center -space-x-2">
                  {["MK", "AK", "SA", "UR"].map((member) => (
                    <div
                      key={member}
                      className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#62479a] bg-white text-[10px] font-semibold text-slate-700"
                    >
                      {member}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="flex h-9 items-center gap-2 rounded-lg bg-white/12 px-3 text-xs font-medium text-white transition hover:bg-white/20"
                >
                  <Users size={15} />
                  Share
                </button>

                <button
                  type="button"
                  className="flex h-9 items-center gap-2 rounded-lg bg-white/12 px-3 text-xs font-medium text-white transition hover:bg-white/20"
                >
                  <Filter size={15} />
                  Filter
                </button>

                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/12 transition hover:bg-white/20"
                >
                  <MoreHorizontal size={18} />
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative w-full max-w-md">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-violet-200"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search this board..."
                  className="h-9 w-full rounded-lg border border-white/15 bg-white/10 pl-9 pr-3 text-sm text-white outline-none placeholder:text-violet-200 focus:bg-white/15"
                />
              </div>

              <button
                type="button"
                onClick={() => openCreateTask("To Do")}
                className="flex h-9 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-[#5a438f] shadow-sm transition hover:bg-violet-50"
              >
                <Plus size={16} />
                Create Task
              </button>
            </div>
          </div>

          <div className="overflow-x-auto px-3 py-4 md:px-4">
            <div className="flex min-w-max items-start gap-3 pb-3">
              {visibleColumns.map((column) => {
                const Icon = column.icon;

                return (
                  <section key={column.title} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { if (permissions.moveTask) handleDrop(event, column.title); }} className="flex max-h-[calc(100vh-300px)] w-[290px] shrink-0 flex-col rounded-xl bg-[#eef1f5] p-2.5 shadow-sm">
                    <div className="flex items-center justify-between px-1.5 pb-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm">
                          <Icon size={15} strokeWidth={1.9} />
                        </div>
                        <h3 className="truncate text-sm font-semibold text-slate-800">
                          {column.title}
                        </h3>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 shadow-sm">
                          {column.tasks.length}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </div>

                    <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain pr-1">
                      {column.tasks.map((task) => (
                        <article key={task.id} draggable={permissions.moveTask} onClick={() => setSelectedBoardTask({ task, stage: column.title })} onDragStart={(event) => handleDragStart(event, task.id, column.title)} onDragEnd={handleDragEnd} className="cursor-grab rounded-xl border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing">
                          <div className="flex items-start justify-between gap-3">
                            <span
                              className={`rounded-full px-2 py-1 text-[10px] font-semibold ${priorityStyles[task.priority]}`}
                            >
                              {task.priority}
                            </span>

                            <button
                              type="button"
                              className="text-slate-300 transition hover:text-slate-600"
                            >
                              <MoreHorizontal size={16} />
                            </button>
                          </div>

                          <h4 className="mt-3 text-sm font-semibold leading-5 text-slate-900">
                            {task.title}
                          </h4>

                          <p className="mt-1.5 text-xs text-slate-400">
                            {task.team}
                          </p>

                          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                              <CalendarDays size={13} />
                              {task.due}
                            </div>

                            <div className="flex items-center gap-2.5">
                              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                                <MessageSquare size={13} />
                                {task.comments}
                              </div>

                              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#101828] text-[9px] font-semibold text-white">
                                {task.assignee}
                              </div>
                            </div>
                          </div>
                        </article>
                      ))}

                      <button
                        type="button"
                        onClick={() => openCreateTask(column.title)}
                        className="sticky bottom-0 z-10 flex h-9 w-full items-center gap-2 rounded-lg bg-[#eef1f5] px-2 text-left text-sm font-medium text-slate-500 transition hover:bg-white hover:text-slate-800"
                      >
                        <Plus size={15} />
                        Add a task
                      </button>
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
          <button
            type="button"
            aria-label="Close create task modal"
            onClick={() => setModalOpen(false)}
            className="absolute inset-0 cursor-default"
          />

          <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-600">
                  New Task
                </p>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">
                  Create a task
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTask}>
              <div className="max-h-[68vh] space-y-4 overflow-y-auto px-6 py-5">
                <div>
                  <label
                    htmlFor="task-title"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Task title
                  </label>
                  <input
                    id="task-title"
                    name="title"
                    required
                    placeholder="e.g. Prepare launch campaign"
                    className="h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-50"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Team
                    </label>
                    <select
                      name="team"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 outline-none"
                    >
                      <option>Marketing</option>
                      <option>Web Development</option>
                      <option>Graphic Design</option>
                      <option>SEO</option>
                      <option>Content</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Workflow stage
                    </label>
                    <select
                      name="stage"
                      defaultValue={selectedStage}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 outline-none"
                    >
                      {initialColumns.map((column) => (
                        <option key={column.title}>{column.title}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Priority
                    </label>
                    <select
                      name="priority"
                      defaultValue="Medium"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 outline-none"
                    >
                      <option>Critical</option>
                      <option>High</option>
                      <option>Medium</option>
                      <option>Low</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Assignee
                    </label>
                    <select
                      name="assignee"
                      defaultValue="MK"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 outline-none"
                    >
                      <option value="MK">MK - Manager</option>
                      <option value="AK">AK - Team Lead</option>
                      <option value="UR">UR - Coordinator</option>
                      <option value="SA">SA - Team Member</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Due date
                    </label>
                    <input
                      name="dueDate"
                      type="date"
                      className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Description
                  </label>
                  <textarea
                    name="description"
                    rows={4}
                    placeholder="Add task requirements, context or completion notes..."
                    className="w-full resize-none rounded-xl border border-slate-200 px-3.5 py-3 text-sm leading-6 text-slate-900 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-50"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="flex h-10 items-center gap-2 rounded-xl bg-[#101828] px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  <Plus size={16} />
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    {selectedBoardTask ? (<BoardTaskModal key={selectedBoardTask?.task.id ?? "none"} task={selectedBoardTask?.task ?? initialColumns[0].tasks[0]} stage={selectedBoardTask?.stage ?? "To Do"} onClose={() => setSelectedBoardTask(null)} onSave={(updatedTask,nextStage)=>{setColumns(current=>{const cleaned=current.map(column=>({...column,tasks:column.tasks.filter(item=>item.id!==updatedTask.id)}));return cleaned.map(column=>column.title===nextStage?{...column,tasks:[...column.tasks,updatedTask]}:column)});setSelectedBoardTask(null)}} />) : null}</div>
  );
}
