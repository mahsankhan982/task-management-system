const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const web = path.resolve(__dirname, "..");
const releasesDir = path.join(web, ".releases");
const metaFile = path.join(releasesDir, "releases.json");
const originalNodeModules = path.join(web, "node_modules");

if (!fs.existsSync(originalNodeModules)) {
  console.error("node_modules not found. Run npm install --prefix apps\\web first.");
  process.exit(1);
}

function stamp() {
  return "build-" + Date.now();
}

function readMeta() {
  if (!fs.existsSync(metaFile)) {
    return { defaultVersion: "", versions: [] };
  }
  try {
    const data = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    return {
      defaultVersion: String(data.defaultVersion || ""),
      versions: Array.isArray(data.versions) ? data.versions : [],
    };
  } catch {
    return { defaultVersion: "", versions: [] };
  }
}

function writeMeta(meta) {
  fs.mkdirSync(releasesDir, { recursive: true });
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + "\n", "utf8");
}

const EXCLUDE = new Set([
  "node_modules",
  ".next",
  ".releases",
  "served-dashboard.html",
]);

function copyTree(src, dest, rel = "") {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (!rel && EXCLUDE.has(entry.name)) continue;

    if (
      entry.name.endsWith(".bak") ||
      entry.name.includes(".backup.") ||
      entry.name.endsWith(".tmp")
    ) {
      continue;
    }

    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyTree(s, d, path.join(rel, entry.name));
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}

const version = stamp();
const displayVersion = JSON.parse(fs.readFileSync(path.join(web, "public", "version.json"), "utf8").replace(/^\uFEFF/, "")).version;
if (!/^v\d+\.\d+\.\d+$/.test(displayVersion)) {
  throw new Error("public/version.json must contain a semantic version such as v2.0.0");
}
const releaseRoot = path.join(releasesDir, version);

if (fs.existsSync(releaseRoot)) {
  console.error("Release already exists:", version);
  process.exit(1);
}

console.log("Creating immutable release:", version);
copyTree(web, releaseRoot);

const releaseNodeModules = path.join(releaseRoot, "node_modules");
try {
  fs.symlinkSync(originalNodeModules, releaseNodeModules, "junction");
} catch (error) {
  console.error("Unable to create node_modules junction:", error.message);
  process.exit(1);
}

const generatedDir = path.join(releaseRoot, "src", "generated");
fs.mkdirSync(generatedDir, { recursive: true });
fs.writeFileSync(
  path.join(generatedDir, "app-version.ts"),
  "export const APP_VERSION = " + JSON.stringify(version) + " as const;\n" +
  "export const APP_DISPLAY_VERSION = " + JSON.stringify(displayVersion) + " as const;\n",
  "utf8"
);

fs.writeFileSync(
  path.join(releaseRoot, "public", "version.json"),
  JSON.stringify({ version: displayVersion, releaseId: version, builtAt: new Date().toISOString() }, null, 2) + "\n",
  "utf8"
);

const nextBin = path.join(originalNodeModules, "next", "dist", "bin", "next");
console.log("Building:", version);

const result = spawnSync(
  process.execPath,
  [nextBin, "build", "--webpack"],
  {
    cwd: releaseRoot,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: "inherit",
  }
);

if (result.status !== 0) {
  console.error("Release build failed.");
  process.exit(result.status || 1);
}

const meta = readMeta();
meta.versions = meta.versions.filter((item) => item && item.version !== version);
meta.versions.push({
  version,
  displayVersion,
  createdAt: new Date().toISOString(),
  path: releaseRoot,
});
if (!meta.defaultVersion) meta.defaultVersion = version;
writeMeta(meta);

console.log("");
console.log("RELEASE BUILT:", version);
console.log("Default/old release remains:", meta.defaultVersion);
console.log("Latest release:", version);
console.log("Existing users stay on their selected old release until Update is clicked.");
