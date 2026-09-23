const fs = require("fs");
const path = require("path");

const now = new Date();
const version = "build-" + now.toISOString().replace(/\D/g, "").slice(0, 17);

const publicFile = path.join(__dirname, "..", "public", "version.json");
const generatedDir = path.join(__dirname, "..", "src", "generated");
const generatedFile = path.join(generatedDir, "app-version.ts");

fs.mkdirSync(generatedDir, { recursive: true });

fs.writeFileSync(
  publicFile,
  JSON.stringify({ version, builtAt: now.toISOString() }, null, 2) + "\n",
  "utf8",
);

fs.writeFileSync(
  generatedFile,
  "export const APP_VERSION = " + JSON.stringify(version) + " as const;\n",
  "utf8",
);

console.log("App version:", version);
