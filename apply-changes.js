const fs = require("fs");

const file = "apps/web/src/components/tasks/real-task-modal.tsx";

const raw = fs.readFileSync(file, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/);

fs.writeFileSync(file + ".duplicate-wrapper.bak", raw, "utf8");

let start = -1;

for (let i = 0; i < lines.length - 1; i++) {
  if (
    lines[i].includes('{attachment.attachment_type === "file" ? (') &&
    lines[i + 1].includes('{attachment.attachment_type === "file" ? (')
  ) {
    start = i;
    break;
  }
}

if (start === -1) {
  throw new Error("Duplicate file attachment wrapper not found");
}

const closingLines = [];

for (let i = start + 2; i < Math.min(lines.length, start + 30); i++) {
  if (lines[i].trim() === ") : null}") {
    closingLines.push(i);
  }

  if (closingLines.length === 2) break;
}

if (closingLines.length !== 2) {
  throw new Error("Duplicate wrapper closing lines not found");
}

// Remove outer closing first so indexes stay valid.
lines.splice(closingLines[1], 1);

// Remove outer opening wrapper.
lines.splice(start, 1);

fs.writeFileSync(file, lines.join(eol), "utf8");

console.log("Duplicate attachment wrapper removed successfully");