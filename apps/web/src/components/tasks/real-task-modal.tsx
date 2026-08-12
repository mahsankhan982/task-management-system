"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Activity, CheckSquare, MessageSquare, UserRound, X } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { useRole } from "@/contexts/role-context";

type Assignee = {
  id: number | string;
  full_name: string;
  email: string;
  role: string;
};

type ChecklistItem = {
  id: number | string;
  title: string;
  is_completed: boolean;
};

type TaskComment = {
  id: number | string;
  user_name: string | null;
  user_role?: string | null;
  body: string;
  created_at: string;
};

type ActivityEntry = {
  id: number | string;
  action: string;
  user_name: string | null;
  created_at: string;
};

type TaskDetails = {
  id: number;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
  stage_name: string;
  board_name: string;
  assignees: Assignee[];
  checklist: ChecklistItem[];
  comments: TaskComment[];
  activity: ActivityEntry[];
};

type Props = {
  taskId: number;
  onClose: () => void;
};

function formatDate(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function RealTaskModal({ taskId, onClose }: Props) {
  const { permissions } = useRole();
  const [task, setTask] = useState<TaskDetails | null>(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  async function loadTask() {
    try {
      setError("");
      const response = await apiRequest<{ success: boolean; data: TaskDetails }>(
        `/tasks/${taskId}`,
      );
      setTask(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load task details");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTask();
  }, [taskId]);

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = comment.trim();
    if (!body || !permissions.comment) return;

    try {
      setPosting(true);
      setError("");
      await apiRequest("/comments", {
        method: "POST",
        body: JSON.stringify({ task_id: taskId, body }),
      });
      setComment("");
      await loadTask();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add comment");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close task details"
        onClick={onClose}
        className="absolute inset-0"
      />

      <div className="relative z-10 max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-white px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">
              Task Details
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              {task?.title ?? "Loading task..."}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X size={19} />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-sm text-slate-500">Loading task details...</div>
        ) : error && !task ? (
          <div className="p-8 text-sm text-red-600">{error}</div>
        ) : task ? (
          <div className="grid lg:grid-cols-[1.25fr_.75fr]">
            <section className="p-6">
              {error ? (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-400">Stage</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{task.stage_name}</p>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-400">Priority</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{task.priority}</p>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-400">Board</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{task.board_name}</p>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-400">Due date</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{formatDate(task.due_date)}</p>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-semibold text-slate-900">Description</h3>
                <div className="mt-2 min-h-24 rounded-xl border bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                  {task.description || "No description added."}
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-center gap-2">
                  <UserRound size={17} />
                  <h3 className="text-sm font-semibold text-slate-900">Assignees</h3>
                </div>
                <div className="mt-3 space-y-2">
                  {task.assignees.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-4 text-sm text-slate-500">
                      No assignees.
                    </div>
                  ) : (
                    task.assignees.map((assignee) => (
                      <div
                        key={String(assignee.id)}
                        className="flex items-center justify-between rounded-xl border p-4"
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{assignee.full_name}</p>
                          <p className="mt-1 text-xs text-slate-500">{assignee.email}</p>
                        </div>
                        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                          {assignee.role}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-center gap-2">
                  <CheckSquare size={17} />
                  <h3 className="text-sm font-semibold text-slate-900">Checklist</h3>
                </div>
                <div className="mt-3 space-y-2">
                  {task.checklist.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-4 text-sm text-slate-500">
                      No checklist items.
                    </div>
                  ) : (
                    task.checklist.map((item) => (
                      <div key={String(item.id)} className="flex items-center gap-3 rounded-xl border p-3">
                        <input type="checkbox" checked={item.is_completed} readOnly />
                        <span className={item.is_completed ? "text-sm text-slate-400 line-through" : "text-sm text-slate-700"}>
                          {item.title}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <aside className="border-t bg-slate-50 p-6 lg:border-l lg:border-t-0">
              <div className="flex items-center gap-2">
                <MessageSquare size={17} />
                <h3 className="text-sm font-semibold text-slate-900">Comments</h3>
              </div>

              <form onSubmit={addComment} className="mt-4">
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  disabled={!permissions.comment || posting}
                  rows={3}
                  placeholder="Write a comment..."
                  className="w-full resize-none rounded-xl border bg-white px-3 py-3 text-sm outline-none focus:border-violet-500 disabled:bg-slate-100"
                />
                <button
                  type="submit"
                  disabled={!permissions.comment || posting || !comment.trim()}
                  className="mt-2 h-9 rounded-lg bg-violet-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {posting ? "Posting..." : "Comment"}
                </button>
              </form>

              <div className="mt-5 space-y-3">
                {task.comments.length === 0 ? (
                  <p className="text-sm text-slate-500">No comments yet.</p>
                ) : (
                  task.comments.map((entry) => (
                    <div key={String(entry.id)} className="rounded-xl border bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900">
                          {entry.user_name || "User"}
                        </p>
                        {entry.user_role ? (
                          <span className="text-[10px] font-semibold text-violet-600">{entry.user_role}</span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm text-slate-700">{entry.body}</p>
                      <p className="mt-2 text-[11px] text-slate-400">{formatDate(entry.created_at)}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-7 border-t pt-5">
                <div className="flex items-center gap-2">
                  <Activity size={17} />
                  <h3 className="text-sm font-semibold text-slate-900">Activity</h3>
                </div>
                <div className="mt-3 space-y-2">
                  {task.activity.length === 0 ? (
                    <p className="text-sm text-slate-500">No activity yet.</p>
                  ) : (
                    task.activity.map((entry) => (
                      <div key={String(entry.id)} className="rounded-xl border bg-white p-3">
                        <p className="text-sm text-slate-700">
                          <span className="font-semibold">{entry.user_name || "System"}</span>{" "}
                          {entry.action.replaceAll("_", " ")}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">{formatDate(entry.created_at)}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}
