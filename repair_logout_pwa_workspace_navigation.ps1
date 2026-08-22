$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Normalize-LF([string]$text) {
    return $text.Replace("`r`n", "`n").Replace("`r", "`n")
}

function Write-Utf8NoBom([string]$relativePath, [string]$content) {
    $fullPath = Join-Path $root $relativePath
    $parent = Split-Path -Parent $fullPath
    if ($parent -and -not (Test-Path $parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }

    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($fullPath, (Normalize-LF $content), $utf8)
}

function Replace-IfPresent([string]$relativePath, [string]$oldText, [string]$newText) {
    $fullPath = Join-Path $root $relativePath
    $text = Normalize-LF ([System.IO.File]::ReadAllText($fullPath))
    $old = Normalize-LF $oldText
    $new = Normalize-LF $newText

    if ($text.Contains($old)) {
        $text = $text.Replace($old, $new)
        Write-Utf8NoBom $relativePath $text
        return $true
    }

    return $false
}

if (-not (Test-Path "apps\web\src\components\layout\top-header.tsx")) {
    throw "Run this script from C:\Users\Chakor\task-management-system"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $root ".navigation-pwa-repair-backup-$timestamp"
New-Item -ItemType Directory -Force -Path $backup | Out-Null

$backupFiles = @(
    "apps\web\src\components\layout\top-header.tsx",
    "apps\web\src\app\dashboard\boards\page.tsx",
    "apps\web\src\app\layout.tsx"
)

foreach ($file in $backupFiles) {
    if (Test-Path $file) {
        $dest = Join-Path $backup $file
        $destParent = Split-Path -Parent $dest
        New-Item -ItemType Directory -Force -Path $destParent | Out-Null
        Copy-Item $file $dest -Force
    }
}

Write-Host "Backup created: $backup" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# DATABASE MIGRATION
# ---------------------------------------------------------------------------
Write-Utf8NoBom "apps\api\src\db\migrations\006_normalize_workspace_board_names.sql" @'
DO $$
DECLARE
  creative_id BIGINT;
  website_id BIGINT;
  digital_id BIGINT;
BEGIN
  SELECT id INTO creative_id
  FROM boards
  WHERE LOWER(name) LIKE '%creative%'
     OR LOWER(name) LIKE '%crative%'
     OR LOWER(COALESCE(description, '')) LIKE '%creative%'
  ORDER BY id
  LIMIT 1;

  IF creative_id IS NOT NULL THEN
    UPDATE boards
    SET name = 'Creative Board', updated_at = NOW()
    WHERE id = creative_id;
  END IF;

  SELECT id INTO website_id
  FROM boards
  WHERE LOWER(name) LIKE '%website%'
     OR LOWER(name) LIKE '%web site%'
     OR LOWER(COALESCE(description, '')) LIKE '%website%'
  ORDER BY id
  LIMIT 1;

  IF website_id IS NOT NULL THEN
    UPDATE boards
    SET name = 'Website Board', updated_at = NOW()
    WHERE id = website_id;
  END IF;

  SELECT id INTO digital_id
  FROM boards
  WHERE LOWER(name) LIKE '%digital%'
     OR LOWER(COALESCE(description, '')) LIKE '%digital%'
  ORDER BY id
  LIMIT 1;

  IF digital_id IS NOT NULL THEN
    UPDATE boards
    SET name = 'Digital Board', updated_at = NOW()
    WHERE id = digital_id;
  END IF;
END $$;
'@

# ---------------------------------------------------------------------------
# BOARD PAGE: normalize PostgreSQL BIGINT ids to numbers.
# This fixes the generic "Boards" heading when a dashboard card opens by boardId.
# ---------------------------------------------------------------------------
$boardFile = "apps\web\src\app\dashboard\boards\page.tsx"

$oldLoad = @'
      const nextBoards = boardsResponse.data ?? [];
      setError("");
      setBoards(nextBoards);
      setTeams(teamsResponse.data ?? []);
      setTasks(tasksResponse.data ?? []);
      setWorkflow((workflowResponse.data ?? []).sort((a, b) => a.position - b.position));
'@

$newLoad = @'
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

      setError("");
      setBoards(nextBoards);
      setTeams(nextTeams);
      setTasks(nextTasks);
      setWorkflow(nextWorkflow);
'@

$changedLoad = Replace-IfPresent $boardFile $oldLoad $newLoad
if ($changedLoad) {
    Write-Host "Normalized board/task/workflow IDs." -ForegroundColor Green
} else {
    $boardText = Normalize-LF ([System.IO.File]::ReadAllText((Join-Path $root $boardFile)))
    if (-not $boardText.Contains("const nextTasks = (tasksResponse.data ?? []).map")) {
        throw "Could not safely patch the board data loader. Stop here and send this output."
    }
    Write-Host "Board/task/workflow ID normalization was already present." -ForegroundColor Yellow
}

# Requested board must win over a previously selected board.
$oldSelect = @'
      setSelectedBoardId((current) => {
        if (current && nextBoards.some((board) => board.id === current)) return current;

        if (
          Number.isFinite(requestedBoardId) &&
          nextBoards.some((board) => Number(board.id) === requestedBoardId)
        ) {
          return requestedBoardId;
        }

        return nextBoards[0]?.id ?? null;
      });
'@

$newSelect = @'
      setSelectedBoardId((current) => {
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
'@

[void](Replace-IfPresent $boardFile $oldSelect $newSelect)

# If the previous failed script already installed a similar block, strengthen its comparison.
$oldCurrentComparison = @'
        if (current && nextBoards.some((board) => board.id === current)) {
          return current;
        }
'@
$newCurrentComparison = @'
        if (current && nextBoards.some((board) => Number(board.id) === Number(current))) {
          return Number(current);
        }
'@
[void](Replace-IfPresent $boardFile $oldCurrentComparison $newCurrentComparison)

# Reload when boardId query string changes.
$oldEffect = @'
  useEffect(() => {
    void Promise.resolve().then(() => loadData());
  }, []);
'@
$newEffect = @'
  useEffect(() => {
    void Promise.resolve().then(() => loadData());
  }, [requestedBoardId]);
'@
[void](Replace-IfPresent $boardFile $oldEffect $newEffect)

# ---------------------------------------------------------------------------
# TOP HEADER: overwrite cleanly so partial previous edits cannot conflict.
# ---------------------------------------------------------------------------
Write-Utf8NoBom "apps\web\src\components\layout\top-header.tsx" @'
"use client";

import {
  ArrowLeft,
  Bell,
  CheckCheck,
  Download,
  LogOut,
  Plus,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { useRole } from "@/contexts/role-context";
import { apiRequest, clearAuthToken } from "@/lib/api";

type NotificationItem = {
  id: number | string;
  task_id: number | string | null;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

const getPageTitle = (pathname: string) => {
  if (pathname.startsWith("/dashboard/boards")) return "Boards";
  if (pathname.startsWith("/dashboard/teams")) return "Teams";
  if (pathname.startsWith("/dashboard/activity")) return "Activity";
  if (pathname.startsWith("/dashboard/creative")) return "Creative";
  if (pathname.startsWith("/dashboard/website")) return "Website";
  if (pathname.startsWith("/dashboard/digital")) return "Digital";
  return "Dashboard";
};

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "TM"
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

export default function TopHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, permissions } = useRole();
  const pageTitle = getPageTitle(pathname);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
    };
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await apiRequest<{
        success: boolean;
        data: NotificationItem[];
        unread_count: number;
      }>("/notifications");

      setNotifications(response.data ?? []);
      setUnreadCount(Number(response.unread_count ?? 0));
    } catch {
      // Keep header usable even if notifications temporarily fail.
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadNotifications());

    const timer = window.setInterval(() => {
      void loadNotifications();
    }, 15000);

    return () => window.clearInterval(timer);
  }, [loadNotifications]);

  async function markRead(id: NotificationItem["id"]) {
    try {
      await apiRequest(`/notifications/${id}/read`, {
        method: "PATCH",
      });

      setNotifications((current) =>
        current.map((item) =>
          String(item.id) === String(id)
            ? { ...item, is_read: true }
            : item,
        ),
      );

      setUnreadCount((current) => Math.max(0, current - 1));
    } catch {
      // Ignore single mark-read failure and refresh later.
    }
  }

  async function markAllRead() {
    if (unreadCount === 0) return;

    try {
      setNotificationLoading(true);

      await apiRequest("/notifications/read-all", {
        method: "PATCH",
      });

      setNotifications((current) =>
        current.map((item) => ({ ...item, is_read: true })),
      );

      setUnreadCount(0);
    } finally {
      setNotificationLoading(false);
    }
  }

  async function installApp() {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      return;
    }

    window.alert(
      "Install Task Manager: Chrome/Edge menu > Install app. Android: browser menu > Install app/Add to Home screen. iPhone: Safari > Share > Add to Home Screen.",
    );
  }

  function logout() {
    clearAuthToken();
    localStorage.removeItem("task_management_user");
    router.replace("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 text-slate-700 shadow-sm">
      <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0c66e4] text-xs font-black text-white shadow-sm">
          TM
        </div>

        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-bold text-slate-900">
            Task Manager
          </p>
          <p className="text-[10px] text-slate-400">{pageTitle}</p>
        </div>
      </Link>

      {pathname !== "/dashboard" ? (
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
          title="Back to workspace dashboard"
          aria-label="Back to workspace dashboard"
        >
          <ArrowLeft size={18} />
        </button>
      ) : null}

      <div className="mx-auto hidden w-full max-w-2xl items-center md:flex">
        <div className="flex h-9 w-full items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 focus-within:border-[#0c66e4] focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100">
          <Search size={16} className="text-slate-400" />
          <input
            placeholder="Search your workspace"
            className="h-full w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="flex-1 md:hidden" />

      {permissions.createTask ? (
        <Link
          href="/dashboard/boards"
          className="hidden h-9 items-center gap-2 rounded-lg bg-[#0c66e4] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0055cc] sm:flex"
        >
          <Plus size={17} />
          Create
        </Link>
      ) : null}

      <button
        type="button"
        onClick={() => void installApp()}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
        title="Install Task Manager"
        aria-label="Install Task Manager"
      >
        <Download size={17} />
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setNotificationOpen((current) => !current);
            void loadNotifications();
          }}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
          title="Notifications"
        >
          <Bell size={18} />

          {unreadCount > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </button>

        {notificationOpen ? (
          <div className="absolute right-0 top-11 z-[150] w-[360px] max-w-[90vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <p className="text-sm font-bold text-slate-900">
                  Notifications
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {unreadCount} unread
                </p>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  disabled={notificationLoading || unreadCount === 0}
                  className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-40"
                  title="Mark all as read"
                >
                  <CheckCheck size={15} />
                  Read all
                </button>

                <button
                  type="button"
                  onClick={() => setNotificationOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto p-2">
              {notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="mx-auto text-slate-300" size={28} />
                  <p className="mt-3 text-sm font-semibold text-slate-600">
                    No notifications
                  </p>
                </div>
              ) : (
                notifications.map((item) => (
                  <button
                    key={String(item.id)}
                    type="button"
                    onClick={() => {
                      if (!item.is_read) void markRead(item.id);

                      if (item.task_id) {
                        setNotificationOpen(false);
                        router.push(
                          `/dashboard/boards?view=board&task=${item.task_id}`,
                        );
                      }
                    }}
                    className={`mb-1 w-full rounded-xl border p-3 text-left transition hover:border-violet-200 hover:bg-violet-50/40 ${
                      item.is_read
                        ? "border-transparent bg-white"
                        : "border-violet-100 bg-violet-50/70"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                          item.is_read ? "bg-slate-200" : "bg-violet-600"
                        }`}
                      />

                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">
                          {item.title}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-slate-600">
                          {item.message}
                        </span>
                        <span className="mt-1 block text-[10px] text-slate-400">
                          {formatTime(item.created_at)}
                        </span>
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="hidden text-right sm:block">
        <p className="max-w-[180px] truncate text-xs font-semibold text-slate-900">
          {user.full_name}
        </p>
        <p className="text-[10px] text-slate-400">{user.role}</p>
      </div>

      <div
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0c66e4] text-[11px] font-bold text-white ring-2 ring-blue-100"
        title={`${user.full_name} · ${user.role}`}
      >
        {initials(user.full_name)}
      </div>

      <button
        type="button"
        onClick={logout}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100"
        title="Logout"
        aria-label="Logout"
      >
        <LogOut size={17} />
      </button>
    </header>
  );
}
'@

# ---------------------------------------------------------------------------
# PWA / INSTALLABLE APP SUPPORT
# ---------------------------------------------------------------------------
Write-Utf8NoBom "apps\web\src\components\pwa-register.tsx" @'
"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // App continues to work normally if service worker registration fails.
    });
  }, []);

  return null;
}
'@

Write-Utf8NoBom "apps\web\src\app\layout.tsx" @'
import type { Metadata } from "next";
import "./globals.css";
import PwaRegister from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "Task Manager",
  description: "Task management workspace for Creative, Website and Digital teams.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/task-manager-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/task-manager-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/task-manager-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
'@

Write-Utf8NoBom "apps\web\public\manifest.webmanifest" @'
{
  "id": "/",
  "name": "Task Manager",
  "short_name": "Task Manager",
  "description": "Task management workspace for Creative, Website and Digital teams.",
  "start_url": "/dashboard",
  "scope": "/",
  "display": "standalone",
  "background_color": "#f6f7fb",
  "theme_color": "#0c66e4",
  "orientation": "any",
  "icons": [
    {
      "src": "/icons/task-manager-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/task-manager-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
'@

Write-Utf8NoBom "apps\web\public\sw.js" @'
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Network requests continue through the normal Next.js/Vercel app.
});
'@

# Temporary blue TM app icons. Replace later with the final user logo.
Add-Type -AssemblyName System.Drawing

function New-TaskManagerIcon([int]$size, [string]$relativePath) {
    $fullPath = Join-Path $root $relativePath
    $parent = Split-Path -Parent $fullPath
    New-Item -ItemType Directory -Force -Path $parent | Out-Null

    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::FromArgb(12, 102, 228))

    $fontSize = [float]($size * 0.30)
    $font = New-Object System.Drawing.Font("Arial", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)

    $graphics.DrawString("TM", $font, $brush, $rect, $format)
    $bitmap.Save($fullPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $format.Dispose()
    $brush.Dispose()
    $font.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

New-TaskManagerIcon 180 "apps\web\public\icons\task-manager-180.png"
New-TaskManagerIcon 192 "apps\web\public\icons\task-manager-192.png"
New-TaskManagerIcon 512 "apps\web\public\icons\task-manager-512.png"

# ---------------------------------------------------------------------------
# BUILD BOTH APPS
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "Building backend..." -ForegroundColor Cyan
Push-Location "apps\api"
npm run build
Pop-Location

Write-Host ""
Write-Host "Building frontend..." -ForegroundColor Cyan
Push-Location "apps\web"
npm run build
Pop-Location

Write-Host ""
Write-Host "SUCCESS: repair complete. Logout, back arrow, installable app support, and separate workspace board navigation are ready." -ForegroundColor Green
Write-Host "Next: run migration 006, then git status before committing." -ForegroundColor Yellow
