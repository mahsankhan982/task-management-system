"use client";

import UserAvatar from "@/components/profile/user-avatar";

import {
  Loader2,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Clock3,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, useRef, type DragEvent, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, apiRequest } from "@/lib/api";
import { useRole } from "@/contexts/role-context";
import { canMoveTask, canEditTaskDueDate, isTaskCreator } from "@/lib/permissions";
import RealTaskModal from "@/components/tasks/real-task-modal";
import EmployeeFilter from "@/components/boards/employee-filter";
import BoardNavPanels from "@/components/boards/board-nav-panels";

type Priority = "Critical" | "High" | "Medium" | "Low";

type Board = {
  id: number;
  name: string;
  description: string | null;
  team_id: number | null;
  team_name: string | null;
  parent_board_id?: number | string | null;
  created_by?: number | null;
  is_system?: boolean;
};

type Team = {
  id: number;
  name: string;
};

type WorkflowStage = {
  id: number;
  name: string;
  position: number;
  board_id?: number;
  created_by?: number | null;
  is_system?: boolean;
};

type Task = {
  id: number;
  board_id: number;
  stage_id: number;
  creative_list_id?: number | string | null;
  title: string;
  description: string | null;
  priority: Priority;
  due_date: string | null;
  board_name: string;
  stage_name: string;
  created_by: number | null;
  created_by_name: string | null;
  assignees: Array<{ id: number; full_name: string; role?: string; email?: string; avatar_url?: string | null }>;
};

const stageIcons = {
  "To Do": CircleDot,
  "In Progress": Clock3,
  "For Posting": CircleDot,
  "Waiting for Review": MessageSquare,
  Review: MessageSquare,
  Completed: CheckCircle2,
  Complete: CheckCircle2,
} as const;

const priorityClass: Record<Priority, string> = {
  Critical: "bg-red-50 text-red-700 border-red-200",
  High: "bg-red-50 text-red-700 border-red-200",
  Medium: "bg-yellow-50 text-yellow-700 border-yellow-200",
  Low: "bg-green-50 text-green-700 border-green-200",
};

const priorityBorderClass: Record<Priority, string> = {
  Critical: "border-l-red-500",
  High: "border-l-red-400",
  Medium: "border-l-yellow-400",
  Low: "border-l-green-400",
};

// Older boards still label the review column "Review" or "Waiting for Lead".
function normalizeStageName(name: string) {
  return ["Review", "Waiting for Lead"].includes(name) ? "Waiting for Review" : name;
}

// Stages an assignee may drag their task into, per stage it sits in now. The
// flow moves forward one step at a time and back to any earlier stage.
// Completed is missing on purpose: only a Team Lead, Manager or Coordinator
// puts a task there.

const permanentBoardNames = new Set([
  "creative", "creative board",
  "website", "website board",
  "digital", "digital board",
  "qa", "qa board",
]);

function isPermanentBoard(board: Board | undefined) {
  return Boolean(board?.is_system) || permanentBoardNames.has(String(board?.name ?? "").trim().toLowerCase());
}

function localCalendarDate(date: Date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

export default function BoardsPage() {
  const [localToday, setLocalToday] = useState(() => localCalendarDate(new Date()));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const now = new Date();
      setLocalToday(localCalendarDate(now));
      // Local midnight scheduling accounts for daylight-saving days as well.
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(refresh, Math.max(100, midnight.getTime() - now.getTime() + 50));
    };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    timer = setTimeout(refresh, 0);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => { clearTimeout(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", visible); };
  }, []);
  const getDueState = (task: Task) => {
    const due = String(task.due_date ?? "").match(/^\d{4}-\d{2}-\d{2}(?=$|T|\s)/)?.[0];
    if (!due) return "normal";
    if (due < localToday) return "overdue";
    if (due === localToday) return "today";
    return "normal";
  };

  const router=useRouter();
  const searchParams = useSearchParams();
  const requestedBoardId = Number(searchParams.get("boardId"));
  const requestedListId=Number(searchParams.get("creativeListId"));
  const requestedTaskId = Number(searchParams.get("task"));

  const { permissions, role, user } = useRole();
  const canManageBoards = ["Manager", "Admin", "Coordinator", "Team Lead"].includes(role);
  const [boards, setBoards] = useState<Board[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowStage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<number[]>([]);
  const [dueDateFilter, setDueDateFilter] = useState({ start: "", end: "" });
  const [dateDraft, setDateDraft] = useState({ start: "", end: "" });
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [dateFilterError, setDateFilterError] = useState("");
  const dateTriggerRef = useRef<HTMLButtonElement>(null);
  const datePopupRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!dateFilterOpen) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!dateTriggerRef.current?.contains(target) && !datePopupRef.current?.contains(target)) setDateFilterOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setDateFilterOpen(false); dateTriggerRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", escape); };
  }, [dateFilterOpen]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createStageId, setCreateStageId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [dropStageId, setDropStageId] = useState<number | null>(null);
  const [movingTaskId, setMovingTaskId] = useState<number | null>(null);
  const moveInFlight = useRef(false);
  const [moveNotice, setMoveNotice] = useState("");
  useEffect(() => { if (!moveNotice) return; const timer = window.setTimeout(() => setMoveNotice(""), 4000); return () => window.clearTimeout(timer); }, [moveNotice]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedTaskInitialEdit, setSelectedTaskInitialEdit] = useState(false);

  function closeTaskModal() {
    setSelectedTaskInitialEdit(false);
    setSelectedTaskId(null);

    // Consume the notification task URL so later data refreshes cannot reopen it.
    const url = new URL(window.location.href);
    url.searchParams.delete("task");
    url.searchParams.delete("notification");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  async function loadData() {
    try {
      const [boardsResponse, tasksResponse, workflowResponse, teamsResponse] = (await Promise.all([
        api.boards(),
        api.tasks(),
        api.workflow(),
        api.teams(),
      ])) as [
        { success: boolean; data: Board[] },
        { success: boolean; data: Task[] },
        { success: boolean; data: WorkflowStage[] },
        { success: boolean; data: Team[] },
      ];

      const nextBoards = (boardsResponse.data ?? []).map((board) => ({
        ...board,
        id: Number(board.id),
        team_id: board.team_id === null ? null : Number(board.team_id),
      }));

      const nextTeams = (teamsResponse.data ?? []).map((team) => ({
        ...team,
        id: Number(team.id),
      }));

      const nextTasks = (tasksResponse.data ?? []).map((task) => ({
        ...task,
        id: Number(task.id),
        board_id: Number(task.board_id),
        stage_id: Number(task.stage_id),
        created_by: task.created_by === null || task.created_by === undefined
          ? null
          : Number(task.created_by),
      }));

      const nextWorkflow = (workflowResponse.data ?? [])
        .map((stage) => ({
          ...stage,
          id: Number(stage.id),
          board_id:
            stage.board_id === undefined
              ? undefined
              : Number(stage.board_id),
          position: Number(stage.position),
        }))
        .sort((a, b) => a.position - b.position);

      // System stages are initialized by the workflow API; reads never POST lists.
      setError("");
      setBoards(nextBoards);
      setTeams(nextTeams);
      setTasks(nextTasks);
      setWorkflow(nextWorkflow);

      const requestedTask =
        Number.isFinite(requestedTaskId) && requestedTaskId > 0
          ? nextTasks.find((task) => Number(task.id) === requestedTaskId)
          : undefined;

      setSelectedBoardId((current) => {
        if (
          requestedTask &&
          nextBoards.some(
            (board) => Number(board.id) === Number(requestedTask.board_id),
          )
        ) {
          return Number(requestedTask.board_id);
        }

        if (
          Number.isFinite(requestedBoardId) &&
          requestedBoardId > 0 &&
          nextBoards.some((board) => Number(board.id) === requestedBoardId)
        ) {
          return requestedBoardId;
        }

        if (current && nextBoards.some((board) => Number(board.id) === Number(current))) {
          return Number(current);
        }

        return nextBoards[0]?.id ?? null;
      });

      if(requestedTask?.creative_list_id&&Number(requestedTask.creative_list_id)!==requestedListId){
        router.replace('/dashboard/boards?boardId='+requestedTask.board_id+'&creativeListId='+requestedTask.creative_list_id+'&task='+requestedTask.id,{scroll:false});
      }
      if (requestedTask) {
        setSelectedTaskInitialEdit(false);
        setSelectedTaskId(Number(requestedTask.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load board data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadData());
  }, [requestedBoardId, requestedTaskId, requestedListId]);

  const selectedBoard = boards.find((board) => board.id === selectedBoardId);
  const creativeRoot=boards.find(board=>!board.parent_board_id&&['creative','creative board'].includes(board.name.trim().toLowerCase()));
  const isCreative=Boolean(creativeRoot&&(selectedBoardId===creativeRoot.id||Number(selectedBoard?.parent_board_id)===creativeRoot.id));
  const coreNames=new Set(['To Do','In Progress','Waiting for Review','Review','Waiting for Lead','For Posting','Completed']);
  const creativeBoards=creativeRoot?boards.filter(board=>Number(board.parent_board_id)===creativeRoot.id):[];
  const creativeLists=creativeRoot?workflow.filter(stage=>!stage.is_system&&!coreNames.has(stage.name)&&(Number(stage.board_id)===creativeRoot.id||creativeBoards.some(board=>board.id===Number(stage.board_id)))):[];
  const creativeOptions=creativeRoot?[
    ...creativeBoards.map(board=>({key:'board:'+board.id,name:board.name,boardId:board.id,listId:0})),
    ...creativeLists.map(stage=>({key:'list:'+stage.id,name:Number(stage.board_id)===creativeRoot.id?stage.name:(boards.find(board=>board.id===Number(stage.board_id))?.name+' / '+stage.name),boardId:Number(stage.board_id),listId:stage.id})),
    {key:'board:'+creativeRoot.id,name:'Creative Main Board',boardId:creativeRoot.id,listId:0},
  ]:[];
  const activeCreativeOption=creativeOptions.find(option=>option.boardId===selectedBoardId&&option.listId===requestedListId);
  const isCreativeSubBoard=isCreative&&(selectedBoardId!==creativeRoot?.id||requestedListId>0);
  const selectedCreativeList=creativeLists.find(stage=>stage.id===requestedListId);

  function openCreativeOption(option?: typeof creativeOptions[number]) {
    if(!creativeRoot)return;
    setShowCreate(false);setCreateStageId(null);setDraggedTaskId(null);setDropStageId(null);setSelectedTaskId(null);
    setSelectedBoardId(option?.boardId??creativeRoot.id);
    router.push('/dashboard/boards?boardId='+(option?.boardId??creativeRoot.id)+(option?.listId?'&creativeListId='+option.listId:option?.boardId===creativeRoot.id?'&view=workflow':''),{scroll:false});
  }
  function selectBoard(boardId:number){
    const target=boards.find(board=>board.id===boardId);
    if(isCreative||target?.id===creativeRoot?.id||Number(target?.parent_board_id)===creativeRoot?.id){
      setShowCreate(false);setCreateStageId(null);setDraggedTaskId(null);setSelectedBoardId(boardId);
      router.push('/dashboard/boards?boardId='+boardId,{scroll:false});
    }else setSelectedBoardId(boardId);
  }

  const boardWorkflow = useMemo(
    () =>
      workflow
        .filter(
          (stage) =>
            stage.board_id === undefined ||
            Number(stage.board_id) === Number(selectedBoardId),
        )
        .sort((a, b) => a.position - b.position),
    [workflow, selectedBoardId],
  );

  const displayWorkflow = useMemo(() => {
    const byName = (name: string) =>
      boardWorkflow.find((stage) => stage.name === name);

    const toDo = byName("To Do");
    const inProgress = byName("In Progress");
    const forPosting = byName("For Posting");
    const waiting = byName("Waiting for Review");
    const review = byName("Review");
    const waitingForLead = byName("Waiting for Lead");
    const Completed = byName("Completed");

    const coreIds = new Set(
      [toDo, inProgress, forPosting, waiting, review, waitingForLead, Completed]
        .filter(Boolean)
        .map((stage) => Number(stage!.id)),
    );

    const customLists = boardWorkflow
      .filter(
        (stage) =>
          !stage.is_system &&
          !coreIds.has(Number(stage.id)),
      )
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map((stage) => ({
        id: Number(stage.id),
        name: stage.name,
        stageIds: [Number(stage.id)],
        created_by: stage.created_by,
        is_system: false,
      }));

    const otherSystemLists = boardWorkflow
      .filter(
        (stage) =>
          Boolean(stage.is_system) &&
          !coreIds.has(Number(stage.id)),
      )
      .map((stage) => ({
        id: Number(stage.id),
        name: stage.name,
        stageIds: [Number(stage.id)],
        created_by: stage.created_by,
        is_system: true,
      }));

    return [
      toDo
        ? {
            id: Number(toDo.id),
            name: "To Do",
            stageIds: [Number(toDo.id)],
            created_by: toDo.created_by,
            is_system: true,
          }
        : null,
      ...(isCreative?[]:customLists),
      inProgress
        ? {
            id: Number(inProgress.id),
            name: "In Progress",
            stageIds: [Number(inProgress.id)],
            created_by: inProgress.created_by,
            is_system: true,
          }
        : null,
      waiting || review || waitingForLead
        ? {
            id: Number((waiting ?? review ?? waitingForLead)!.id),
            name: "Waiting for Review",
            stageIds: [waiting?.id, review?.id, waitingForLead?.id]
              .filter((id): id is number => typeof id === "number")
              .map(Number),
            created_by: (waiting ?? review ?? waitingForLead)!.created_by,
            is_system: true,
          }
        : null,
      ...(!isCreative || tasks.some(task => Number(task.board_id) === selectedBoardId && Number(task.creative_list_id ?? 0) === requestedListId && Number(task.stage_id) === Number(forPosting?.id)) ? [{
        id: forPosting ? Number(forPosting.id) : -1,
        name: "For Posting",
        stageIds: forPosting ? [Number(forPosting.id)] : [],
        created_by: forPosting?.created_by,
        is_system: true,
      }] : []),
      Completed
        ? {
            id: Number(Completed.id),
            name: isCreative?"Complete":"Completed",
            stageIds: [Number(Completed.id)],
            created_by: Completed.created_by,
            is_system: true,
          }
        : null,
      ...(isCreative?[]:otherSystemLists),
    ].filter(Boolean) as Array<{
      id: number;
      name: string;
      stageIds: number[];
      created_by?: number | null;
      is_system?: boolean;
    }>;
  }, [boardWorkflow, isCreative, tasks, selectedBoardId, requestedListId]);

  // Team Members create tasks in To Do and cannot select another stage.
  const creatableWorkflow = useMemo(
    () =>
      (role === "Team Member" || isCreative)
        ? displayWorkflow.filter((stage) => stage.id > 0 && stage.name === "To Do")
        : displayWorkflow.filter((stage) => stage.id > 0),
    [displayWorkflow, role, isCreative],
  );


  const boardTasks = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (task.board_id !== selectedBoardId) return false;
      if(isCreative&&Number(task.creative_list_id??0)!==requestedListId)return false;
      if (assigneeFilter.length && !task.assignees?.some((a) => assigneeFilter.includes(Number(a.id)))) return false;
      if (dueDateFilter.start || dueDateFilter.end) {
        // API date/ISO prefixes are calendar dates: never parse a timezone here.
        const due = String(task.due_date ?? "").match(/^\d{4}-\d{2}-\d{2}(?=$|T|\s)/)?.[0];
        const start = dueDateFilter.start || dueDateFilter.end;
        const end = dueDateFilter.end || dueDateFilter.start;
        if (!due || due < start || due > end) return false;
      }
      if (!clean) return true;
      return (
        task.title.toLowerCase().includes(clean) ||
        task.priority.toLowerCase().includes(clean) ||
        task.stage_name.toLowerCase().includes(clean)
      );
    });
  }, [tasks, selectedBoardId, query, assigneeFilter, dueDateFilter, isCreative, requestedListId]);

  async function moveTask(taskId: number, stageId: number) {
    if (stageId < 0) {
      setError("A board manager needs to open this board to initialize For Posting before tasks can be moved into it.");
      return;
    }
    const task = tasks.find((item) => item.id === taskId);
    const targetStage = boardWorkflow.find((stage) => stage.id === stageId);
    if (!task || !targetStage) return;
    const targetStageName = normalizeStageName(targetStage.name);

    if (!canMoveTask(role, user.id, task) || moveInFlight.current || Number(task.stage_id) === stageId) return;
    moveInFlight.current = true;
    setMovingTaskId(taskId); setMoveNotice("");
    setTasks(current => current.map(item => item.id === taskId ? { ...item, stage_id: stageId, stage_name: targetStageName } : item));
    try {
      const response = await apiRequest<{ data: Partial<Task> }>("/tasks/" + taskId + "/status", { method: "PATCH", body: JSON.stringify({ stage_id: stageId }) });
      setTasks(current => current.map(item => item.id === taskId ? { ...item, stage_id: Number(response.data.stage_id ?? stageId), stage_name: response.data.stage_name ?? targetStageName } : item));
      setError("");
      setMoveNotice("Task #" + taskId + " moved to " + targetStageName + ".");
    } catch (err) {
      setTasks(current => current.map(item => item.id === taskId ? task : item));
      setError(err instanceof Error ? err.message : "Unable to move task");
    } finally { moveInFlight.current = false; setMovingTaskId(null); setDropStageId(null); }
  }

  function handleDragStart(event: DragEvent<HTMLElement>, taskId: number) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) { event.preventDefault(); return; }
    if (!canMoveTask(role, user.id, task) || moveInFlight.current) { event.preventDefault(); return; }
    setDraggedTaskId(taskId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(taskId));
  }
  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBoardId) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const title = String(form.get("title") || "").trim();
    const priority = String(form.get("priority") || "Medium") as Priority;
    const stageId = isCreative ? Number(creatableWorkflow[0]?.id) : Number(form.get("stage_id"));
    const dueDate = String(form.get("due_date") || "");

    if (!title || !stageId) return;

    setCreating(true);
    setError("");

    try {
      const result = await apiRequest<{
        success: boolean;
        data: { id: number | string };
      }>("/tasks", {
        method: "POST",
        body: JSON.stringify({
          board_id: selectedBoardId,
          stage_id: stageId,
          ...(isCreative&&requestedListId>0?{creative_list_id:requestedListId}:{}),
          title,
          priority,
          ...(role === "Team Member" ? { assignee_ids: [user.id] } : {}),
          ...(canEditTaskDueDate(role) ? { due_date: dueDate || null } : {}),
        }),
      });

      formElement.reset();
      setShowCreate(false);
      setCreateStageId(null);
      await loadData();

      if (result.data?.id) {
        setSelectedTaskInitialEdit(true);
        setSelectedTaskId(Number(result.data.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create task");
    } finally {
      setCreating(false);
    }
  }

  function chooseTeam(currentTeamId?: number | null) {
    if (teams.length === 0) {
      window.alert("Create a team first from the Teams page.");
      return undefined;
    }

    const choices = teams.map((team) => `${team.id}: ${team.name}`).join("\n");
    const raw = window.prompt(
      `Enter Team ID for this board:\n\n${choices}`,
      currentTeamId ? String(currentTeamId) : String(teams[0].id),
    );

    if (raw === null) return undefined;
    if (!raw.trim()) return null;

    const teamId = Number(raw);
    if (!Number.isFinite(teamId) || !teams.some((team) => Number(team.id) === teamId)) {
      window.alert("Invalid Team ID.");
      return undefined;
    }

    return teamId;
  }

  async function createBoard() {
    if (!permissions.moveTask) return;

    const name = window.prompt("Board name:")?.trim();
    if (!name) return;

    const description = window.prompt("Board description (optional):")?.trim() || null;
    const team_id = chooseTeam();
    if (team_id === undefined) return;

    try {
      setError("");
      const result = (await apiRequest("/boards", {
        method: "POST",
        body: JSON.stringify({ name, description, team_id }),
      })) as { data: Board };

      await loadData();
      if (result.data?.id) setSelectedBoardId(Number(result.data.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create board");
    }
  }

  async function editBoard(board: Board) {
    if (!permissions.moveTask) return;

    const name = window.prompt("Board name:", board.name)?.trim();
    if (!name) return;

    const description =
      window.prompt("Board description:", board.description ?? "")?.trim() || null;
    const team_id = chooseTeam(board.team_id);
    if (team_id === undefined) return;

    try {
      setError("");
      await apiRequest(`/boards/${board.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, description, team_id }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update board");
    }
  }

  async function deleteBoard(board: Board) {
    if (!canManageBoards || isPermanentBoard(board)) return;
    if (!window.confirm(`Delete board "${board.name}"?`)) return;
    try {
      setError("");
      await apiRequest(`/boards/${board.id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete board");
    }
  }


  async function createList() {
    if (!canManageBoards || !selectedBoardId) return;

    const name = window.prompt("List name:")?.trim();
    if (!name) return;
    if(isCreative&&(coreNames.has(name)||creativeOptions.some(option=>option.name.trim().toLowerCase()===name.toLowerCase()))){setError('Choose a new Creative category name distinct from existing boards and statuses.');return;}

    try {
      setError("");
      const result=await apiRequest<{data:WorkflowStage}>("/workflow", {
        method: "POST",
        body: JSON.stringify({
          board_id: isCreative?creativeRoot?.id:selectedBoardId,
          name,
        }),
      });
      await loadData();
      if(isCreative&&creativeRoot&&result.data?.id){openCreativeOption({key:'list:'+result.data.id,name:result.data.name,boardId:creativeRoot.id,listId:Number(result.data.id)});return;}
      // Wait for the refreshed columns to render, then reveal the new list.
      window.requestAnimationFrame(() => {
        const container = scrollContainerRef.current;
        container?.scrollTo({ left: container.scrollWidth, behavior: "smooth" });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create list");
    }
  }

  async function editList(stage: { id: number; name: string; created_by?: number | null; is_system?: boolean }) {
    if (stage.is_system || stage.name === "For Posting" || !canManageBoards) return;
    const name = window.prompt("List name:", stage.name)?.trim();
    if (!name || name === stage.name) return;
    try {
      setError("");
      await apiRequest(`/workflow/${stage.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to edit list");
    }
  }

  async function deleteList(stage: { id: number; name: string; created_by?: number | null; is_system?: boolean }) {
    if (stage.is_system || stage.name === "For Posting" || !canManageBoards) return;
    if (!window.confirm(`Delete list "${stage.name}"?`)) return;
    try {
      setError("");
      await apiRequest(`/workflow/${stage.id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete list");
    }
  }

  function toggleTaskCreator(stageId: number) {
    if (isCreative) stageId = creatableWorkflow[0]?.id ?? stageId;
    if (showCreate && createStageId === stageId) {
      setShowCreate(false);
      setCreateStageId(null);
      return;
    }
    setCreateStageId(stageId);
    setShowCreate(true);
  }

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">Loading board...</div>;
  }

  return (
    <div className="theme-page theme-compact-board flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden p-2.5 md:p-3">
      {moveNotice && <div role="status" className="board-move-notice fixed bottom-5 right-5 z-[110] rounded-xl border px-5 py-3 text-sm shadow-xl">{moveNotice}</div>}
      <BoardNavPanels handleTaskLinks={false} boards={boards} selectedBoardId={selectedBoardId} onSelectBoard={selectBoard} />
      <div className="mx-auto flex min-h-0 w-full flex-1 flex-col max-w-none">
        <div className="theme-board-heading mb-2 flex flex-col gap-2 rounded-2xl border border-white/10 bg-gradient-to-r from-[#071827] via-[#0E304A] to-[#184967] px-4 py-2 text-white shadow-2xl shadow-black/20 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#E6C87D]">
              Live Workspace
            </p>
            <h1 className="mt-1 text-xl font-bold text-white">
              {isCreativeSubBoard ? activeCreativeOption?.name + ' Board' : selectedBoard?.name ?? "Boards"}
            </h1>
            <p className="mt-1 text-xs text-white/70">
              {selectedBoard?.team_name ?? "No team"} · PostgreSQL data
            </p>
          </div>

          {canManageBoards ? <div className="flex flex-wrap gap-2">
            {canManageBoards ? (
              <button
                type="button"
                onClick={createBoard}
                className="flex items-center gap-2 rounded-md bg-white/15 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/25"
              >
                <Plus size={15} />
                New Board
              </button>
            ) : null}

            {selectedBoard && canManageBoards && !isPermanentBoard(selectedBoard) ? (
              <>
                <button
                  type="button"
                  onClick={() => editBoard(selectedBoard)}
                  className="flex items-center gap-2 rounded-md bg-white/15 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/25"
                >
                  <Pencil size={14} />
                  Edit Board
                </button>

                <button
                  type="button"
                  onClick={() => void deleteBoard(selectedBoard)}
                  className="flex items-center gap-2 rounded-md bg-red-500/80 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-500"
                >
                  <Trash2 size={14} /> Delete Board
                </button>

              </>
            ) : null}
          </div> : null}
        </div>


        {error ? (
          error.includes("Team Members cannot perform this action") ? (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3.5 text-sm font-medium text-violet-800 shadow-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                i
              </span>
              {error}
            </div>
          ) : (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )
        ) : null}

        {showCreate && permissions.createTask ? (
          <form
            onSubmit={handleCreateTask}
            className="theme-task-creator mb-4 grid gap-3 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-[1fr_160px_190px_180px_auto]"
          >
            {isCreative && <p className="text-xs md:col-span-full">New tasks start in To Do in this Creative workspace.</p>}
            {role === "Team Member" && <p className="text-xs md:col-span-full">New tasks start in To Do and are assigned to you. You can adjust assignees after creating the task.</p>}
            <input
              name="title"
              required
              placeholder="Task title"
              className="h-11 rounded-xl border px-3 text-sm outline-none focus:border-violet-500"
            />
            <select
              name="priority"
              defaultValue="Medium"
              className="h-11 rounded-xl border px-3 text-sm"
            >
              <option>Critical</option>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
            <select
              name="stage_id"
              value={String(createStageId ?? creatableWorkflow[0]?.id ?? "")}
              onChange={(event) => setCreateStageId(Number(event.target.value))}
              className="h-11 rounded-xl border px-3 text-sm"
            >
              {creatableWorkflow.map((stage) => (
                <option key={stage.id}
                    data-stage={stage.name}
                    data-drop-active={dropStageId === stage.id}
                    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropStageId(null); }} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              name="due_date"
              disabled={!canEditTaskDueDate(role)}
              title="Due date"
              className="h-11 rounded-xl border px-3 text-sm outline-none focus:border-violet-500"
            />
            <button
              type="submit"
              disabled={creating}
              className="h-11 rounded-xl bg-violet-700 px-5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {creating ? "Creating..." : "Add Task"}
            </button>
          </form>
        ) : null}

        <div className="theme-filters mb-3 flex flex-col gap-2 rounded-xl border border-white/30 bg-white/95 p-2 shadow-sm lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center rounded-lg border border-[#DCE5EC] bg-gradient-to-br from-white to-[#F8FBFD] px-3">
            <Search size={16} className="shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tasks..."
              className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
            />
          </div>

          <div className="board-date-filter relative lg:w-[240px]">
            <button ref={dateTriggerRef} type="button" aria-label="Filter tasks by due date" aria-expanded={dateFilterOpen} aria-controls="board-date-range" className="board-date-trigger flex h-11 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm font-medium" onClick={() => { setDateDraft({ ...dueDateFilter }); setDateFilterError(""); setDateFilterOpen(open => !open); }}>
              <CalendarDays size={16} className="shrink-0" />
              <span className="truncate">{dueDateFilter.start || dueDateFilter.end ? [dueDateFilter.start, dueDateFilter.end].filter(Boolean).map(date => date.split("-").reverse().join("/")).join(" \u2192 ") : "Due date / range"}</span>
            </button>
            {dateFilterOpen && <div ref={datePopupRef} id="board-date-range" role="group" aria-label="Due date range" className="board-date-options absolute right-0 top-full z-40 mt-2 w-[280px] max-w-[calc(100vw-48px)] rounded-xl border p-3 shadow-xl">
              <label className="block text-xs font-semibold">Start date<input aria-label="Start date" type="date" value={dateDraft.start} onChange={event => { setDateDraft(draft => ({ ...draft, start: event.target.value })); setDateFilterError(""); }} className="mt-1 h-10 w-full rounded-lg border px-2 text-sm" /></label>
              <label className="mt-3 block text-xs font-semibold">End date<input aria-label="End date" type="date" value={dateDraft.end} onChange={event => { setDateDraft(draft => ({ ...draft, end: event.target.value })); setDateFilterError(""); }} className="mt-1 h-10 w-full rounded-lg border px-2 text-sm" /></label>
              <p className="mt-2 text-xs opacity-70">One date matches that day. Two dates include both endpoints.</p>
              {dateFilterError && <p role="alert" className="mt-2 text-xs">{dateFilterError}</p>}
              <div className="mt-3 flex justify-between gap-2">
                <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => { setDateDraft({ start: "", end: "" }); setDueDateFilter({ start: "", end: "" }); setDateFilterError(""); }}>Clear</button>
                <button type="button" className="board-date-apply rounded-lg px-4 py-1.5 text-sm font-semibold" onClick={() => { if (dateDraft.start && dateDraft.end && dateDraft.start > dateDraft.end) { setDateFilterError("End date must be on or after start date."); return; } setDueDateFilter({ ...dateDraft }); setDateFilterOpen(false); }}>Done</button>
              </div>
            </div>}
          </div>

          <EmployeeFilter value={assigneeFilter} onChange={setAssigneeFilter} />
        </div>

        {boards.length === 0 ? (
          <div className="theme-glass rounded-2xl border border-dashed p-6 text-center text-sm text-[var(--theme-muted)]">
            {loading ? <div role="status"><p>Loading your workspace...</p><div aria-hidden="true" className="mt-5 grid grid-cols-3 gap-4">{[1,2,3].map(item => <div key={item} className="h-48 rounded-xl border border-current/15 bg-current/5 motion-safe:animate-pulse" />)}</div></div> : error ? (
              <><p>Board data could not be loaded. Please retry.</p><button type="button" className="mt-3 rounded-lg border px-4 py-2" onClick={() => { setLoading(true); void loadData(); }}>Retry</button></>
            ) : "No boards found in the database."}
          </div>
        ) : (
          <div className={`theme-board-canvas mb-16 min-h-0 flex-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-[#DCE6EF]/90 p-2 shadow-inner backdrop-blur-sm`} ref={scrollContainerRef}>
            <div className="flex h-full w-full items-stretch gap-2.5">
              {displayWorkflow.map((stage) => {
                const Icon = stageIcons[stage.name as keyof typeof stageIcons] ?? CircleDot;
                const stageTasks = boardTasks.filter((task) => stage.stageIds.includes(Number(task.stage_id)));

                return (
                  <section
                    key={stage.id}
                    data-stage={stage.name}
                    onDragOver={(event) => {
                      if (draggedTaskId === null || movingTaskId !== null) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDropStageId(stage.id);
                    }}
                    onDrop={(event) => {
                      if (draggedTaskId === null || movingTaskId !== null) return;
                      event.preventDefault();
                      const taskId = draggedTaskId ?? Number(event.dataTransfer.getData("text/plain"));
                      if (taskId) moveTask(taskId, stage.id);
                      setDraggedTaskId(null); setDropStageId(null);
                    }}
                    className={`theme-column flex h-full max-h-full min-w-[220px] max-w-[300px] flex-[1_0_220px] flex-col rounded-2xl border border-[#DCE5EC] bg-gradient-to-br from-white to-[#F8FBFD]/95 p-2 shadow-xl shadow-slate-950/10`}
                  >
                    <div className="mb-2 flex items-center gap-2 px-1">
                      <Icon size={16} className="text-slate-600" />
                      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{stage.name} ({stageTasks.length})</h2>
                      {!stage.is_system && canManageBoards ? (
                        <div className="flex items-center gap-1">
                          <button type="button" title="Edit list" onClick={() => void editList(stage)} className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-violet-700">
                            <Pencil size={13} />
                          </button>
                          <button type="button" title="Delete list" onClick={() => void deleteList(stage)} className="rounded-md p-1 text-slate-500 hover:bg-red-50 hover:text-red-600">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                      {stageTasks.map((task) => (
                        <article
                          key={task.id}
                          draggable={canMoveTask(role, user.id, task) && movingTaskId === null}
                          data-dragging={draggedTaskId === task.id}
                          aria-busy={movingTaskId === task.id}
                          onClick={() => {
                            setSelectedTaskInitialEdit(false);
                            setSelectedTaskId(task.id);
                          }}
                          onDragStart={(event) => handleDragStart(event, task.id)}
                          onDragEnd={() => { setDraggedTaskId(null); setDropStageId(null); }}
                          data-due={getDueState(task)}
                          className={`theme-task cursor-pointer rounded-xl border border-l-4 p-2.5 shadow-[0_4px_16px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-0.5 hover:border-[#1B4A6C] hover:shadow-[0_10px_24px_rgba(15,23,42,0.10)] ${priorityBorderClass[task.priority]} border-[#CADBE5] bg-gradient-to-br from-[#FCFDFE] to-[#EEF5F8] shadow-[0_8px_20px_rgba(11,39,64,0.07)]`}
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              data-priority={task.priority} className={`theme-priority inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${priorityClass[task.priority]}`}
                            >
                              {task.priority}
                            </span>

                            {isTaskCreator(user.id, task.created_by) ? (
                              <span className="inline-flex rounded-full border border-[#C9DCE9] bg-[#EDF5FA] px-2 py-0.5 text-[10px] font-semibold text-[#1B557A]">
                                Created by you
                              </span>
                            ) : null}
                          </div>

                          <h3 className="mt-1.5 text-sm font-semibold leading-5 text-slate-900">
                            {task.title}
                          </h3>

                          {task.created_by_name && !isTaskCreator(user.id, task.created_by) ? (
                            <p className="mt-1 truncate text-[11px] text-slate-500">
                              Created by {task.created_by_name}
                            </p>
                          ) : null}

                          <div className="mt-2 flex flex-wrap items-center justify-between gap-1 border-t pt-2 text-[11px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <CalendarDays size={13} />
                              {task.due_date
                                ? new Date(task.due_date).toLocaleDateString()
                                : "No due date"}
                            </span>
                            <div className="flex items-center gap-2">
                              {task.assignees?.length > 0 && (
                                <div className="flex -space-x-1.5">
                                  {task.assignees.map((a) => (
                                    <UserAvatar key={a.id} user={a} size={24} />
                                  ))}
                                </div>
                              )}
                              <span className="flex items-center gap-1">{movingTaskId === task.id && <Loader2 aria-label="Saving task stage" size={14} className="animate-spin" />}#{task.id}</span>
                            </div>
                          </div>
                        </article>
                      ))}

                      {stageTasks.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[#C9B36C] bg-white p-3 text-center text-xs text-slate-400">
                          No tasks
                        </div>
                      ) : null}
                    </div>

                    {stage.id > 0 && permissions.createTask && (role !== "Team Member" || stage.name === "To Do") &&
                    selectedBoardId ? (
                      <button
                        type="button"
                        onClick={() => toggleTaskCreator(stage.id)}
                        className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white/80 px-3 text-sm font-semibold text-slate-700 transition hover:border-[#B9944F] hover:bg-[#FFFDF8] hover:text-[#173F5E]"
                      >
                        <Plus size={16} />
                        {showCreate && createStageId === stage.id ? "Close Add Task" : "Add Task"}
                      </button>
                    ) : null}
                  </section>
                );
              })}

              {canManageBoards && selectedBoardId && isCreative ? (
                <div className="theme-add-list-actions flex shrink-0 flex-col items-start self-center gap-2">
                  <button type="button" onClick={() => void createList()} className="theme-add-list-button flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2">
                    <Plus size={17}/>Add List
                  </button>
                  {selectedCreativeList ? <div className="flex gap-2">
                    <button type="button" title="Edit Creative list" onClick={() => void editList(selectedCreativeList)} className="rounded-lg border p-2"><Pencil size={14}/></button>
                    <button type="button" title="Delete Creative list" onClick={() => void deleteList(selectedCreativeList)} className="rounded-lg border p-2"><Trash2 size={14}/></button>
                  </div> : null}
                </div>
              ) : null}

              {canManageBoards && selectedBoardId && !isCreative ? (
                <button
                  type="button"
                  onClick={createList}
                  className="theme-add-list-button flex h-11 shrink-0 items-center justify-center gap-2 self-center rounded-xl px-4 text-sm font-semibold transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <Plus size={17} />
                  Add List
                </button>
              ) : null}
            </div>
          </div>
        )}

        {selectedTaskId ? (
          <RealTaskModal
            taskId={selectedTaskId}
            initialEditMode={selectedTaskInitialEdit}
            onClose={closeTaskModal}
            onChanged={loadData}
          />
        ) : null}
      </div>
    </div>
  );
}








