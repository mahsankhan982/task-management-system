"use client";

import { formatLocalDateTime } from "@/lib/date-time";

import {
  ArrowLeft,
  Bell,
  CheckCheck,
  Download,
  Sun,
  Moon,
  RefreshCw,
  LogOut,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import {
  useCallback,
  useEffect,
  useState,
  useRef,
} from "react";

import ChakorLogo from "@/components/brand/chakor-logo";
import ProfileMenu from "@/components/profile/profile-menu";
import SoftwareUpdateButton from "@/components/software-update-button";
import { useRole } from "@/contexts/role-context";
import { useTheme } from "@/hooks/use-theme";
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



function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return formatLocalDateTime(value);
}

export default function TopHeader() {
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useRole();
  const pageTitle = getPageTitle(pathname);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const lastNotificationIds = useRef(new Set<string>());
  const notificationsInitialized = useRef(false);
  const notificationNavigationLocked = useRef(false);

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

  useEffect(() => {
    const handleUpdateAvailable = () => {
      setUpdateAvailable(true);
    };

    window.addEventListener(
      "task-manager-update-available",
      handleUpdateAvailable,
    );

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .getRegistration()
        .then((registration) => {
          if (
            registration?.waiting &&
            navigator.serviceWorker.controller
          ) {
            setUpdateAvailable(true);
          }
        })
        .catch(() => {});
    }

    return () => {
      window.removeEventListener(
        "task-manager-update-available",
        handleUpdateAvailable,
      );
    };
  }, []);

  async function applySoftwareUpdate() {
    if (
      updateBusy ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    setUpdateBusy(true);

    try {
      const registration =
        await navigator.serviceWorker.getRegistration();

      const waitingWorker = registration?.waiting;

      if (!waitingWorker) {
        setUpdateAvailable(false);
        return;
      }

      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => {
          window.location.reload();
        },
        { once: true },
      );

      waitingWorker.postMessage({
        type: "SKIP_WAITING",
      });
    } catch {
      setUpdateBusy(false);
    }
  }

  async function forceAppUpdate() {
    if (updateBusy) return;

    setUpdateBusy(true);

    try {
      if (!("serviceWorker" in navigator)) {
        window.location.reload();
        return;
      }

      const registration =
        await navigator.serviceWorker.getRegistration();

      if (registration) {
        await registration.update();

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 800);
        });

        const waitingWorker = registration.waiting;

        if (waitingWorker) {
          let hasReloaded = false;

          const reloadApp = () => {
            if (hasReloaded) return;
            hasReloaded = true;
            window.location.reload();
          };

          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => reloadApp(),
            { once: true }
          );

          waitingWorker.postMessage({
            type: "SKIP_WAITING"
          });

          window.setTimeout(reloadApp, 1500);
          return;
        }
      }

      /* No waiting SW: reload latest production frontend */
      window.location.reload();
    } catch {
      window.location.reload();
    }
  }

  const loadNotifications = useCallback(async () => {
    try {
      const response = await apiRequest<{
        success: boolean;
        data: NotificationItem[];
        unread_count: number;
      }>("/notifications");

      const incoming = response.data ?? [];
      const currentIds = new Set(incoming.map((item) => String(item.id)));

      if (notificationsInitialized.current) {
        const freshNotifications = incoming.filter((item) => !item.is_read && !lastNotificationIds.current.has(String(item.id)));

        if (freshNotifications.length > 0) {
          const latest = freshNotifications[0];

          if ("Notification" in window && Notification.permission === "granted") {
            const popup = new Notification(latest.title || "New task notification", {
              body: latest.message || "A task notification has arrived.",
              icon: "/icons/icon-192x192.png",
              tag: `task-notification-${latest.id}`,
              silent: false,
            });

            popup.onclick = () => {
              popup.close();
              window.focus();
              if (!latest.is_read) {
                void apiRequest(`/notifications/${latest.id}/read`, { method: "PATCH" });
              }
              if (latest.task_id) {
                window.location.assign(
                  `/dashboard/boards?view=board&task=${latest.task_id}&notification=${latest.id}`,
                );
              }
            };
          }
        }
      } else {
        notificationsInitialized.current = true;
      }

      lastNotificationIds.current = currentIds;
      setNotifications(incoming);
      setUnreadCount(Number(response.unread_count ?? 0));
    } catch {
      // Keep header usable if notifications temporarily fail.
    }
  }, []);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }

    void loadNotifications();

    const notificationTimer = window.setInterval(() => {
      void loadNotifications();
    }, 10000);

    return () => {
      window.clearInterval(notificationTimer);
    };
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

  function openNotificationTask(item: NotificationItem) {
    if (notificationNavigationLocked.current) return;
    notificationNavigationLocked.current = true;

    flushSync(() => {
      setNotificationOpen(false);
    });

    if (!item.is_read) void markRead(item.id);

    if (item.task_id) {
      router.push(
        `/dashboard/boards?view=board&task=${item.task_id}&notification=${item.id}`,
      );
    }

    window.setTimeout(() => {
      notificationNavigationLocked.current = false;
    }, 1000);
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
    <header className="sticky top-0 z-50 flex h-14 items-center gap-3 border-b border-[#DDE5EC] bg-white/95 px-4 text-slate-700 shadow-[0_4px_18px_rgba(8,35,58,0.07)] backdrop-blur-xl">
      <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
        <ChakorLogo size={32} priority />

        <div className="min-w-0 leading-tight">
          <p className="header-brand truncate text-sm font-bold">
            Task Manager
          </p>
          <p className="header-subtitle text-[10px]">{pageTitle}</p>
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

            <SoftwareUpdateButton />



      <button
        type="button"
        onClick={toggleTheme}
        className="theme-toggle flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition"
        title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        aria-pressed={theme === "light"}
      >
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>

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
            if ("Notification" in window && Notification.permission === "default") {
              void Notification.requestPermission();
            }
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
          <div className="absolute right-0 top-11 z-[150] w-[360px] max-w-[90vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
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
                    onClick={() => openNotificationTask(item)}
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

      <ProfileMenu onLogout={logout} />

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
