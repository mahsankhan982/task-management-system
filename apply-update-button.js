const fs = require("fs");

const swFile = "apps/web/public/sw.js";
const pwaFile = "apps/web/src/components/pwa-register.tsx";
const headerFile = "apps/web/src/components/layout/top-header.tsx";

function backup(file, suffix) {
  const backupFile = file + suffix;
  if (!fs.existsSync(backupFile)) {
    fs.copyFileSync(file, backupFile);
  }
}

/* =========================================================
   1. SERVICE WORKER
   New worker waits until user clicks Update.
========================================================= */

backup(swFile, ".manual-update.bak");

fs.writeFileSync(
  swFile,
`self.addEventListener("install", () => {
  // Do not call skipWaiting here.
  // A new version must wait until the user clicks Update.
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Network requests continue through the normal Next.js app.
});
`,
  "utf8",
);

console.log("Updated service worker for manual activation");

/* =========================================================
   2. PWA REGISTER
   Detect waiting service worker and announce update.
========================================================= */

backup(pwaFile, ".manual-update.bak");

fs.writeFileSync(
  pwaFile,
`"use client";

import { useEffect } from "react";

const UPDATE_EVENT = "task-manager-update-available";

function announceUpdate() {
  window.dispatchEvent(new Event(UPDATE_EVENT));
}

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    let updateInterval = 0;
    let registrationRef = null;

    const checkForUpdate = () => {
      if (!registrationRef) return;

      void registrationRef.update().catch(() => {
        // App continues normally if update check fails.
      });
    };

    const handleFocus = () => {
      checkForUpdate();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        checkForUpdate();
      }
    };

    void navigator.serviceWorker
      .register("/sw.js", {
        updateViaCache: "none",
      })
      .then((registration) => {
        if (cancelled) return;

        registrationRef = registration;

        if (
          registration.waiting &&
          navigator.serviceWorker.controller
        ) {
          announceUpdate();
        }

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;

          if (!worker) return;

          worker.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              announceUpdate();
            }
          });
        });

        window.addEventListener("focus", handleFocus);
        document.addEventListener(
          "visibilitychange",
          handleVisibility,
        );

        updateInterval = window.setInterval(
          checkForUpdate,
          5 * 60 * 1000,
        );
      })
      .catch(() => {
        // App continues normally if registration fails.
      });

    return () => {
      cancelled = true;

      window.removeEventListener("focus", handleFocus);
      document.removeEventListener(
        "visibilitychange",
        handleVisibility,
      );

      if (updateInterval) {
        window.clearInterval(updateInterval);
      }
    };
  }, []);

  return null;
}
`,
  "utf8",
);

console.log("Added software update detection");

/* =========================================================
   3. TOP HEADER UPDATE BUTTON
========================================================= */

backup(headerFile, ".manual-update.bak");

let header = fs.readFileSync(headerFile, "utf8");
const eol = header.includes("\r\n") ? "\r\n" : "\n";
header = header.replace(/\r\n/g, "\n");

/* Add RefreshCw icon */
if (!header.includes("RefreshCw,")) {
  const downloadImport = "  Download,\n";

  if (!header.includes(downloadImport)) {
    throw new Error(
      "Could not find Download icon import in top-header.tsx",
    );
  }

  header = header.replace(
    downloadImport,
    "  Download,\n  RefreshCw,\n",
  );
}

/* Add states */
if (!header.includes("const [updateAvailable")) {
  const stateAnchor =
    "  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);\n";

  if (!header.includes(stateAnchor)) {
    throw new Error(
      "Could not find installPrompt state anchor",
    );
  }

  header = header.replace(
    stateAnchor,
    stateAnchor +
`  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
`,
  );
}

/* Add update listener + click handler */
if (!header.includes("async function applySoftwareUpdate()")) {
  const functionAnchor =
    "  const loadNotifications = useCallback(async () => {";

  if (!header.includes(functionAnchor)) {
    throw new Error(
      "Could not find loadNotifications anchor",
    );
  }

  const updateLogic = `  useEffect(() => {
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

`;

  header = header.replace(
    functionAnchor,
    updateLogic + functionAnchor,
  );
}

/* Add button before Install button */
if (!header.includes('aria-label="Update Task Manager"')) {
  const buttonAnchor = `      <button
        type="button"
        onClick={() => void installApp()}`;

  if (!header.includes(buttonAnchor)) {
    throw new Error(
      "Could not find Install Task Manager button",
    );
  }

  const updateButton = `      {updateAvailable ? (
        <button
          type="button"
          onClick={() => void applySoftwareUpdate()}
          disabled={updateBusy}
          className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-700 px-3 text-xs font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-wait disabled:opacity-70"
          title="A new Task Manager version is ready"
          aria-label="Update Task Manager"
        >
          <RefreshCw
            size={15}
            className={updateBusy ? "animate-spin" : ""}
          />
          <span className="hidden lg:inline">
            {updateBusy ? "Updating..." : "Update"}
          </span>
        </button>
      ) : null}

`;

  header = header.replace(
    buttonAnchor,
    updateButton + buttonAnchor,
  );
}

fs.writeFileSync(
  headerFile,
  header.replace(/\n/g, eol),
  "utf8",
);

console.log("Added Update button to top header");
console.log("");
console.log("Manual software update system added successfully");