const fs = require("fs");

const headerFile =
  "apps/web/src/components/layout/top-header.tsx";

const boardFile =
  "apps/web/src/app/dashboard/boards/page.tsx";

/* ==========================================
   1. UPDATE BUTTON:
   SHOW ONLY WHEN NEW VERSION IS AVAILABLE
========================================== */

let header = fs.readFileSync(headerFile, "utf8");

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
      </button>`;

const conditionalButton = `      {updateAvailable ? (
        <button
          type="button"
          onClick={() => void applySoftwareUpdate()}
          disabled={updateBusy}
          className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-gradient-to-r from-[#0B2135] to-[#1B4A6C] px-3 text-xs font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-wait disabled:opacity-60"
          title="New Task Manager update is ready"
          aria-label="Update Task Manager"
        >
          <RefreshCw
            size={15}
            className={updateBusy ? "animate-spin" : ""}
          />
          <span className="hidden sm:inline">
            {updateBusy ? "Updating..." : "Update"}
          </span>
        </button>
      ) : null}`;

if (header.includes(permanentButton)) {
  header = header.replace(
    permanentButton,
    conditionalButton
  );

  console.log(
    "Update button changed to one-time conditional mode"
  );
} else if (
  header.includes("{updateAvailable ? (") &&
  header.includes('aria-label="Update Task Manager"')
) {
  console.log(
    "Update button is already conditional"
  );
} else {
  console.log(
    "WARNING: Update button block not matched"
  );
}

fs.writeFileSync(headerFile, header, "utf8");

/* ==========================================
   2. PREMIUM TASK CARD COLORS
========================================== */

let board = fs.readFileSync(boardFile, "utf8");

const oldCard = `className={\`cursor-pointer rounded-lg border border-l-4 p-3 shadow-sm transition hover:border-[#0c66e4] hover:shadow-md \${priorityBorderClass[task.priority]} \${getDueState(task) === "overdue" ? "!border-red-500 !bg-red-50" : getDueState(task) === "today" ? "!border-yellow-500 !bg-yellow-50" : "border-slate-200 bg-white"}\`}`;

const newCard = `className={\`cursor-pointer rounded-xl border border-l-4 p-3.5 shadow-[0_4px_16px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-0.5 hover:border-[#1B4A6C] hover:shadow-[0_10px_24px_rgba(15,23,42,0.10)] \${priorityBorderClass[task.priority]} \${getDueState(task) === "overdue" ? "!border-[#C99A55] !bg-[#FFF8EC]" : getDueState(task) === "today" ? "!border-[#6D9FC4] !bg-[#F2F8FC]" : "border-[#DCE4EB] bg-gradient-to-br from-white to-[#F7FAFC]"}\`}`;

if (board.includes(oldCard)) {
  board = board.replace(oldCard, newCard);

  console.log(
    "Task cards changed to premium soft colors"
  );
} else {
  console.log(
    "WARNING: Task card class not matched"
  );
}

/* Created-by-you badge: violet -> premium blue */
board = board.replace(
  'border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700',
  'border-[#C9DCE9] bg-[#EDF5FA] px-2 py-1 text-[10px] font-semibold text-[#1B557A]'
);

/* Add Task button: violet hover -> navy */
board = board.replace(
  'hover:border-violet-400 hover:bg-white hover:text-violet-700',
  'hover:border-[#B9944F] hover:bg-[#FFFDF8] hover:text-[#173F5E]'
);

fs.writeFileSync(boardFile, board, "utf8");

console.log("");
console.log(
  "FINAL UI TOUCH APPLIED SUCCESSFULLY"
);