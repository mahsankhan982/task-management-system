const fs = require("fs");

const componentFile =
  "apps/web/src/components/software-update-button.tsx";

const headerFile =
  "apps/web/src/components/layout/top-header.tsx";

/* ======================================================
   RELIABLE VERSION-BASED UPDATE BUTTON
====================================================== */

fs.writeFileSync(
  componentFile,
`"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const VERSION_KEY =
  "task-manager-installed-version";

const UPDATE_PARAM =
  "__task_manager_update";

async function getServerVersion() {
  const response = await fetch(
    "/sw.js?version_check=" + Date.now(),
    {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
      },
    }
  );

  if (!response.ok) {
    throw new Error("Unable to check version");
  }

  const text = await response.text();

  const match = text.match(
    /APP_VERSION\\\\s*=\\\\s*["']([^"']+)["']/
  );

  return match?.[1] ?? null;
}

export default function SoftwareUpdateButton() {
  const [latestVersion, setLatestVersion] =
    useState<string | null>(null);

  const [updateAvailable, setUpdateAvailable] =
    useState(false);

  const [updating, setUpdating] =
    useState(false);

  const checkVersion = useCallback(async () => {
    try {
      const serverVersion =
        await getServerVersion();

      if (!serverVersion) return;

      setLatestVersion(serverVersion);

      const url =
        new URL(window.location.href);

      const completedVersion =
        url.searchParams.get(UPDATE_PARAM);

      /*
       After clicking Update and reloading,
       confirm the new version and remove
       the temporary URL parameter.
      */
      if (
        completedVersion &&
        completedVersion === serverVersion
      ) {
        localStorage.setItem(
          VERSION_KEY,
          serverVersion
        );

        url.searchParams.delete(
          UPDATE_PARAM
        );

        window.history.replaceState(
          {},
          "",
          url.pathname +
            url.search +
            url.hash
        );

        setUpdateAvailable(false);
        return;
      }

      const installedVersion =
        localStorage.getItem(VERSION_KEY);

      /*
       First run on this browser:
       current version becomes baseline.
      */
      if (!installedVersion) {
        localStorage.setItem(
          VERSION_KEY,
          serverVersion
        );

        setUpdateAvailable(false);
        return;
      }

      setUpdateAvailable(
        installedVersion !== serverVersion
      );
    } catch {
      // Do not disturb the application if
      // version checking temporarily fails.
    }
  }, []);

  useEffect(() => {
    void checkVersion();

    const onFocus = () => {
      void checkVersion();
    };

    const onVisibility = () => {
      if (
        document.visibilityState === "visible"
      ) {
        void checkVersion();
      }
    };

    window.addEventListener(
      "focus",
      onFocus
    );

    document.addEventListener(
      "visibilitychange",
      onVisibility
    );

    const timer = window.setInterval(
      () => {
        void checkVersion();
      },
      30000
    );

    return () => {
      window.removeEventListener(
        "focus",
        onFocus
      );

      document.removeEventListener(
        "visibilitychange",
        onVisibility
      );

      window.clearInterval(timer);
    };
  }, [checkVersion]);

  async function updateSoftware() {
    if (
      updating ||
      !latestVersion
    ) {
      return;
    }

    setUpdating(true);

    try {
      /*
       Clear browser Cache Storage so old
       frontend files cannot interfere.
      */
      if ("caches" in window) {
        const keys =
          await caches.keys();

        await Promise.all(
          keys.map((key) =>
            caches.delete(key)
          )
        );
      }

      /*
       Ask any waiting service worker to
       activate too, but the button does
       NOT depend on service-worker state.
      */
      if (
        "serviceWorker" in navigator
      ) {
        const registrations =
          await navigator.serviceWorker
            .getRegistrations();

        for (
          const registration
          of registrations
        ) {
          try {
            await registration.update();

            if (registration.waiting) {
              registration.waiting.postMessage({
                type: "SKIP_WAITING",
              });
            }
          } catch {
            // Continue with direct reload.
          }
        }
      }

      /*
       Cache-busting navigation guarantees
       a fresh Next.js document request.
      */
      const url =
        new URL(window.location.href);

      url.searchParams.set(
        UPDATE_PARAM,
        latestVersion
      );

      window.location.replace(
        url.toString()
      );
    } catch {
      setUpdating(false);
    }
  }

  if (!updateAvailable) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() =>
        void updateSoftware()
      }
      disabled={updating}
      className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-gradient-to-r from-[#0B2135] to-[#1B4A6C] px-3 text-xs font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-wait disabled:opacity-60"
      title="A new Task Manager version is available"
      aria-label="Update Task Manager"
    >
      <RefreshCw
        size={15}
        className={
          updating
            ? "animate-spin"
            : ""
        }
      />

      <span className="hidden sm:inline">
        {updating
          ? "Updating..."
          : "Update"}
      </span>
    </button>
  );
}
`,
  "utf8"
);

console.log(
  "Created reliable software update component"
);

/* ======================================================
   REPLACE OLD UPDATE BUTTON IN HEADER
====================================================== */

let header =
  fs.readFileSync(
    headerFile,
    "utf8"
  );

if (
  !header.includes(
    'import SoftwareUpdateButton'
  )
) {
  const anchor =
    'import ChakorLogo from "@/components/brand/chakor-logo";';

  header = header.replace(
    anchor,
    anchor +
      '\\nimport SoftwareUpdateButton from "@/components/software-update-button";'
  );
}

const marker =
  'aria-label="Update Task Manager"';

const markerIndex =
  header.indexOf(marker);

if (markerIndex >= 0) {
  const start =
    header.lastIndexOf(
      "{updateAvailable ? (",
      markerIndex
    );

  const endToken =
    ") : null}";

  const end =
    header.indexOf(
      endToken,
      markerIndex
    );

  if (
    start >= 0 &&
    end >= 0
  ) {
    header =
      header.slice(0, start) +
      "<SoftwareUpdateButton />" +
      header.slice(
        end + endToken.length
      );

    console.log(
      "Old Update button replaced"
    );
  }
}

if (
  !header.includes(
    "<SoftwareUpdateButton />"
  )
) {
  const installMarker =
    'aria-label="Install Task Manager"';

  const installIndex =
    header.indexOf(
      installMarker
    );

  if (installIndex < 0) {
    throw new Error(
      "Could not locate header insertion point"
    );
  }

  const buttonStart =
    header.lastIndexOf(
      "<button",
      installIndex
    );

  header =
    header.slice(0, buttonStart) +
    "<SoftwareUpdateButton />\\n      " +
    header.slice(buttonStart);

  console.log(
    "Update button inserted before Install"
  );
}

/*
 RefreshCw is now imported by the new
 component, so remove the old header icon
 import if it is no longer used there.
*/
header = header.replace(
  /^\\s*RefreshCw,\\r?\\n/m,
  ""
);

fs.writeFileSync(
  headerFile,
  header,
  "utf8"
);

console.log("");
console.log(
  "RELIABLE UPDATE SYSTEM INSTALLED"
);