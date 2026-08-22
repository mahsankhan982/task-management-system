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

function Replace-Exact([string]$relativePath, [string]$oldText, [string]$newText) {
    $fullPath = Join-Path $root $relativePath
    if (-not (Test-Path $fullPath)) {
        throw "File not found: $relativePath"
    }

    $text = Normalize-LF ([System.IO.File]::ReadAllText($fullPath))
    $old = Normalize-LF $oldText
    $new = Normalize-LF $newText

    if (-not $text.Contains($old)) {
        throw "Expected code block not found in $relativePath. Stop here; no Git commit has been made."
    }

    $text = $text.Replace($old, $new)
    Write-Utf8NoBom $relativePath $text
}

if (-not (Test-Path "apps\web\src\components\layout\top-header.tsx")) {
    throw "Place this script inside C:\Users\Chakor\task-management-system and run it from there."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $root ".navigation-pwa-backup-$timestamp"
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
# 1) Normalize the 3 workspace board names in the database.
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
# 2) Fix boardId navigation so the dashboard card always opens the requested
#    Creative / Website / Digital board, even when the same page component
#    stays mounted while the query string changes.
# ---------------------------------------------------------------------------
Replace-Exact "apps\web\src\app\dashboard\boards\page.tsx" @'
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
'@ @'
      setSelectedBoardId((current) => {
        if (
          Number.isFinite(requestedBoardId) &&
          requestedBoardId > 0 &&
          nextBoards.some((board) => Number(board.id) === requestedBoardId)
        ) {
          return requestedBoardId;
        }

        if (current && nextBoards.some((board) => board.id === current)) {
          return current;
        }

        return nextBoards[0]?.id ?? null;
      });
'@

Replace-Exact "apps\web\src\app\dashboard\boards\page.tsx" @'
  useEffect(() => {
    void Promise.resolve().then(() => loadData());
  }, []);
'@ @'
  useEffect(() => {
    void Promise.resolve().then(() => loadData());
  }, [requestedBoardId]);
'@

# ---------------------------------------------------------------------------
# 3) Header: Back arrow + Install App + Logout.
# ---------------------------------------------------------------------------
Replace-Exact "apps\web\src\components\layout\top-header.tsx" @'
import {
  Bell,
  CheckCheck,
  Plus,
  Search,
  X,
} from "lucide-react";
'@ @'
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
'@

Replace-Exact "apps\web\src\components\layout\top-header.tsx" @'
import { apiRequest } from "@/lib/api";
'@ @'
import { apiRequest, clearAuthToken } from "@/lib/api";
'@

Replace-Exact "apps\web\src\components\layout\top-header.tsx" @'
type NotificationItem = {
  id: number | string;
  task_id: number | string | null;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};
'@ @'
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
'@

Replace-Exact "apps\web\src\components\layout\top-header.tsx" @'
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
'@ @'
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
'@

Replace-Exact "apps\web\src\components\layout\top-header.tsx" @'
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

  return (
'@ @'
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
      "To install Task Manager: use your browser menu and choose Install app / Add to Home Screen. On iPhone use Safari > Share > Add to Home Screen.",
    );
  }

  function logout() {
    clearAuthToken();
    localStorage.removeItem("task_management_user");
    router.replace("/");
    router.refresh();
  }

  return (
'@

Replace-Exact "apps\web\src\components\layout\top-header.tsx" @'
      </Link>

      <div className="mx-auto hidden w-full max-w-2xl items-center md:flex">
'@ @'
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
'@

Replace-Exact "apps\web\src\components\layout\top-header.tsx" @'
      {permissions.createTask ? (
        <Link
          href="/dashboard/boards"
          className="hidden h-9 items-center gap-2 rounded-lg bg-[#0c66e4] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0055cc] sm:flex"
        >
          <Plus size={17} />
          Create
        </Link>
      ) : null}

      <div className="relative">
'@ @'
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
'@

Replace-Exact "apps\web\src\components\layout\top-header.tsx" @'
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0c66e4] text-[11px] font-bold text-white ring-2 ring-blue-100"
        title={`${user.full_name} · ${user.role}`}
      >
        {initials(user.full_name)}
      </div>
    </header>
'@ @'
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
'@

# ---------------------------------------------------------------------------
# 4) PWA / installable app support.
# ---------------------------------------------------------------------------
Write-Utf8NoBom "apps\web\src\components\pwa-register.tsx" @'
"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // The web app still works normally if registration is unavailable.
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
  // Network requests remain controlled by the normal Next.js/Vercel app.
});
'@

# Create temporary TM app icons. These can later be replaced with the user's logo.
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
# 5) Build both backend and frontend before Git.
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
Write-Host "SUCCESS: Logout, back arrow, PWA install support, and workspace board navigation are ready." -ForegroundColor Green
Write-Host "Next: run migration 006 on Neon, then stage/commit/push the exact files." -ForegroundColor Yellow
