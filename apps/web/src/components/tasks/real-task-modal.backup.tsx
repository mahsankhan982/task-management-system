"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckSquare,
  Download,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Save,
  Trash2,
  Undo2,
  Upload,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { apiBlobRequest, apiRequest } from "@/lib/api";
import { useRole } from "@/contexts/role-context";
import { getTaskPermissions, isTaskCreator } from "@/lib/permissions";

function AuthImage({ attachmentId, alt, className }: { attachmentId: Id, alt: string, className?: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl = "";
    apiBlobRequest(`/attachments/${attachmentId}/content`)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => setSrc(null));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachmentId]);

  if (!src) return <ImageIcon size={18} />;
  return <img src={src} alt={alt} className={className} />;
}


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
  updated_at: string;
};

type ActivityEntry = { details?: any;
  id: Id;
  action: string;
  user_name: string | null;
  created_at: string;
};

type TaskAttachment = {
  id: Id;
  task_id: Id;
  uploaded_by: Id | null;
  attachment_type: "file" | "link";
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  url: string | null;
  label: string | null;
  uploader_name: string | null;
  created_at: string;
};

type TaskDetails = {
  id: Id;
  board_id: Id;
  stage_id: Id;
  created_by: Id | null;
  created_by_name: string | null;
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
const modalCoreStageNames = ["To Do", "In Progress", "Waiting for Review", "Review", "Completed"] as const;

type AssigneeStage = "To Do" | "In Progress" | "Waiting for Review";

// Older boards still label the review column "Review" or "Waiting for Lead".
function normalizeStageName(name: string | null | undefined) {
  return name === "Review" || name === "Waiting for Lead" ? "Waiting for Review" : name ?? "";
}

// Earlier stages an assignee may send the task back to. The flow ends at
// Waiting for Review, so Completed never appears here.
const backwardStagesByStage: Record<string, AssigneeStage[]> = {
  "In Progress": ["To Do"],
  "Waiting for Review": ["In Progress", "To Do"],
};

function formatDate(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/**
 * Reads @mentions back out of comment text by matching the names of people this
 * user can see. Used when editing a comment, where there is no @ picker to keep
 * track of who was tagged.
 */
function findMentionedIds(text: string, people: UserOption[]) {
  return people
    .filter((person) => {
      const name = person.full_name.trim();
      return name.length > 0 && text.includes(`@${name}`);
    })
    .map((person) => Number(person.id))
    .filter((id) => Number.isInteger(id) && id > 0);
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
  const { role, user } = useRole();
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
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [addingChecklist, setAddingChecklist] = useState(false);
  const [busyChecklistId, setBusyChecklistId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachmentLabel, setAttachmentLabel] = useState("");
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [error, setError] = useState("");
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewImageTitle, setPreviewImageTitle] = useState<string>("");
  const [editingCommentId, setEditingCommentId] = useState<Id | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");

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

  const loadAttachments = useCallback(async () => {
    try {
      const response = await apiRequest<{
        success: boolean;
        data: TaskAttachment[];
      }>(`/attachments?task_id=${taskId}`);

      setAttachments(response.data ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load attachments",
      );
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

  useEffect(() => {
    void Promise.resolve().then(() => loadAttachments());
  }, [loadAttachments]);

  const selectedAssignees = useMemo(
    () => users.filter((user) => assigneeIds.includes(String(user.id))),
    [users, assigneeIds],
  );

  const isAssignedToMe = useMemo(
    () =>
      (task?.assignees ?? []).some(
        (assignee) => Number(assignee.id) === Number(user.id),
      ),
    [task?.assignees, user.id],
  );

  const isMyTask = useMemo(
    () => isTaskCreator(user.id, task?.created_by),
    [task?.created_by, user.id],
  );

  const currentStageName = normalizeStageName(task?.stage_name);

  // Only an assigned Team Member drives the status flow; every other role moves
  // tasks through the stage field instead.
  const isStatusFlowUser = role === "Team Member" && isAssignedToMe;

  const backwardStages = useMemo<AssigneeStage[]>(() => {
    if (!isStatusFlowUser) return [];
    return backwardStagesByStage[currentStageName] ?? [];
  }, [currentStageName, isStatusFlowUser]);

  // A Team Member only edits tasks they created; every other role keeps the
  // permissions of its role. Falls back to no-edit while the task loads.
  const permissions = useMemo(
    () => getTaskPermissions(role, user.id, task?.created_by),
    [role, user.id, task?.created_by],
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
            // Only roles that may move tasks send a stage; a Team Member's
            // moves go through the status flow instead.
            ...(permissions.moveTask ? { stage_id: stageId || task.stage_id } : {}),
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

  async function updateMyTaskStatus(stageName: AssigneeStage) {
    if (false || !task || !isStatusFlowUser) return;

    try {
      setStatusUpdating(true);
      setStatusMenuOpen(false);
      setError("");

      await apiRequest(`/tasks/${taskId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          stage_name: stageName,
        }),
      });

      await loadTask();
      await onChanged?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update task status",
      );
    } finally {
      setStatusUpdating(false);
    }
  }

  // Completing a task belongs to the Team Lead, Manager and Coordinator roles,
  // so it sets the stage directly instead of using the assignee status flow.
  async function completeTask() {
    const completedStage = workflow.find((stage) => stage.name === "Completed");

    if (!task || !permissions.moveTask) return;

    if (!completedStage) {
      setError("This board has no Completed stage");
      return;
    }

    try {
      setStatusUpdating(true);
      setError("");

      await apiRequest(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({
          stage_id: completedStage.id,
        }),
      });

      await loadTask();
      await onChanged?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to complete task",
      );
    } finally {
      setStatusUpdating(false);
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

  async function uploadAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;

    if (!attachmentFile || attachmentBusy) return;

    if (attachmentFile.size > 3 * 1024 * 1024) {
      setError(
        "Maximum direct upload size is 3 MB. For a larger video, paste its Drive/YouTube/other link instead.",
      );
      return;
    }

    try {
      setAttachmentBusy(true);
      setError("");

      const fileData = await attachmentFile.arrayBuffer();

      await apiRequest(
        `/attachments/file?task_id=${taskId}&file_name=${encodeURIComponent(
          attachmentFile.name,
        )}&mime_type=${encodeURIComponent(
          attachmentFile.type || "application/octet-stream",
        )}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
          },
          body: fileData,
        },
      );

      setAttachmentFile(null);
      formElement.reset();
      await loadAttachments();
      await loadTask(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to upload attachment",
      );
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function addLinkAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const url = attachmentUrl.trim();
    if (!url || attachmentBusy) return;

    try {
      setAttachmentBusy(true);
      setError("");

      await apiRequest("/attachments/link", {
        method: "POST",
        body: JSON.stringify({
          task_id: Number(taskId),
          url,
          label: attachmentLabel.trim() || null,
        }),
      });

      setAttachmentUrl("");
      setAttachmentLabel("");
      await loadAttachments();
      await loadTask(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add link");
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function openAttachment(attachment: TaskAttachment) {
    try {
      if (attachment.attachment_type === "link" && attachment.url) {
        window.open(attachment.url, "_blank", "noopener,noreferrer");
        return;
      }

      const blob = await apiBlobRequest(`/attachments/${attachment.id}/content`);
      const blobUrl = URL.createObjectURL(blob);
      
      if (attachment.mime_type?.startsWith("image/")) {
        setPreviewImageUrl(blobUrl);
        setPreviewImageTitle(attachment.file_name || attachment.label || "Image");
      } else {
        window.open(blobUrl, "_blank", "noopener,noreferrer");
        window.setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
        }, 60000);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to open attachment",
      );
    }
  }

  async function downloadAttachment(attachment: TaskAttachment) {
    try {
      if (attachment.attachment_type === "link" && attachment.url) {
        window.open(attachment.url, "_blank", "noopener,noreferrer");
        return;
      }

      const blob = await apiBlobRequest(`/attachments/${attachment.id}/content`);
      const blobUrl = URL.createObjectURL(blob);
      
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = attachment.file_name || "download";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to download attachment",
      );
    }
  }

  async function deleteAttachment(attachment: TaskAttachment) {
    const canDelete =
      false ||
      Number(attachment.uploaded_by) === Number(user.id);

    if (!canDelete) return;

    const name =
      attachment.label ||
      attachment.file_name ||
      attachment.url ||
      "attachment";

    if (!window.confirm(`Delete attachment "${name}"?`)) return;

    try {
      setAttachmentBusy(true);
      setError("");

      await apiRequest(`/attachments/${attachment.id}`, {
        method: "DELETE",
      });

      await loadAttachments();
      await loadTask(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to delete attachment",
      );
    } finally {
      setAttachmentBusy(false);
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

  async function saveEditComment(commentId: Id) {
    const body = editingCommentBody.trim();
    if (!body) return;

    // The edit box has no @ picker, so mentions are read back out of the text.
    // Only names that were not already there are sent, otherwise fixing a typo
    // would notify the same people again.
    const original =
      task?.comments.find((entry) => String(entry.id) === String(commentId))?.body ?? "";
    const alreadyMentioned = findMentionedIds(original, users);
    const newMentions = findMentionedIds(body, users).filter(
      (id) => !alreadyMentioned.includes(id),
    );

    try {
      setPosting(true);
      setError("");
      await apiRequest(`/comments/${commentId}`, {
        method: "PATCH",
        body: JSON.stringify({ body, mention_ids: newMentions }),
      });
      setEditingCommentId(null);
      setEditingCommentBody("");
      await loadTask(false);
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to edit comment");
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

            {task ? (
              <p className="mt-1 truncate text-xs text-slate-500">
                Created by{" "}
                <span className="font-semibold text-slate-700">
                  {isMyTask ? "you" : task.created_by_name ?? "Unknown"}
                </span>
                {!permissions.editTask && role === "Team Member" ? (
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    View only
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>

          <div className="ml-4 flex items-center gap-2">
            {task && backwardStages.length > 0 ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (backwardStages.length === 1) {
                      void updateMyTaskStatus(backwardStages[0]);
                      return;
                    }
                    setStatusMenuOpen((value) => !value);
                  }}
                  disabled={statusUpdating}
                  className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                  title="Move this task back to an earlier stage"
                >
                  <Undo2 size={15} />
                  {backwardStages.length === 1
                    ? `Back to ${backwardStages[0]}`
                    : "Move Back"}
                </button>

                {statusMenuOpen && backwardStages.length > 1 ? (
                  <div className="absolute right-0 top-11 z-50 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                    {backwardStages.map((stageName) => (
                      <button
                        key={stageName}
                        type="button"
                        onClick={() => void updateMyTaskStatus(stageName)}
                        disabled={statusUpdating}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        <Undo2 size={15} />
                        Back to {stageName}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {task ? (
              <>
                {currentStageName === "Completed" ? (
                  <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                    Completed
                  </span>
                ) : null}

                {isStatusFlowUser && currentStageName === "In Progress" ? (
                  <button
                    type="button"
                    onClick={() => void updateMyTaskStatus("Waiting for Review")}
                    disabled={statusUpdating}
                    className="flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {statusUpdating ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <MessageSquare size={15} />
                    )}
                    {statusUpdating ? "Updating..." : "Send for Review"}
                  </button>
                ) : null}

                {isStatusFlowUser && currentStageName === "To Do" ? (
                  <button
                    type="button"
                    onClick={() => void updateMyTaskStatus("In Progress")}
                    disabled={statusUpdating}
                    className="flex h-9 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {statusUpdating ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Activity size={15} />
                    )}
                    {statusUpdating ? "Updating..." : "Start Work"}
                  </button>
                ) : null}

                {/* Reserved for Team Leads, Managers and Coordinators. */}
                {permissions.moveTask && currentStageName !== "Completed" ? (
                  <button
                    type="button"
                    onClick={() => void completeTask()}
                    disabled={statusUpdating}
                    className="flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {statusUpdating ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <CheckSquare size={15} />
                    )}
                    {statusUpdating ? "Updating..." : "Mark Complete"}
                  </button>
                ) : null}
              </>
            ) : null}

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
                error.includes("Team Members cannot perform this action") ? (
                  <div className="mb-5 flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3.5 text-sm font-medium text-violet-800 shadow-sm">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                      i
                    </span>
                    {error}
                  </div>
                ) : (
                  <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </div>
                )
              ) : null}

              {role === "Team Member" && !permissions.editTask ? (
                <div className="mb-5 flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3.5 text-sm font-medium text-violet-800 shadow-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                    i
                  </span>
                  <span>
                    This task was created by{" "}
                    {task.created_by_name ?? "another member"}, so only they can
                    edit it. You can still comment
                    {isAssignedToMe ? " and update its status" : ""}.
                  </span>
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

              <div className="mt-6 border-t border-slate-200 pt-6">
                <div className="flex items-center gap-2">
                  <Paperclip size={17} />
                  <h3 className="text-sm font-semibold text-slate-900">
                    Attachments
                  </h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    {attachments.length}
                  </span>
                </div>

                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Upload a file, image or small video up to 3 MB. For larger
                  videos, Google Drive, YouTube or any other resource, add a
                  link.
                </p>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <form
                    onSubmit={uploadAttachment}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Upload file / image / video
                    </label>

                    <input
                      type="file"
                      onChange={(event) =>
                        setAttachmentFile(event.target.files?.[0] ?? null)
                      }
                      className="mt-2 block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-violet-700"
                    />

                    <button
                      type="submit"
                      disabled={!attachmentFile || attachmentBusy}
                      className="mt-3 flex h-9 items-center gap-2 rounded-lg bg-violet-700 px-4 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {attachmentBusy ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Upload size={14} />
                      )}
                      Upload
                    </button>
                  </form>

                  <form
                    onSubmit={addLinkAttachment}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Add link
                    </label>

                    <input
                      type="url"
                      required
                      value={attachmentUrl}
                      onChange={(event) => setAttachmentUrl(event.target.value)}
                      placeholder="https://..."
                      className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:border-violet-500"
                    />

                    <input
                      value={attachmentLabel}
                      onChange={(event) =>
                        setAttachmentLabel(event.target.value)
                      }
                      placeholder="Display text (optional)"
                      className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:border-violet-500"
                    />

                    <button
                      type="submit"
                      disabled={!attachmentUrl.trim() || attachmentBusy}
                      className="mt-3 flex h-9 items-center gap-2 rounded-lg bg-slate-800 px-4 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      <Link2 size={14} />
                      Add link
                    </button>
                  </form>
                </div>

                <div className="mt-4 space-y-2">
                  {attachments.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                      No attachments yet. Upload images, files or links here. Click uploaded images to open.
                    </div>
                  ) : (
                    attachments.map((attachment) => {
                      const isImage =
                        attachment.mime_type?.startsWith("image/") ?? false;
                      const isVideo =
                        attachment.mime_type?.startsWith("video/") ?? false;
                      const AttachmentIcon =
                        attachment.attachment_type === "link"
                          ? Link2
                          : isImage
                            ? ImageIcon
                            : isVideo
                              ? Video
                              : FileText;

                      const canDelete =
                        false ||
                        Number(attachment.uploaded_by) === Number(user.id);

                      return (
                        <div
                          key={String(attachment.id)}
                          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
                        >
                          <div 
                            className="flex h-10 w-10 shrink-0 overflow-hidden items-center justify-center rounded-lg bg-violet-50 text-violet-700 cursor-pointer"
                            onClick={() => void openAttachment(attachment)}
                          >
                            {isImage ? (
                              <AuthImage attachmentId={attachment.id} alt={attachment.file_name || "image"} className="h-full w-full object-cover" />
                            ) : (
                              <AttachmentIcon size={18} />
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => void openAttachment(attachment)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="truncate text-sm font-semibold text-slate-900 hover:text-violet-700">
                              {attachment.label ||
                                attachment.file_name ||
                                attachment.url ||
                                "Attachment"}
                            </p>

                            <p className="mt-1 truncate text-xs text-slate-500">
                              {attachment.attachment_type === "file"
                                ? `${attachment.mime_type || "File"}${
                                    attachment.file_size
                                      ? ` Ã‚Â· ${Math.max(
                                          1,
                                          Math.round(
                                            Number(attachment.file_size) / 1024,
                                          ),
                                        )} KB`
                                      : ""
                                  }`
                                : attachment.url}
                              {attachment.uploader_name
                                ? ` Ã‚Â· Added by ${attachment.uploader_name}`
                                : ""}
                            </p>
                          </button>

                          {attachment.attachment_type === "file" ? (
                            <button
                              type="button"
                              onClick={() => void downloadAttachment(attachment)}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-violet-50 hover:text-violet-700"
                              title="Download attachment"
                            >
                              <Download size={15} />
                            </button>
                          ) : null}

                          {canDelete ? (
                            <button
                              type="button"
                              onClick={() => void deleteAttachment(attachment)}
                              disabled={attachmentBusy}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                              title="Delete attachment"
                              aria-label="Delete attachment"
                            >
                              <Trash2 size={15} />
                            </button>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
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

                    <div className="mt-2 max-h-[260px] overflow-y-auto rounded-xl border border-slate-300 bg-white">
                      {users.map((user) => {
                        const userId = String(user.id);
                        const checked = assigneeIds.includes(userId);

                        return (
                          <label
                            key={userId}
                            className="flex cursor-pointer items-center gap-3 border-b px-3 py-2.5 text-sm last:border-b-0 hover:bg-slate-50"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!editing || !permissions.assignTask}
                              onChange={() =>
                                setAssigneeIds((current) =>
                                  checked
                                    ? current.filter((id) => id !== userId)
                                    : [...current, userId],
                                )
                              }
                              className="h-4 w-4 shrink-0 rounded border-slate-300 accent-violet-700"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-slate-800">
                                {user.full_name}
                              </span>
                              <span className="block truncate text-xs text-slate-500">
                                {user.email} - {user.role}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    <p className="mt-2 text-xs text-slate-500">
                      Tick one or more employees, then click Save.
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
                 onChange={(e)=>{
  const value = e.target.value;
  setEditingCommentBody(value);
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
                      {editingCommentId === entry.id ? (
                        <div className="mt-2 space-y-2">
                          <textarea
                            value={editingCommentBody}
onChange={(e)=>{
  const value = e.target.value;
  setEditingCommentBody(value);
  setComment(value);
}}
                            className="w-full rounded-lg border p-2 text-sm"
                          />

                          <button
                            type="button"
                            onClick={() => saveEditComment(entry.id)}
                            className="text-xs font-semibold text-green-600"
                          >
                            Save
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingCommentId(null);
                              setEditingCommentBody("");
                            }}
                            className="ml-3 text-xs font-semibold text-red-600"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className="mt-2 text-sm text-slate-700">{entry.body}</p>

                          {entry.user_name === user.full_name ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCommentId(entry.id);
                                setEditingCommentBody(entry.body);
                              }}
                              className="mt-2 text-xs font-semibold text-blue-600 hover:underline"
                            >
                              Edit
                            </button>
                          ) : null}
                        </>
                      )}
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
                         {entry.action === "task_assignees_updated" && entry.details?.assignee_names
  ? `assigned task to ${entry.details.assignee_names.join(", ")}`
  : entry.action === "deadline_updated"
  ? `Deadline updated from ${entry.details?.previous || "none"} to ${entry.details?.current || "none"}`
  : entry.action === "task_created"
  ? `Task Created: ${entry.details?.title || ""} ${entry.details?.description ? "- " + entry.details.description : ""}`
  : entry.action === "task_updated"
  ? `Task Updated: ${entry.details?.title || ""} ${entry.details?.description ? "- " + entry.details.description : ""}`
  : entry.action.replaceAll("_", " ")}
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
      
      {previewImageUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 hover:text-slate-200"
            onClick={() => {
              URL.revokeObjectURL(previewImageUrl);
              setPreviewImageUrl(null);
            }}
          >
            <X size={24} />
          </button>
          <img
            src={previewImageUrl}
            alt={previewImageTitle}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  );
}



















