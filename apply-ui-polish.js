const fs = require("fs");

function patchFile(file, replacements, lineFix) {
  if (!fs.existsSync(file)) {
    console.log("SKIPPED - file not found:", file);
    return;
  }

  const raw = fs.readFileSync(file, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  let s = raw.replace(/\r\n/g, "\n");

  const backup = file + ".premium-ui.bak";
  if (!fs.existsSync(backup)) {
    fs.writeFileSync(backup, raw, "utf8");
  }

  let changed = 0;

  for (const [from, to] of replacements) {
    if (s.includes(from)) {
      s = s.split(from).join(to);
      changed++;
    }
  }

  if (lineFix) {
    const lines = s.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const replacement = lineFix(lines[i]);
      if (replacement !== lines[i]) {
        lines[i] = replacement;
        changed++;
      }
    }
    s = lines.join("\n");
  }

  fs.writeFileSync(file, s.replace(/\n/g, eol), "utf8");
  console.log(`${file}: ${changed} UI changes`);
}

/* ---------------- LOGIN ---------------- */

patchFile(
  "apps/web/src/app/page.tsx",
  [
    [
      'className="flex min-h-screen items-center justify-center bg-[#f6f7fb] p-6"',
      'className="flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50 to-violet-100 p-6"',
    ],
    [
      'className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10"',
      'className="w-full max-w-md rounded-[28px] border border-white/80 bg-white/90 p-8 shadow-[0_30px_80px_-25px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:p-10"',
    ],
    [
      "text-blue-600",
      "text-indigo-700",
    ],
    [
      "focus:border-blue-500 focus:ring-2 focus:ring-blue-100",
      "focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100/70",
    ],
    [
      'className="h-12 w-full rounded-xl bg-[#101828] text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"',
      'className="h-12 w-full rounded-xl bg-gradient-to-r from-slate-950 via-indigo-950 to-violet-900 text-sm font-semibold text-white shadow-lg shadow-indigo-950/20 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"',
    ],
  ],
);

/* ---------------- DASHBOARD ---------------- */

patchFile(
  "apps/web/src/app/dashboard/page.tsx",
  [
    [
      'className="min-h-full w-full bg-gradient-to-br from-[#64499a] via-[#a85dbd] to-[#d46bb6] p-5 md:p-8"',
      'className="min-h-full w-full bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-5 md:p-8"',
    ],
    [
      "text-violet-100",
      "text-indigo-100",
    ],
    [
      'className="group min-h-[170px] rounded-2xl border border-white/40 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-violet-300 hover:shadow-xl"',
      'className="group min-h-[170px] rounded-2xl border border-white/70 bg-white/95 p-6 shadow-lg shadow-slate-950/10 transition duration-300 hover:-translate-y-1.5 hover:border-indigo-200 hover:shadow-2xl"',
    ],
    [
      'className="min-h-[170px] cursor-not-allowed rounded-2xl border border-white/30 bg-white/80 p-6 opacity-70 shadow-sm"',
      'className="min-h-[170px] cursor-not-allowed rounded-2xl border border-white/50 bg-white/75 p-6 opacity-70 shadow-lg shadow-slate-950/10"',
    ],
    [
      'className="relative min-h-[170px] rounded-2xl border border-white/40 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-violet-300 hover:shadow-xl"',
      'className="relative min-h-[170px] rounded-2xl border border-white/70 bg-white/95 p-6 shadow-lg shadow-slate-950/10 transition duration-300 hover:-translate-y-1.5 hover:border-indigo-200 hover:shadow-2xl"',
    ],
    [
      '"bg-violet-50 text-violet-700 transition group-hover:bg-violet-700 group-hover:text-white"',
      '"bg-indigo-50 text-indigo-700 transition group-hover:bg-indigo-700 group-hover:text-white"',
    ],
    [
      'className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-violet-800 hover:shadow-lg"',
      'className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 text-sm font-semibold text-white shadow-lg backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/20"',
    ],
  ],
);

/* ---------------- BOARD ---------------- */

patchFile(
  "apps/web/src/app/dashboard/boards/page.tsx",
  [
    [
      'className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden bg-gradient-to-br from-[#64499a] via-[#a85dbd] to-[#d46bb6] p-3 md:p-4"',
      'className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-3 md:p-4"',
    ],
    [
      'className="mb-3 flex flex-col gap-3 rounded-xl border border-white/10 bg-[#5b3f88]/95 p-3 text-white shadow-lg backdrop-blur lg:flex-row lg:items-center lg:justify-between"',
      'className="mb-3 flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/75 p-4 text-white shadow-2xl shadow-black/20 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between"',
    ],
    [
      'className="min-h-0 flex-1 overflow-x-auto rounded-xl bg-black/10 p-2 pb-4"',
      'className="min-h-0 flex-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/10 p-3 pb-4 shadow-inner backdrop-blur-sm"',
    ],
    [
      'className="flex h-full max-h-full w-[285px] shrink-0 flex-col rounded-xl bg-[#f1f2f4] p-2.5 shadow-sm"',
      'className="flex h-full max-h-full w-[285px] shrink-0 flex-col rounded-2xl border border-slate-200/80 bg-slate-50/95 p-3 shadow-xl shadow-slate-950/10"',
    ],
    [
      '"bg-white text-[#5b3f88] shadow-sm"',
      '"bg-white text-indigo-800 shadow-lg"',
    ],
  ],
  (line) => {
    if (
      line.includes("selectedBoard?.team_name") &&
      line.includes("PostgreSQL data")
    ) {
      const indent = line.match(/^\s*/)?.[0] ?? "";
      return `${indent}{selectedBoard?.team_name ?? "No team"} · PostgreSQL data`;
    }
    return line;
  },
);

/* ---------------- HEADER ---------------- */

patchFile(
  "apps/web/src/components/layout/top-header.tsx",
  [
    [
      "bg-[#0c66e4] text-[11px] font-bold text-white ring-2 ring-blue-100",
      "bg-gradient-to-br from-indigo-600 to-violet-700 text-[11px] font-bold text-white ring-2 ring-indigo-100",
    ],
  ],
  (line) => {
    if (
      line.includes("title={`${user.full_name}") &&
      line.includes("${user.role}")
    ) {
      const indent = line.match(/^\s*/)?.[0] ?? "";
      return `${indent}title={\`\${user.full_name} · \${user.role}\`}`;
    }
    return line;
  },
);

console.log("");
console.log("Premium UI polish completed.");
console.log("No business logic was changed.");