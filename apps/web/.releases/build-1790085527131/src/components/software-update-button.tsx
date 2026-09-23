"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type ReleaseInfo = {
  selectedVersion: string;
  latestVersion: string;
  defaultVersion: string;
  updateAvailable: boolean;
};

async function getReleaseInfo(): Promise<ReleaseInfo | null> {
  try {
    const response = await fetch(`/__release-info?t=${Date.now()}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
    if (!response.ok) return null;
    return (await response.json()) as ReleaseInfo;
  } catch {
    return null;
  }
}

export default function SoftwareUpdateButton() {
  const [info, setInfo] = useState<ReleaseInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    const next = await getReleaseInfo();
    if (next) setInfo(next);
  }, []);

  useEffect(() => {
    void check();

    const timer = window.setInterval(() => void check(), 5000);
    const onFocus = () => void check();
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  async function applyUpdate() {
    if (busy || !info?.updateAvailable) return;
    setBusy(true);

    try {
      const response = await fetch("/__apply-update", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        setBusy(false);
        return;
      }

      window.location.reload();
    } catch {
      setBusy(false);
    }
  }

  if (!info?.updateAvailable) return null;

  return (
    <button
      type="button"
      onClick={() => void applyUpdate()}
      disabled={busy}
      className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#D7B468] bg-gradient-to-r from-[#E0BB6A] to-[#F3DEA4] px-4 text-xs font-bold text-[#0A2942] shadow-[0_8px_22px_rgba(216,180,106,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(216,180,106,0.38)] disabled:cursor-wait disabled:opacity-70"
      title={`Installed: ${info.selectedVersion} | New: ${info.latestVersion}`}
    >
      <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
      {busy ? "Updating..." : "Update"}
    </button>
  );
}
