const fs = require("fs");

function backup(file) {
  const b = file + ".before-force-update.bak";
  if (fs.existsSync(file) && !fs.existsSync(b)) {
    fs.copyFileSync(file, b);
  }
}

function patch(file, replacements, lineFix) {
  if (!fs.existsSync(file)) {
    console.log("FILE NOT FOUND:", file);
    return;
  }

  backup(file);

  let s = fs.readFileSync(file, "utf8");
  const original = s;

  for (const [from, to] of replacements) {
    s = s.split(from).join(to);
  }

  if (lineFix) {
    s = s
      .split(/\r?\n/)
      .map(lineFix)
      .join("\n");
  }

  fs.writeFileSync(file, s, "utf8");

  console.log(
    file,
    s !== original ? "UPDATED" : "NO CHANGE"
  );
}

/* =========================================================
   PREMIUM LIGHT CHAKOR THEME
========================================================= */

const pageBg =
  "bg-gradient-to-br from-[#EAF1F6] via-[#F8FAFC] to-[#F2EBDD]";

/* BOARD PAGE */
patch(
  "apps/web/src/app/dashboard/boards/page.tsx",
  [
    [
      "bg-gradient-to-br from-[#64499a] via-[#a85dbd] to-[#d46bb6]",
      pageBg
    ],
    [
      "bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900",
      pageBg
    ],
    [
      "bg-gradient-to-br from-[#E8EEF4] via-[#F8FAFC] to-[#F3ECDD]",
      pageBg
    ],
    [
      "bg-gradient-to-br from-[#E9EFF5] via-[#F8FAFC] to-[#F3EBDD]",
      pageBg
    ],

    /* Top board title area */
    [
      "bg-[#5b3f88]/95",
      "bg-gradient-to-r from-[#071827] via-[#0E304A] to-[#184967]"
    ],
    [
      "bg-slate-950/75",
      "bg-gradient-to-r from-[#071827] via-[#0E304A] to-[#184967]"
    ],

    /* Board horizontal background */
    [
      "bg-black/10",
      "bg-[#DCE6EE]/90"
    ],
    [
      "bg-white/10",
      "bg-[#DCE6EE]/90"
    ],

    /* Columns */
    [
      "bg-[#f1f2f4]",
      "bg-white/95"
    ],
    [
      "bg-slate-50/95",
      "bg-white/95"
    ],

    /* Selected board */
    [
      "bg-white text-[#5b3f88] shadow-sm",
      "bg-[#EAD59C] text-[#082034] shadow-md"
    ],
    [
      "bg-white text-indigo-800 shadow-lg",
      "bg-[#EAD59C] text-[#082034] shadow-md"
    ],

    [
      "text-violet-200",
      "text-[#E9CD83]"
    ]
  ],

  line => {
    if (
      line.includes("selectedBoard?.team_name") &&
      line.includes("PostgreSQL data")
    ) {
      const indent = line.match(/^\s*/)?.[0] || "";

      return (
        indent +
        '{selectedBoard?.team_name ?? "No team"} · PostgreSQL data'
      );
    }

    return line;
  }
);

/* DASHBOARD */
patch(
  "apps/web/src/app/dashboard/page.tsx",
  [
    [
      "bg-gradient-to-br from-[#64499a] via-[#a85dbd] to-[#d46bb6]",
      pageBg
    ],
    [
      "bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900",
      pageBg
    ],
    [
      "bg-gradient-to-br from-[#EAF0F5] via-[#F8FAFC] to-[#F2EBDD]",
      pageBg
    ],
    [
      "text-violet-100",
      "text-[#8D6B30]"
    ],
    [
      "text-indigo-100",
      "text-[#8D6B30]"
    ]
  ]
);

/* LOGIN */
patch(
  "apps/web/src/app/page.tsx",
  [
    [
      "bg-[#f6f7fb]",
      "bg-gradient-to-br from-[#F8FAFC] via-[#EDF3F7] to-[#F3EBDD]"
    ],
    [
      "bg-gradient-to-br from-slate-50 via-indigo-50 to-violet-100",
      "bg-gradient-to-br from-[#F8FAFC] via-[#EDF3F7] to-[#F3EBDD]"
    ],
    [
      "from-slate-950 via-indigo-950 to-violet-900",
      "from-[#071827] via-[#0E304A] to-[#184967]"
    ]
  ]
);

/* =========================================================
   ALWAYS-VISIBLE UPDATE APP BUTTON
========================================================= */

const headerFile =
  "apps/web/src/components/layout/top-header.tsx";

backup(headerFile);

let h = fs.readFileSync(headerFile, "utf8");

/* Make sure RefreshCw exists */
if (!h.includes("RefreshCw,")) {
  h = h.replace(
    "  Download,\n",
    "  Download,\n  RefreshCw,\n"
  );
}

/* Add permanent update function */
if (!h.includes("async function forceAppUpdate()")) {
  const anchor =
    "  const loadNotifications = useCallback(async () => {";

  if (!h.includes(anchor)) {
    throw new Error(
      "Could not locate loadNotifications in top-header.tsx"
    );
  }

  const fn = `  async function forceAppUpdate() {
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

`;

  h = h.replace(anchor, fn + anchor);
}

/*
 Remove old conditional Update button and replace
 it with permanently visible Update App button.
*/

const marker =
  'aria-label="Update Task Manager"';

const markerIndex = h.indexOf(marker);

const permanentButton = `      <button
        type="button"
        onClick={() => void forceAppUpdate()}
        disabled={updateBusy}
        className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-gradient-to-r from-[#0B2135] to-[#1B4A6C] px-3 text-xs font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-wait disabled:opacity-60"
        title="Check for and apply the latest Task Manager version"
        aria-label="Update Task Manager"
      >
        <RefreshCw
          size={15}
          className={updateBusy ? "animate-spin" : ""}
        />
        <span className="hidden sm:inline">
          {updateBusy ? "Updating..." : "Update App"}
        </span>
      </button>

`;

if (markerIndex >= 0) {
  const start = h.lastIndexOf(
    "{updateAvailable ? (",
    markerIndex
  );

  const endToken = ") : null}";
  const end = h.indexOf(
    endToken,
    markerIndex
  );

  if (start >= 0 && end >= 0) {
    h =
      h.slice(0, start) +
      permanentButton +
      h.slice(end + endToken.length);

    console.log(
      "Conditional Update button changed to permanent button"
    );
  } else {
    console.log(
      "Update button already appears to be permanent"
    );
  }
} else {
  /* If button does not exist, insert before Install button */
  const installAnchor = `      <button
        type="button"
        onClick={() => void installApp()}`;

  if (!h.includes(installAnchor)) {
    throw new Error(
      "Could not locate Install App button"
    );
  }

  h = h.replace(
    installAnchor,
    permanentButton + installAnchor
  );

  console.log("Permanent Update button inserted");
}

/* Professional avatar color */
h = h
  .split("from-indigo-600 to-violet-700")
  .join("from-[#0B2135] to-[#1B4A6C]");

fs.writeFileSync(
  headerFile,
  h,
  "utf8"
);

console.log(
  "apps/web/src/components/layout/top-header.tsx UPDATED"
);

console.log("");
console.log("==========================================");
console.log("PREMIUM THEME + PERMANENT UPDATE APP READY");
console.log("==========================================");