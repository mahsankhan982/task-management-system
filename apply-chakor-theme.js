const fs = require("fs");

function patch(file, replacements, lineFix) {
  if (!fs.existsSync(file)) {
    console.log("SKIPPED:", file);
    return;
  }

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
    s !== original ? "UPDATED" : "NO MATCH / ALREADY UPDATED"
  );
}

/* LOGIN */
patch("apps/web/src/app/page.tsx", [
  [
    "from-slate-50 via-indigo-50 to-violet-100",
    "from-[#F5F7FA] via-[#EEF3F7] to-[#F4EFE5]"
  ],
  [
    "from-slate-950 via-indigo-950 to-violet-900",
    "from-[#081A2A] via-[#0D304A] to-[#174562]"
  ],
  [
    "focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100/70",
    "focus:border-[#B6934E] focus:ring-4 focus:ring-[#EADDBF]/60"
  ]
]);

/* DASHBOARD */
patch("apps/web/src/app/dashboard/page.tsx", [
  [
    "from-slate-950 via-indigo-950 to-violet-900",
    "from-[#EAF0F5] via-[#F8FAFC] to-[#F2EBDD]"
  ],
  [
    "text-indigo-100",
    "text-[#A07D3D]"
  ],
  [
    "hover:border-indigo-200",
    "hover:border-[#D8C28E]"
  ],
  [
    "bg-indigo-50 text-indigo-700 transition group-hover:bg-indigo-700 group-hover:text-white",
    "bg-[#F3E7CB] text-[#8D6B30] transition group-hover:bg-[#10324B] group-hover:text-[#F2D998]"
  ],
  [
    "text-violet-700",
    "text-[#173B59]"
  ]
]);

/* BOARD */
patch(
  "apps/web/src/app/dashboard/boards/page.tsx",
  [
    [
      "from-slate-950 via-indigo-950 to-violet-900",
      "from-[#E8EEF4] via-[#F8FAFC] to-[#F3ECDD]"
    ],
    [
      "border border-white/10 bg-slate-950/75",
      "border border-white/10 bg-gradient-to-r from-[#071827] via-[#0E304A] to-[#184967]"
    ],
    [
      "text-violet-200",
      "text-[#E6C87D]"
    ],
    [
      "border border-white/10 bg-white/10",
      "border border-slate-200/80 bg-[#DCE6EF]/90"
    ],
    [
      "border border-slate-200/80 bg-slate-50/95",
      "border border-slate-200 bg-white/95"
    ],
    [
      "bg-white text-indigo-800 shadow-lg",
      "bg-[#E9D399] text-[#082034] shadow-lg"
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

/* TOP HEADER */
patch("apps/web/src/components/layout/top-header.tsx", [
  [
    "from-indigo-600 to-violet-700",
    "from-[#0B2135] to-[#1B4A6C]"
  ],
  [
    "ring-indigo-100",
    "ring-[#E8D29D]"
  ]
]);

console.log("");
console.log("CHAKOR PREMIUM THEME APPLIED");