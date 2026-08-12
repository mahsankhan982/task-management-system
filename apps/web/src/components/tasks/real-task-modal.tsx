"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckSquare,
  Loader2,
  MessageSquare,
  Plus,
  Save,
  UserRound,
  X,
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { useRole } from "@/contexts/role-context";

type Id = number | string;
type Priority = "Critical" | "High" | "Medium" | "Low";

type Assignee = {
  id: Id;
  full_name: string;
  email: string;
  role: string;
};

type UserOption = Assignee & {
  is_active?: boolean;
};

type WorkflowStage = {
  id: Id;
  name: string;
  position: number;
};

type ChecklistItem = {
  id: Id;
  title: string;
  is_completed: boolean;
  position?: number;
};

type TaskComment = {
  id: Id;
  user_name: string | null;
  user_role?: string | null;
  body: string;
  created_at: string;
};

type ActivityEntry = {
  id: Id;
  action: string;
  user_name: string | null;
  created_at: string;
};

type TaskDetails = {
  id: Id;
  board_id: Id;
  stage_id: Id;
  title: string;
  description: string | null;
  priority: Priority;
  due_date: string | null;
  stage_name: string;
  board_name: string;
  assignees: Assignee[];
  checklist: ChecklistItem[];
  comments: TaskComment[];
  activity: ActivityEntry[];
};

type Props = {
  taskId: Id;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
};

const priorities: Priority[] = ["Critical", "High", "Medium", "Low"];

function formatDate(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function dateInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export default function RealTaskModal({ taskId, onClose, onChanged }: Props) {
  const { permissions } = useRole();
  const [task, setTask] = useState<TaskDetails | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowStage[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [stageId, setStageId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [newChecklist, setNewChecklist] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [addingChecklist, setAddingChecklist] = useState(false);
  const [busyChecklistId, setBusyChecklistId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function loadTask(syncForm = true) {
    try {
      setError("");
      const response = await apiRequest<{ success: boolean; data: TaskDetails }>(
        `/tasks/${taskId}`,
      );
      setTask(response.data);

      if (syncForm) {
        setTitle(response.data.title ?? "");
        setDescription(response.data.description ?? "");
        setPriority(response.data.priority ?? "Medium");
        setStageId(String(response.data.stage_id ?? ""));
        setDueDate(dateInputValue(response.data.due_date));
        setAssigneeIds((response.data.assignees ?? []).map((item) => String(item.id)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load task details");
    } finally {
      setLoading(false);
    }
  }

  async function loadOptions() {
    try {
      const [workflowResponse, usersResponse] = await Promise.all([
        apiRequest<{ success: boolean; data: WorkflowStage[] }>("/workflow"),
        apiRequest<{ success: boolean; data: UserOption[] }>("/users"),
      ]);

      setWorkflow(
        (workflowResponse.data ?? []).sort((a, b) => Number(a.position) - Number(b.position)),
      );
      setUsers((usersResponse.data ?? []).filter((user) => user.is_active !== false));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load task options");
    }
  }

  useEffect(() => {
    setLoading(true);
    loadTask();
    loadOptions();
  }, [taskId]);

  const selectedAssignees = useMemo(
    () => users.filter((user) => assigneeIds.includes(String(user.id))),
    [users, assigneeIds],
  );

  async function saveTask() {
    if (!task || (!permissions.editTask && !permissions.moveTask && !permissions.assignTask)) {
      return;
    }

    try {
      setSaving(true);
      setError("");

      if (permissions.editTask) {
        await apiRequest(`/tasks/${taskId}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: title.trim() || task.title,
            description: description.trim() || null,
            priority,
            due_date: dueDate || null,
            stage_id: stageId || task.stage_id,
          }),
        });
      }

      if (permissions.assignTask) {
        await apiRequest(`/tasks/${taskId}/assignees`, {
          method: "PUT",
          body: JSON.stringify({
            assignee_ids: assigneeIds.map(Number).filter((id) => Number.isInteger(id) && id > 0),
          }),
        });
      }

      await loadTask();
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save task");
    } finally {
      setSaving(false);
    }
  }

  async function toggleChecklist(item: ChecklistItem) {
    if (!permissions.editTask) return;

    const id = String(item.id);
    try {
      setBusyChecklistId(id);
      setError("");
      await apiRequest(`/checklist/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_completed: !item.is_completed }),
      });
      await loadTask(false);
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update checklist");
    } finally {
      setBusyChecklistId(null);
    }
  }

  async function addChecklist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = newChecklist.trim();
    if (!value || !permissions.editTask) return;

    try {
      setAddingChecklist(true);
      setError("");
      await apiRequest("/checklist", {
        method: "POST",
        body: JSON.stringify({
          task_id: taskId,
          title: value,
          position: (task?.checklist.length ?? 0) + 1,
        }),
      });
      setNewChecklist("");
      await loadTask(false);
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add checklist item");
    } finally {
      setAddingChecklist(false);
    }
  }

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
      await loadTask(false);
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add comment");
    } finally {
      setPosting(false);
    }
  }

  function toggleAssignee(id: Id) {
    if (!permissions.assignTask) return;
    const value = String(id);
    setAssigneeIds((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close task details"
        onClick={onClose}
        className="absolute inset-0"
      />

      <div className="relative z-10 max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-20 flex items-start justify-between border-b bg-white px-6 py-5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">
              Task Details
            </p>
            <h2 className="mt-1 truncate text-xl font-semibold text-slate-950">
              {task?.title ?? "Loading task..."}
            </h2>
          </div>

          <div className="ml-4 flex items-center gap-2">
            {(permissions.editTask || permissions.moveTask || permissions.assignTask) && task ? (
              <button
                type="button"
                onClick={saveTask}
                disabled={saving}
                className="flex h-9 items-center gap-2 rounded-lg bg-violet-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {saving ? "Saving..." : "Save"}
              </button>
            ) : null}

            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <X size={19} />
            </button>
          </div>
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

              <div>
                <label className="text-xs font-semibold uppercase text-slate-400">Title</label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={!permissions.editTask}
                  className="mt-2 h-11 w-full rounded-xl border px-3 text-sm font-semibold outline-none focus:border-violet-500 disabled:bg-slate-50"
                />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold uppercase text-slate-400">
                  Stage
                  <select
                    value={stageId}
                    onChange={(event) => setStageId(event.target.value)}
                    disabled={!permissions.moveTask}
                    className="mt-2 h-11 w-full rounded-xl border bg-white px-3 text-sm normal-case text-slate-800 disabled:bg-slate-50"
                  >
                    {workflow.map((stage) => (
                      <option key={String(stage.id)} value={String(stage.id)}>
                        {stage.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-semibold uppercase text-slate-400">
                  Priority
                  <select
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as Priority)}
                    disabled={!permissions.editTask}
                    className="mt-2 h-11 w-full rounded-xl border bg-white px-3 text-sm normal-case text-slate-800 disabled:bg-slate-50"
                  >
                    {priorities.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>

                <div className="rounded-xl border bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-400">Board</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{task.board_name}</p>
                </div>

                <label className="text-xs font-semibold uppercase text-slate-400">
                  Due date
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    disabled={!permissions.editTask}
                    className="mt-2 h-11 w-full rounded-xl border bg-white px-3 text-sm normal-case text-slate-800 disabled:bg-slate-50"
                  />
                </label>
              </div>

              <div className="mt-6">
                <label className="text-sm font-semibold text-slate-900">Description</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={!permissions.editTask}
                  rows={5}
                  className="mt-2 w-full resize-none rounded-xl border bg-white p-4 text-sm leading-6 text-slate-700 outline-none focus:border-violet-500 disabled:bg-slate-50"
                  placeholder="No description added."
                />
              </div>

              <div className="mt-6">
                <div className="flex items-center gap-2">
                  <UserRound size={17} />
                  <h3 className="text-sm font-semibold text-slate-900">Assignees</h3>
                </div>

                {permissions.assignTask ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {users.map((user) => {
                      const checked = assigneeIds.includes(String(user.id));
                      return (
                        <label
                          key={String(user.id)}
                          className="flex cursor-pointer items-center gap-3 rounded-xl border bg-white p-3"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAssignee(user.id)}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-900">
                              {user.full_name}
                            </span>
                            <span className="block truncate text-xs text-slate-500">
                              {user.role}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
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
                            <p className="text-sm font-semibold text-slate-900">
                              {assignee.full_name}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">{assignee.email}</p>
                          </div>
                          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                            {assignee.role}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {permissions.assignTask && selectedAssignees.length > 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Selected: {selectedAssignees.map((item) => item.full_name).join(", ")}
                  </p>
                ) : null}
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
                      <label
                        key={String(item.id)}
                        className="flex items-center gap-3 rounded-xl border p-3"
                      >
                        <input
                          type="checkbox"
                          checked={item.is_completed}
                          disabled={!permissions.editTask || busyChecklistId === String(item.id)}
                          onChange={() => toggleChecklist(item)}
                        />
                        <span
                          className={
                            item.is_completed
                              ? "text-sm text-slate-400 line-through"
                              : "text-sm text-slate-700"
                          }
                        >
                          {item.title}
                        </span>
                      </label>
                    ))
                  )}
                </div>

                {permissions.editTask ? (
                  <form onSubmit={addChecklist} className="mt-3 flex gap-2">
                    <input
                      value={newChecklist}
                      onChange={(event) => setNewChecklist(event.target.value)}
                      placeholder="Add checklist item..."
                      className="h-10 flex-1 rounded-xl border px-3 text-sm outline-none focus:border-violet-500"
                    />
                    <button
                      type="submit"
                      disabled={addingChecklist || !newChecklist.trim()}
                      className="flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50"
                    >
                      <Plus size={15} />
                      Add
                    </button>
                  </form>
                ) : null}
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
                          <span className="text-[10px] font-semibold text-violet-600">
                            {entry.user_role}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm text-slate-700">{entry.body}</p>
                      <p className="mt-2 text-[11px] text-slate-400">
                        {formatDate(entry.created_at)}
                      </p>
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
                        <p className="mt-1 text-[11px] text-slate-400">
                          {formatDate(entry.created_at)}
                        </p>
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
