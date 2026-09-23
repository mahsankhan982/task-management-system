"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { APP_VERSION, APP_DISPLAY_VERSION } from "@/generated/app-version";
import { clearApplicationCaches, isNewerVersion } from "@/lib/app-updates";

type Update = { releaseId: string; label: string; gateway: boolean };
const seenKey = "chakor-update-seen";

export default function SoftwareUpdateButton() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [unseen, setUnseen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const applying = useRef(false);

  useEffect(() => {
    let stopped = false, checking = false;
    const controller = new AbortController();
    async function check() {
      if (checking || applying.current || document.visibilityState === "hidden") return;
      checking = true;
      try {
        let next: Update | null = null;
        const response = await fetch("/__release-info?t=" + Date.now(), { cache: "no-store", signal: controller.signal });
        if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
          const info = await response.json();
          if (typeof info.latestVersion !== "string") return;
          // Compare loaded assets, not just the cookie, which another tab can change.
          if (info.latestVersion !== APP_VERSION) next = { releaseId: info.latestVersion, label: info.latestDisplayVersion || "New release", gateway: true };
        } else {
          const manifest = await fetch("/version.json?t=" + Date.now(), { cache: "no-store", signal: controller.signal });
          if (!manifest.ok) return;
          const info = await manifest.json();
          if (typeof info.version === "string" && isNewerVersion(info.version, APP_DISPLAY_VERSION)) {
            next = { releaseId: info.releaseId || info.version, label: info.version, gateway: false };
          }
        }
        if (stopped) return;
        setUpdate(next);
        try { setUnseen(Boolean(next && localStorage.getItem(seenKey) !== next.releaseId)); } catch { setUnseen(Boolean(next)); }
      } catch { /* Offline checks must not interrupt workspace use. */ }
      finally { checking = false; }
    }
    void check();
    const timer = window.setInterval(() => void check(), 60000);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      stopped = true; controller.abort(); window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  function confirm() {
    if (!update) return;
    setError(""); setUnseen(false);
    try { localStorage.setItem(seenKey, update.releaseId); } catch {}
    dialog.current?.showModal();
  }

  async function applyUpdate() {
    if (!update || applying.current) return;
    applying.current = true; setBusy(true); setError("");
    try {
      await clearApplicationCaches();
      let selected = update.releaseId;
      if (update.gateway) {
        const response = await fetch("/__apply-update", { method: "POST", cache: "no-store", signal: AbortSignal.timeout(45000) });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "Unable to load the new release. Please try again.");
        selected = result.version;
      }
      try { localStorage.setItem("chakor-installed-release", selected); } catch {}
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed. Please try again.");
      applying.current = false; setBusy(false);
    }
  }

  if (!update) return null;
  return <>
    <button type="button" onClick={confirm} disabled={busy} data-unseen={unseen}
      className="software-update-button theme-gold inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold shadow-lg disabled:opacity-60"
      title={APP_DISPLAY_VERSION + " installed. " + update.label + " available."}>
      <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
      <span className="hidden rounded-md bg-[#092238]/10 px-2 py-1 text-[10px] sm:inline">{update.label} Available</span>
      <span>{busy ? "Updating..." : "Update Now"}</span>
      {unseen && <span aria-label="New update available" className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-[#10283b] bg-[#f4d287]" />}
    </button>
    <dialog ref={dialog} className="software-update-dialog" aria-labelledby="software-update-title" onCancel={event => { if (busy) event.preventDefault(); }}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--theme-accent)]">{update.label} available</p>
      <h2 id="software-update-title" className="text-xl font-semibold">New version is ready. Update application now?</h2>
      <p className="mt-3 text-sm text-[var(--theme-muted)]">Save any unfinished edits first. The application will reload after updating.</p>
      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" disabled={busy} onClick={() => dialog.current?.close()} className="rounded-xl border border-current/20 px-4 py-2 disabled:opacity-50">Cancel</button>
        <button type="button" disabled={busy} onClick={() => void applyUpdate()} className="theme-gold rounded-xl border px-4 py-2 font-semibold disabled:opacity-50">{busy ? "Updating..." : "Update Now"}</button>
      </div>
    </dialog>
  </>;
}

