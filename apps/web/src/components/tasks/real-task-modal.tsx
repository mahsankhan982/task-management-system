"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckSquare,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
  Trash2,
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
  initialEditMode?: boolean;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
};

const priorities: Priority[] = ["Critical", "High", "Medium", "Low"];
const modalCoreStageNames = ["To Do", "In Progress", "Waiting for Lead", "Review", "Completed"] as const;

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

export default function RealTaskModal({
  taskId,
  initialEditMode = false,
  onClose,
  onChanged,
}: Props) {
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
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [newChecklist, setNewChecklist] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(initialEditMode);
  const [taskMenuOpen, setTaskMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [posting, setPosting] = useState(false);
  const [addingChecklist, setAddingChecklist] = useState(false);
  const [busyChecklistId, setBusyChecklistId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadTask = useCallback(async (syncForm = true) => {
    try {
      const response = await apiRequest<{ success: boolean; data: TaskDetails }>(
        `/tasks/${taskId}`,
      );
      setError("");
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
  }, [taskId]);

  const loadOptions = useCallback(async (boardId: Id) => {
    try {
      const [workflowResponse, usersResponse] = await Promise.all([
        apiRequest<{ success: boolean; data: WorkflowStage[] }>(`/workflow?board_id=${boardId}`),
        apiRequest<{ success: boolean; data: UserOption[] }>("/users"),
      ]);

      setWorkflow(
        (workflowResponse.data ?? [])
          .filter((stage) =>
            modalCoreStageNames.includes(stage.name as (typeof modalCoreStageNames)[number]),
          )
          .sort((a, b) => Number(a.position) - Number(b.position)),
      );
      setUsers((usersResponse.data ?? []).filter((user) => user.is_active !== false));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load task options");
    }
  }, []);

  useEffect(() => {
    setEditing(initialEditMode);
  }, [taskId, initialEditMode]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      void loadTask();
    });
  }, [loadTask]);

  useEffect(() => {
    if (!task?.board_id) return;

    void Promise.resolve().then(() => loadOptions(task.board_id));
  }, [task?.board_id, loadOptions]);

  const selectedAssignees = useMemo(
    () => users.filter((user) => assigneeIds.includes(String(user.id))),
    [users, assigneeIds],
  );

  const mentionQuery = useMemo(() => {
    const match = comment.match(/(?:^|\s)@([^@\n]*)$/);
    return match ? match[1].trim().toLowerCase() : null;
  }, [comment]);

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];

    return users
      .filter((user) => !mentionedUserIds.includes(String(user.id)))
      .filter((user) => {
        if (!mentionQuery) return true;
        return (
          user.full_name.toLowerCase().includes(mentionQuery) ||
          user.email.toLowerCase().includes(mentionQuery)
        );
      })
      .slice(0, 6);
  }, [users, mentionQuery, mentionedUserIds]);

  function insertMention(user: UserOption) {
    const atIndex = comment.lastIndexOf("@");
    if (atIndex < 0) return;

    const nextComment =
      comment.slice(0, atIndex) + `@${user.full_name} `;

    setComment(nextComment);
    setMentionedUserIds((current) =>
      current.includes(String(user.id))
        ? current
        : [...current, String(user.id)],
    );
  }

  async function saveTask() {
    if (!task || (!permissions.editTask && !permissions.moveTask && !permissions.assignTask)) {
      return;
    }

    try {
      setSaving(true);
      setSaved(false);
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
      setEditing(false);
      setTaskMenuOpen(false);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save task");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTask() {
    if (!task || !permissions.editTask) return;

    const confirmed = window.confirm(
      `Delete task "${task.title}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      setDeleting(true);
      setError("");
      await apiRequest(`/tasks/${taskId}`, {
        method: "DELETE",
      });
      await onChanged?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete task");
    } finally {
      setDeleting(false);
      setTaskMenuOpen(false);
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

  async function editChecklist(item: ChecklistItem) {
    if (!permissions.editTask) return;

    const nextTitle = window.prompt("Edit checklist item:", item.title)?.trim();
    if (!nextTitle || nextTitle === item.title) return;

    const id = String(item.id);

    try {
      setBusyChecklistId(id);
      setError("");

      await apiRequest(`/checklist/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: nextTitle }),
      });

      await loadTask(false);
      await onChanged?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to edit checklist item",
      );
    } finally {
      setBusyChecklistId(null);
    }
  }

  async function deleteChecklist(item: ChecklistItem) {
    if (!permissions.editTask) return;

    if (!window.confirm(`Delete checklist item "${item.title}"?`)) return;

    const id = String(item.id);

    try {
      setBusyChecklistId(id);
      setError("");

      await apiRequest(`/checklist/${id}`, {
        method: "DELETE",
      });

      await loadTask(false);
      await onChanged?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to delete checklist item",
      );
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
        body: JSON.stringify({
          task_id: taskId,
          body,
          mention_ids: mentionedUserIds
            .map(Number)
            .filter((id) => Number.isInteger(id) && id > 0),
        }),
      });
      setComment("");
      setMentionedUserIds([]);
      await loadTask(false);
      await onChanged?.();
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
            {!editing &&
            (permissions.editTask || permissions.moveTask || permissions.assignTask) &&
            task ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setTaskMenuOpen((value) => !value)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                  title="Task actions"
                  aria-label="Task actions"
                >
                  <MoreHorizontal size={19} />
                </button>

                {taskMenuOpen ? (
                  <div className="absolute right-0 top-11 z-50 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(true);
                        setTaskMenuOpen(false);
                        window.setTimeout(() => {
                          document.getElementById("task-title-input")?.focus();
                        }, 0);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      <Pencil size={15} />
                      Edit Task
                    </button>

                    {permissions.editTask ? (
                      <button
                        type="button"
                        onClick={() => void deleteTask()}
                        disabled={deleting}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 size={15} />
                        {deleting ? "Deleting..." : "Delete Task"}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {editing &&
            (permissions.editTask || permissions.moveTask || permissions.assignTask) &&
            task ? (
              <button
                type="button"
                onClick={saveTask}
                disabled={saving}
                className={`flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white transition disabled:opacity-60 ${saved ? "bg-emerald-600" : "bg-violet-700"}`}
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {saving ? "Saving..." : saved ? "Saved" : "Save"}
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
                  id="task-title-input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={!editing || !permissions.editTask}
                  className="mt-2 h-11 w-full rounded-xl border px-3 text-sm font-semibold outline-none focus:border-violet-500 disabled:bg-slate-50"
                />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold uppercase text-slate-400">
                  Stage
                  <select
                    value={stageId}
                    onChange={(event) => setStageId(event.target.value)}
                    disabled={!editing || !permissions.moveTask}
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
                    disabled={!editing || !permissions.editTask}
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
                    disabled={!editing || !permissions.editTask}
                    className="mt-2 h-11 w-full rounded-xl border bg-white px-3 text-sm normal-case text-slate-800 disabled:bg-slate-50"
                  />
                </label>
              </div>

              <div className="mt-6">
                <label className="text-sm font-semibold text-slate-900">Description</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={!editing || !permissions.editTask}
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
                  <div className="mt-3">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Assign Employee
                    </label>

                    <select
                      value={assigneeIds[0] ?? ""}
                      onChange={(event) =>
                        setAssigneeIds(event.target.value ? [event.target.value] : [])
                      }
                      disabled={!editing || !permissions.assignTask}
                      className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50"
                    >
                      <option value="">Unassigned</option>
                      {users.map((user) => (
                        <option key={String(user.id)} value={String(user.id)}>
                          {user.full_name} — {user.email} — {user.role}
                        </option>
                      ))}
                    </select>

                    <p className="mt-2 text-xs text-slate-500">
                      Select one employee to assign this task.
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {task.assignees.length === 0 ? (
                      <div className="rounded-xl border border-dashed p-4 text-sm text-slate-500">
                        No assignee.
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
                            <p className="mt-1 text-xs text-slate-500">
                              {assignee.email}
                            </p>
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
                      <div
                        key={String(item.id)}
                        className="flex items-center gap-3 rounded-xl border p-3"
                      >
                        <input
                          type="checkbox"
                          checked={item.is_completed}
                          disabled={
                            !permissions.editTask ||
                            busyChecklistId === String(item.id)
                          }
                          onChange={() => toggleChecklist(item)}
                        />

                        <span
                          className={
                            item.is_completed
                              ? "min-w-0 flex-1 text-sm text-slate-400 line-through"
                              : "min-w-0 flex-1 text-sm text-slate-700"
                          }
                        >
                          {item.title}
                        </span>

                        {permissions.editTask ? (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void editChecklist(item)}
                              disabled={busyChecklistId === String(item.id)}
                              className="flex h-8 items-center gap-1 rounded-lg border px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                              title="Edit checklist item"
                            >
                              <Pencil size={13} />
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => void deleteChecklist(item)}
                              disabled={busyChecklistId === String(item.id)}
                              className="flex h-8 items-center gap-1 rounded-lg border border-red-200 px-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                              title="Delete checklist item"
                            >
                              <Trash2 size={13} />
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
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
                  onChange={(event) => {
                    const value = event.target.value;
                    setComment(value);
                    if (!value.includes("@")) setMentionedUserIds([]);
                  }}
                  disabled={!permissions.comment || posting}
                  rows={3}
                  placeholder="Write a comment..."
                  className="w-full resize-none rounded-xl border bg-white px-3 py-3 text-sm outline-none focus:border-violet-500 disabled:bg-slate-100"
                />

                {mentionSuggestions.length > 0 ? (
                  <div className="mt-1 overflow-hidden rounded-xl border border-violet-200 bg-white shadow-lg">
                    <div className="border-b bg-violet-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                      Mention employee
                    </div>

                    {mentionSuggestions.map((user) => (
                      <button
                        key={String(user.id)}
                        type="button"
                        onClick={() => insertMention(user)}
                        className="flex w-full items-center justify-between gap-3 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-slate-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-900">
                            {user.full_name}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {user.email}
                          </span>
                        </span>

                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                          {user.role}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                <p className="mt-1 text-[11px] text-slate-400">
                  Type @ to mention an employee. Mentioned employees receive a notification.
                </p>
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
