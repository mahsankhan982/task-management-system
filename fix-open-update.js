const fs = require("fs");

const file =
  "apps/web/src/components/pwa-register.tsx";

const backup =
  file + ".before-open-update-fix.bak";

if (!fs.existsSync(backup)) {
  fs.copyFileSync(file, backup);
}

fs.writeFileSync(
  file,
`"use client";

import { useEffect } from "react";

const UPDATE_EVENT =
  "task-manager-update-available";

function announceUpdate() {
  window.dispatchEvent(
    new Event(UPDATE_EVENT)
  );
}

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    let cancelled = false;
    let registrationRef:
      ServiceWorkerRegistration | null = null;

    let timer = 0;

    function watchWorker(
      worker: ServiceWorker | null
    ) {
      if (!worker) return;

      if (worker.state === "installed") {
        if (
          navigator.serviceWorker.controller
        ) {
          announceUpdate();
        }
        return;
      }

      worker.addEventListener(
        "statechange",
        () => {
          if (
            worker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            announceUpdate();
          }
        }
      );
    }

    async function checkForUpdate() {
      if (!registrationRef) return;

      try {
        await registrationRef.update();

        if (registrationRef.waiting) {
          announceUpdate();
          return;
        }

        if (registrationRef.installing) {
          watchWorker(
            registrationRef.installing
          );
        }
      } catch {
        // Keep application usable if update
        // checking temporarily fails.
      }
    }

    async function start() {
      try {
        const registration =
          await navigator.serviceWorker.register(
            "/sw.js",
            {
              updateViaCache: "none",
            }
          );

        if (cancelled) return;

        registrationRef = registration;

        /* IMPORTANT:
           Check immediately whenever
           the software is opened.
        */
        if (registration.waiting) {
          announceUpdate();
        }

        if (registration.installing) {
          watchWorker(
            registration.installing
          );
        }

        registration.addEventListener(
          "updatefound",
          () => {
            watchWorker(
              registration.installing
            );
          }
        );

        await checkForUpdate();

        /* Check again when user returns
           to the software.
        */
        window.addEventListener(
          "focus",
          checkForUpdate
        );

        document.addEventListener(
          "visibilitychange",
          () => {
            if (
              document.visibilityState ===
              "visible"
            ) {
              void checkForUpdate();
            }
          }
        );

        /* Also check once every minute. */
        timer = window.setInterval(
          () => {
            void checkForUpdate();
          },
          60000
        );
      } catch {
        // Service-worker failure must not
        // stop the main application.
      }
    }

    void start();

    return () => {
      cancelled = true;

      window.removeEventListener(
        "focus",
        checkForUpdate
      );

      if (timer) {
        window.clearInterval(timer);
      }
    };
  }, []);

  return null;
}
`,
  "utf8"
);

console.log(
  "Open-app update detection fixed"
);
console.log(
  "Update button will appear only when a new version is ready"
);