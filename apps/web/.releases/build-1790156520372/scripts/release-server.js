const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const web = path.resolve(__dirname, "..");
const metaFile = path.join(web, ".releases", "releases.json");
const nextBin = path.join(web, "node_modules", "next", "dist", "bin", "next");
const children = new Map();
const ports = new Map();
const readiness = new Map();
let nextPort = Number(process.env.RELEASE_PORT_BASE || 3101);

function readMeta() {
  const data = JSON.parse(fs.readFileSync(metaFile, "utf8").replace(/^\uFEFF/, ""));
  if (!Array.isArray(data.versions) || !data.versions.length) throw new Error("No releases found. Build the web app first.");
  return { defaultVersion: data.defaultVersion || data.versions[0].version, versions: data.versions };
}

function parseCookies(raw) {
  const cookies = {};
  for (const part of String(raw || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    try { cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim()); } catch {}
  }
  return cookies;
}

function releaseInfo(meta, req) {
  const cookie = parseCookies(req.headers.cookie).tm_release;
  const selected = meta.versions.find(item => item.version === cookie) ||
    meta.versions.find(item => item.version === meta.defaultVersion) || meta.versions[0];
  const latest = meta.versions[meta.versions.length - 1];
  return { selected, latest };
}

function cookie(version) {
  return "tm_release=" + encodeURIComponent(version) + "; Path=/; SameSite=Lax; Max-Age=31536000";
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

function probe(port) {
  return new Promise(resolve => {
    const request = http.get({ hostname: "127.0.0.1", port, path: "/version.json", timeout: 1000 }, response => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(false));
  });
}

function ensureRelease(item) {
  if (readiness.has(item.version)) return readiness.get(item.version);
  // Start new builds on demand. Keep every pinned release available.
  const ready = (async () => {
    if (!fs.existsSync(path.join(item.path, ".next", "BUILD_ID"))) throw new Error("Release build is incomplete");
    const port = nextPort++;
    const child = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
      cwd: item.path, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    children.set(item.version, child);
    let failed = false;
    child.on("error", () => { failed = true; });
    child.on("exit", () => {
      failed = true; children.delete(item.version); ports.delete(item.version); readiness.delete(item.version);
    });
    child.stdout.on("data", data => process.stdout.write("[" + item.version + "] " + data));
    child.stderr.on("data", data => process.stderr.write("[" + item.version + "] " + data));
    for (let attempt = 0; attempt < 80 && !failed; attempt++) {
      if (await probe(port)) { ports.set(item.version, port); return port; }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    child.kill();
    throw new Error("New release is not ready. Please try again shortly.");
  })();
  readiness.set(item.version, ready);
  ready.catch(() => readiness.delete(item.version));
  return ready;
}

async function proxy(req, res, item, setCookie) {
  const port = await ensureRelease(item);
  const upstream = http.request({
    hostname: "127.0.0.1", port, path: req.url, method: req.method,
    headers: { ...req.headers, host: "127.0.0.1:" + port },
  }, response => {
    const headers = { ...response.headers };
    if (setCookie) headers["set-cookie"] = [...(response.headers["set-cookie"] || []), cookie(item.version)];
    res.writeHead(response.statusCode || 200, headers);
    response.pipe(res);
  });
  upstream.on("error", () => { if (!res.headersSent) json(res, 502, { error: "Release unavailable" }); else res.destroy(); });
  req.pipe(upstream);
}

const gateway = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const meta = readMeta();
    const { selected, latest } = releaseInfo(meta, req);
    if (pathname === "/__release-info" || pathname === "/api/release") {
      return json(res, 200, {
        selectedVersion: selected.version, latestVersion: latest.version, defaultVersion: meta.defaultVersion,
        selectedDisplayVersion: selected.displayVersion || "v1.0.0",
        latestDisplayVersion: latest.displayVersion || "v1.0.0",
        updateAvailable: selected.version !== latest.version,
      });
    }
    // This manifest always describes the latest successful build, not the pinned release.
    if (pathname === "/version.json") {
      return json(res, 200, { version: latest.displayVersion || "v1.0.0", releaseId: latest.version, builtAt: latest.createdAt });
    }
    if (pathname === "/__apply-update") {
      if (req.method !== "POST") return json(res, 405, { error: "POST required" }, { Allow: "POST" });
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) {
        return json(res, 403, { error: "Same-origin request required" });
      }
      // Do not switch the cookie until the new server can actually serve assets.
      await ensureRelease(latest);
      return json(res, 200, { ok: true, version: latest.version, displayVersion: latest.displayVersion || "v1.0.0" }, { "Set-Cookie": cookie(latest.version) });
    }
    await proxy(req, res, selected, parseCookies(req.headers.cookie).tm_release !== selected.version);
  } catch (error) {
    if (!res.headersSent) json(res, 503, { error: error.message || "Release unavailable" });
    else res.destroy();
  }
});

if (require.main === module) {
  gateway.listen(Number(process.env.PORT || 3000), () => console.log("Task Manager Release Gateway ready"));
  const shutdown = () => {
    for (const child of children.values()) child.kill();
    gateway.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
module.exports = { parseCookies, releaseInfo, gateway };

