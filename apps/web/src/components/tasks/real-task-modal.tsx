"use client";

import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
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
  Search,
  Send,
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
import ChakorLogo from "@/components/brand/chakor-logo";

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
  user_id: Id | null;
  user_name: string | null;
  user_role?: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  task_id?: Id;
  task_title?: string;
};

type ConversationTask = {
  id: Id;
  title: string;
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
  const [openMessageMenuId, setOpenMessageMenuId] = useState<Id | null>(null);
  const [employeeSearchOpen, setEmployeeSearchOpen] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedChatUser, setSelectedChatUser] = useState<UserOption | null>(null);
  const [conversationComments, setConversationComments] = useState<TaskComment[]>([]);
  const [conversationTasks, setConversationTasks] = useState<ConversationTask[]>([]);
  const [replyTaskId, setReplyTaskId] = useState("");
  const [conversationLoading, setConversationLoading] = useState(false);
  const commentFormRef = useRef<HTMLFormElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const loadEmployeeConversation = useCallback(async (employee: UserOption) => {
    try {
      setConversationLoading(true);
      setError("");
      const response = await apiRequest<{
        success: boolean;
        data: TaskComment[];
        tasks: ConversationTask[];
      }>(`/comments/conversation/${employee.id}`);

      setConversationComments(response.data ?? []);
      setConversationTasks(response.tasks ?? []);
      setReplyTaskId((current) => {
        if ((response.tasks ?? []).some((item) => String(item.id) === current)) return current;
        const currentTask = (response.tasks ?? []).find((item) => String(item.id) === String(taskId));
        return String(currentTask?.id ?? response.tasks?.[0]?.id ?? "");
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load employee conversation");
    } finally {
      setConversationLoading(false);
    }
  }, [taskId]);

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

  useEffect(() => {
    const chat = chatScrollRef.current;
    if (!chat) return;

    chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
  }, [task?.comments, conversationComments]);

  const searchedEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    return users
      .filter((entry) => Number(entry.id) !== Number(user.id))
      .filter((entry) =>
        !query || entry.full_name.toLowerCase().includes(query) || entry.email.toLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [employeeSearch, user.id, users]);

  const visibleComments = selectedChatUser ? conversationComments : task?.comments ?? [];

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
    const targetTaskId = selectedChatUser ? replyTaskId : String(taskId);
    if (!body || !permissions.comment || !targetTaskId) return;

    try {
      setPosting(true);
      setError("");
      await apiRequest("/comments", {
        method: "POST",
        body: JSON.stringify({
          task_id: targetTaskId,
          body,
          mention_ids: mentionedUserIds
            .map(Number)
            .filter((id) => Number.isInteger(id) && id > 0),
        }),
      });
      setComment("");
      setMentionedUserIds([]);
      await loadTask(false);
      if (selectedChatUser) await loadEmployeeConversation(selectedChatUser);
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
      visibleComments.find((entry) => String(entry.id) === String(commentId))?.body ?? "";
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
      if (selectedChatUser) await loadEmployeeConversation(selectedChatUser);
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to edit comment");
    } finally {
      setPosting(false);
    }
  }

  async function deleteComment(commentId: Id) {
    try {
      setPosting(true);
      setError("");
      setOpenMessageMenuId(null);
      await apiRequest(`/comments/${commentId}`, { method: "DELETE" });
      if (String(editingCommentId) === String(commentId)) {
        setEditingCommentId(null);
        setEditingCommentBody("");
      }
      await loadTask(false);
      if (selectedChatUser) await loadEmployeeConversation(selectedChatUser);
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete message");
    } finally {
      setPosting(false);
    }
  }

  async function deleteCommentForMe(commentId: Id) {
    try {
      setPosting(true);
      setError("");
      setOpenMessageMenuId(null);
      await apiRequest(`/comments/${commentId}/me`, { method: "DELETE" });
      await loadTask(false);
      if (selectedChatUser) await loadEmployeeConversation(selectedChatUser);
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete message for you");
    } finally {
      setPosting(false);
    }
  }

  async function copyComment(body: string) {
    try {
      await navigator.clipboard.writeText(body);
      setOpenMessageMenuId(null);
    } catch {
      setError("Unable to copy message");
    }
  }

  function handleCommentKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;

    event.preventDefault();
    commentFormRef.current?.requestSubmit();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-md sm:p-5">
      <button
        type="button"
        aria-label="Close task details"
        onClick={onClose}
        className="absolute inset-0"
      />

      <div className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-violet-100 bg-slate-50 shadow-[0_28px_80px_-24px_rgba(22,31,69,0.7)]">
        <div className="h-1 shrink-0 bg-gradient-to-r from-[#161f45] via-violet-600 to-sky-500" />
        <div className="z-20 flex shrink-0 items-start justify-between border-b border-violet-100 bg-gradient-to-r from-white via-violet-50/40 to-sky-50/70 px-5 py-4 sm:px-7">
          <div className="flex min-w-0 flex-1 items-center gap-3.5">
            <ChakorLogo size={42} rounded="rounded-xl" priority className="ring-4 ring-white shadow-md" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-600">
                Chakor Task Management
              </p>
              <h2 className="mt-1 truncate text-xl font-bold tracking-tight text-[#161f45]">
                {task?.title ?? "Loading task..."}
              </h2>

              {task ? (
                <p className="mt-1 truncate text-xs text-slate-500">
                  Created by{" "}
                  <span className="font-semibold text-slate-700">
                    {isMyTask ? "you" : task.created_by_name ?? "Unknown"}
                  </span>
                  {!permissions.editTask && role === "Team Member" ? (
                    <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-violet-700 shadow-sm ring-1 ring-violet-100">
                      View only
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
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
          <div className="min-h-0 flex-1 gap-3 overflow-y-auto bg-gradient-to-br from-[#5c3d8c] via-[#914eaa] to-[#c55bb5] p-3 lg:grid lg:grid-cols-[1.3fr_.7fr]">
            <section className="rounded-2xl border border-white/50 bg-gradient-to-br from-white via-white to-violet-50/60 p-5 shadow-xl shadow-violet-950/15 sm:p-6 lg:p-7">
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
                <div className="mb-5 flex items-start gap-2 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 p-3.5 text-sm font-medium text-violet-800 shadow-sm">
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

              <div className="rounded-2xl border border-violet-100 bg-violet-50/55 p-3.5 shadow-sm">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Title</label>
                <input
                  id="task-title-input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={!editing || !permissions.editTask}
                  className="mt-2 h-11 w-full rounded-xl border border-violet-200 bg-white px-3.5 text-sm font-semibold shadow-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:bg-white/70 disabled:text-slate-600"
                />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3 text-[11px] font-bold uppercase tracking-wider text-sky-700 shadow-sm">
                  Stage
                  <select
                    value={stageId}
                    onChange={(event) => setStageId(event.target.value)}
                    disabled={!editing || !permissions.moveTask}
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case text-slate-800 shadow-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50"
                  >
                    {workflow.map((stage) => (
                      <option key={String(stage.id)} value={String(stage.id)}>
                        {stage.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3 text-[11px] font-bold uppercase tracking-wider text-amber-700 shadow-sm">
                  Priority
                  <select
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as Priority)}
                    disabled={!editing || !permissions.editTask}
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case text-slate-800 shadow-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50"
                  >
                    {priorities.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>

                <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50/80 to-white p-4 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-cyan-700">Board</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{task.board_name}</p>
                </div>

                <label className="rounded-2xl border border-rose-100 bg-rose-50/60 p-3 text-[11px] font-bold uppercase tracking-wider text-rose-700 shadow-sm">
                  Due date
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    disabled={!editing || !permissions.editTask}
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case text-slate-800 shadow-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50"
                  />
                </label>
              </div>

              <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/45 p-4 shadow-sm">
                <label className="text-sm font-bold text-indigo-950">Description</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={!editing || !permissions.editTask}
                  rows={5}
                  className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700 shadow-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50"
                  placeholder="No description added."
                />
              </div>

              <div className="mt-6 rounded-2xl border border-fuchsia-100 bg-fuchsia-50/35 p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-fuchsia-100 text-fuchsia-700"><Paperclip size={16} /></span>
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

              <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/35 p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700"><UserRound size={16} /></span>
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

              <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/35 p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><CheckSquare size={16} /></span>
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

            <aside className="rounded-2xl border border-white/55 bg-gradient-to-b from-violet-50/95 via-white to-sky-50/95 p-4 shadow-xl shadow-violet-950/15 sm:p-5">
              <div className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-[0_12px_32px_-20px_rgba(76,29,149,0.45)]">
                <div className="relative flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
                  {selectedChatUser ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedChatUser(null);
                        setConversationComments([]);
                        setConversationTasks([]);
                        setReplyTaskId("");
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-violet-50 hover:text-violet-700"
                      aria-label="Back to current task conversation"
                    >
                      <ArrowLeft size={16} />
                    </button>
                  ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                    <MessageSquare size={16} />
                  </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-slate-900">
                      {selectedChatUser ? selectedChatUser.full_name : "Task conversation"}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {selectedChatUser ? "All shared task chats" : `${visibleComments.length} messages`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEmployeeSearchOpen((open) => !open)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-100 bg-violet-50 text-violet-700 transition hover:bg-violet-100"
                    aria-label="Search employee conversations"
                    title="Search employee conversations"
                  >
                    <Search size={17} />
                  </button>

                  {employeeSearchOpen ? (
                    <div className="absolute left-3 right-3 top-[calc(100%+6px)] z-40 overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-2xl">
                      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
                        <Search size={15} className="text-slate-400" />
                        <input
                          value={employeeSearch}
                          onChange={(event) => setEmployeeSearch(event.target.value)}
                          autoFocus
                          placeholder="Search employee name..."
                          className="h-8 min-w-0 flex-1 text-sm outline-none"
                        />
                        <button type="button" onClick={() => setEmployeeSearchOpen(false)} className="text-slate-400 hover:text-slate-700">
                          <X size={15} />
                        </button>
                      </div>
                      <div className="max-h-60 overflow-y-auto p-1.5">
                        {searchedEmployees.length === 0 ? (
                          <p className="px-3 py-4 text-center text-xs text-slate-500">No employee found.</p>
                        ) : searchedEmployees.map((employee) => (
                          <button
                            key={String(employee.id)}
                            type="button"
                            onClick={() => {
                              setSelectedChatUser(employee);
                              setEmployeeSearchOpen(false);
                              setEmployeeSearch("");
                              void loadEmployeeConversation(employee);
                            }}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-violet-50"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-700 text-xs font-bold text-white">
                              {employee.full_name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-slate-800">{employee.full_name}</span>
                              <span className="block truncate text-[11px] text-slate-500">{employee.role} · {employee.email}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div
                  ref={chatScrollRef}
                  className="h-[270px] space-y-2 overflow-y-auto scroll-smooth bg-gradient-to-b from-violet-50/50 via-slate-50 to-sky-50/60 px-3 py-3"
                  onClick={() => setOpenMessageMenuId(null)}
                >
                {conversationLoading ? (
                  <div className="flex h-full items-center justify-center gap-2 text-sm text-violet-700">
                    <Loader2 size={17} className="animate-spin" /> Loading conversation...
                  </div>
                ) : visibleComments.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="rounded-full bg-white/80 px-4 py-2 text-xs text-slate-500 shadow-sm">
                      No messages yet. Start the conversation.
                    </p>
                  </div>
                ) : (
                  visibleComments.map((entry) => {
                    const isMine = Number(entry.user_id) === Number(user.id);
                    const isDeleted = Boolean(entry.deleted_at);
                    const wasEdited = !isDeleted && new Date(entry.updated_at).getTime() > new Date(entry.created_at).getTime();
                    const menuIsOpen = String(openMessageMenuId) === String(entry.id);

                    return (
                    <div key={String(entry.id)} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div className="relative flex max-w-[92%] items-start gap-1">
                      <div
                        className={`relative rounded-xl border px-3 py-2 shadow-sm ${
                          isMine
                            ? "border-violet-200 bg-gradient-to-br from-violet-100 to-indigo-50 text-slate-800"
                            : "border-slate-200 bg-white text-slate-800"
                        }`}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!isDeleted) setOpenMessageMenuId(menuIsOpen ? null : entry.id);
                        }}
                      >
                        {!isMine && !isDeleted ? (
                          <p className="mb-1 text-xs font-semibold text-emerald-700">
                            {entry.user_name || "User"}
                          </p>
                        ) : null}
                        {selectedChatUser && entry.task_title ? (
                          <p className="mb-1 inline-flex max-w-full rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-500">
                            Task: {entry.task_title}
                          </p>
                        ) : null}

                      {String(editingCommentId) === String(entry.id) && !isDeleted ? (
                        <div className="min-w-60 space-y-2" onClick={(event) => event.stopPropagation()}>
                          <textarea
                            value={editingCommentBody}
                            onChange={(event) => setEditingCommentBody(event.target.value)}
                            rows={3}
                            autoFocus
                            className="w-full resize-none rounded-xl border border-emerald-300 bg-white p-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCommentId(null);
                                setEditingCommentBody("");
                              }}
                              className="rounded-lg px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={posting || !editingCommentBody.trim()}
                              onClick={() => void saveEditComment(entry.id)}
                              className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className={`whitespace-pre-wrap break-words text-sm ${isDeleted ? "italic text-slate-500" : ""}`}>
                            {isDeleted ? "This message was deleted" : entry.body}
                          </p>
                          <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-slate-500">
                            {wasEdited ? <span>Edited</span> : null}
                            <time dateTime={entry.created_at}>
                              {new Date(entry.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </time>
                          </div>
                        </>
                      )}

                      {menuIsOpen && !isDeleted ? (
                        <div
                          className={`absolute top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border bg-white py-1 shadow-xl ${isMine ? "right-0" : "left-0"}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {isMine ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCommentId(entry.id);
                                  setEditingCommentBody(entry.body);
                                  setOpenMessageMenuId(null);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
                              >
                                <Pencil size={13} /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteComment(entry.id)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50"
                              >
                                <Trash2 size={13} /> Delete for everyone
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void deleteCommentForMe(entry.id)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                          >
                            <Trash2 size={13} /> Delete for me
                          </button>
                          <button
                            type="button"
                            onClick={() => void copyComment(entry.body)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
                          >
                            <FileText size={13} /> Copy
                          </button>
                        </div>
                      ) : null}
                      </div>
                      {!isDeleted ? (
                        <button
                          type="button"
                          aria-label="Message actions"
                          title="Message actions"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenMessageMenuId(menuIsOpen ? null : entry.id);
                          }}
                          className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-slate-800"
                        >
                          <MoreHorizontal size={17} />
                        </button>
                      ) : null}
                      </div>
                    </div>
                    );
                  })
                )}
                </div>

                <form ref={commentFormRef} onSubmit={addComment} className="relative border-t border-violet-100 bg-white p-3">
                  {mentionSuggestions.length > 0 ? (
                    <div className="absolute bottom-full left-3 right-3 z-30 mb-1 max-h-56 overflow-y-auto rounded-xl border border-emerald-200 bg-white shadow-xl">
                      <div className="border-b bg-emerald-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                        Mention employee
                      </div>
                      {mentionSuggestions.map((mentionUser) => (
                        <button
                          key={String(mentionUser.id)}
                          type="button"
                          onClick={() => insertMention(mentionUser)}
                          className="flex w-full items-center justify-between gap-3 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-slate-50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-900">{mentionUser.full_name}</span>
                            <span className="block truncate text-xs text-slate-500">{mentionUser.email}</span>
                          </span>
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{mentionUser.role}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {selectedChatUser ? (
                    <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-violet-700">
                      Reply in task
                      <select
                        value={replyTaskId}
                        onChange={(event) => setReplyTaskId(event.target.value)}
                        className="mt-1 h-9 w-full rounded-xl border border-violet-200 bg-violet-50 px-3 text-xs font-semibold normal-case text-slate-700 outline-none focus:border-violet-400"
                      >
                        {conversationTasks.length === 0 ? <option value="">No shared task available</option> : null}
                        {conversationTasks.map((conversationTask) => (
                          <option key={String(conversationTask.id)} value={String(conversationTask.id)}>
                            {conversationTask.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <div className="flex items-end gap-2">
                    <textarea
                      value={comment}
                      onChange={(event) => {
                        const value = event.target.value;
                        setComment(value);
                        if (!value.includes("@")) setMentionedUserIds([]);
                      }}
                      onKeyDown={handleCommentKeyDown}
                      disabled={!permissions.comment || posting}
                      rows={2}
                      placeholder={selectedChatUser ? `Reply to ${selectedChatUser.full_name}...` : "Type a message... Use @ to mention"}
                      className="max-h-32 min-h-12 flex-1 resize-none rounded-3xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
                    />
                    <button
                      type="submit"
                      aria-label="Send message"
                      disabled={!permissions.comment || posting || !comment.trim() || Boolean(selectedChatUser && !replyTaskId)}
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-[#161f45] text-white shadow-lg shadow-violet-200 transition hover:scale-[1.03] hover:from-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {posting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                  </div>
                  <p className="mt-1 px-2 text-[10px] text-slate-500">Enter to send · Shift + Enter for a new line</p>
                </form>
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






