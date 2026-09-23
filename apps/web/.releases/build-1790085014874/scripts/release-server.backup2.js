const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const web = path.resolve(__dirname, "..");
const releasesDir = path.join(web, ".releases");
const metaFile = path.join(releasesDir, "releases.json");
const nodeModules = path.join(web, "node_modules");
const nextBin = path.join(nodeModules, "next", "dist", "bin", "next");

function readMeta() {
  if (!fs.existsSync(metaFile)) {
    console.error("No releases found. Run npm run build --prefix apps\\web first.");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(metaFile, "utf8"));
  const versions = Array.isArray(data.versions) ? data.versions : [];
  if (!versions.length) {
    console.error("No releases found. Run npm run build --prefix apps\\web first.");
    process.exit(1);
  }

  return {
    defaultVersion: String(data.defaultVersion || versions[0].version),
    versions,
  };
}

function parseCookies(raw) {
  const out = {};
  for (const part of String(raw || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function latestVersion(meta) {
  return meta.versions[meta.versions.length - 1].version;
}

function versionExists(meta, version) {
  return meta.versions.some((item) => item.version === version);
}

function selectedVersion(meta, req) {
  const cookies = parseCookies(req.headers.cookie);
  const requested = String(cookies.tm_release || "");
  if (requested && versionExists(meta, requested)) return requested;
  return meta.defaultVersion;
}

const meta = readMeta();
const children = new Map();
const ports = new Map();

meta.versions.forEach((item, index) => {
  const port = 3101 + index;
  ports.set(item.version, port);

  const child = spawn(
    process.execPath,
    [nextBin, "start", "-p", String(port)],
    {
      cwd: item.path,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  child.stdout.on("data", (data) => {
    process.stdout.write("[" + item.version.slice(-6) + "] " + data);
  });
  child.stderr.on("data", (data) => {
    process.stderr.write("[" + item.version.slice(-6) + "] " + data);
  });
  child.on("exit", (code) => {
    console.error("Release server exited:", item.version, "code:", code);
  });

  children.set(item.version, child);
});

function json(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(body);
}

function proxy(req, res, version, setCookieIfMissing) {
  const port = ports.get(version);
  if (!port) {
    json(res, 503, { error: "Release is not running", version });
    return;
  }

  const headers = { ...req.headers, host: "127.0.0.1:" + port };

  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port,
      path: req.url,
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      const responseHeaders = { ...upstreamRes.headers };

      if (setCookieIfMissing) {
        const cookie = "tm_release=" + encodeURIComponent(version) +
          "; Path=/; SameSite=Lax; Max-Age=31536000";
        const existing = responseHeaders["set-cookie"];
        responseHeaders["set-cookie"] = existing
          ? (Array.isArray(existing) ? [...existing, cookie] : [existing, cookie])
          : [cookie];
      }

      res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
      upstreamRes.pipe(res);
    }
  );

  upstream.on("error", (error) => {
    json(res, 502, { error: error.message, version });
  });

  req.pipe(upstream);
}

const gateway = http.createServer((req, res) => {
  const currentMeta = readMeta();
  const selected = selectedVersion(currentMeta, req);
  const latest = latestVersion(currentMeta);

  if (req.url && req.url.startsWith("/__release-info")) {
    json(res, 200, {
      selectedVersion: selected,
      latestVersion: latest,
      defaultVersion: currentMeta.defaultVersion,
      updateAvailable: selected !== latest,
    });
    return;
  }

  if (req.url && req.url.startsWith("/__apply-update")) {
    if (req.method !== "POST") {
      json(res, 405, { error: "POST required" });
      return;
    }

    const cookie = "tm_release=" + encodeURIComponent(latest) +
      "; Path=/; SameSite=Lax; Max-Age=31536000";

    json(
      res,
      200,
      { ok: true, version: latest },
      { "Set-Cookie": cookie }
    );
    return;
  }

  const cookies = parseCookies(req.headers.cookie);
  const hasValidCookie =
    Boolean(cookies.tm_release) &&
    versionExists(currentMeta, String(cookies.tm_release));

  proxy(req, res, selected, !hasValidCookie);
});

gateway.listen(3000, () => {
  console.log("");
  console.log("========================================");
  console.log(" Task Manager Release Gateway");
  console.log("========================================");
  console.log(" URL:      http://localhost:3000");
  console.log(" Default: ", meta.defaultVersion);
  console.log(" Latest:  ", latestVersion(meta));
  console.log(" Releases:", meta.versions.length);
  console.log("========================================");
});

function shutdown() {
  for (const child of children.values()) {
    try { child.kill(); } catch {}
  }
  gateway.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);


