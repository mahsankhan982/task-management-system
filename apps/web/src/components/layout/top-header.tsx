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
  useRef,
} from "react";

import ChakorLogo from "@/components/brand/chakor-logo";
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
      .join("") || "CK"
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
  const lastNotificationIds = useRef(new Set<string>());
  const notificationsInitialized = useRef(false);
  const playNotificationSound = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.26);
      oscillator.onended=()=>{void ctx.close();};
    } catch {}
  }, []);

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

      const incoming = response.data ?? [];
      const currentIds = new Set(incoming.map((item) => String(item.id)));

      if (notificationsInitialized.current) {
        const freshNotifications = incoming.filter((item) => !item.is_read && !lastNotificationIds.current.has(String(item.id)));

        if (freshNotifications.length > 0) {
          playNotificationSound();

          if ("Notification" in window && Notification.permission === "granted") {
            const latest = freshNotifications[0];
            new Notification(latest.title || "New notification", {
              body: latest.message || "You have a new notification.",
              tag: String(latest.id),
            });
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
  }, [playNotificationSound]);

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
        <ChakorLogo size={32} priority />

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
        title={`${user.full_name} Â· ${user.role}`}
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