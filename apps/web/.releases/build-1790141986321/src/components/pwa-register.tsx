"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    void (async () => {
      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((reg) => reg.unregister()));
        }

        if ("caches" in window) {
          const names = await caches.keys();
          await Promise.all(
            names
              .filter(
                (name) =>
                  name.startsWith("task-manager-") ||
                  name.startsWith("workbox-") ||
                  name.startsWith("next-")
              )
              .map((name) => caches.delete(name))
          );
        }
      } catch {}
    })();
  }, []);

  return null;
}
