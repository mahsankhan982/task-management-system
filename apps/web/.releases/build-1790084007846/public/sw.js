const CACHE_NAME = "task-manager-installed-release-v4";
const VERSION_META = "/__tm_installed_release_version__";

const ROUTES = [
  "/",
  "/dashboard",
  "/dashboard/activity",
  "/dashboard/boards",
  "/dashboard/creative",
  "/dashboard/digital",
  "/dashboard/teams",
  "/dashboard/website"
];

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function liveOnly(url) {
  return (
    url.pathname === "/version.json" ||
    url.pathname.startsWith("/api/") ||
    url.port === "5000"
  );
}

function releaseAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  );
}

async function fresh(input) {
  return fetch(input, { cache: "no-store" });
}

async function installedVersion() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const meta = await cache.match(VERSION_META);
    return meta ? (await meta.text()).trim() : "";
  } catch {
    return "";
  }
}

async function cacheAsset(cache, absoluteUrl) {
  try {
    const response = await fresh(absoluteUrl);
    if (response.ok) await cache.put(absoluteUrl, response.clone());
  } catch {}
}

async function cacheRoute(cache, route) {
  try {
    const absolute = new URL(route, self.location.origin);
    const response = await fresh(absolute.toString());
    if (!response.ok) return;

    const html = await response.clone().text();
    await cache.put(absolute.pathname, response.clone());

    const assets = new Set();
    const re = /(?:src|href)=["']([^"']+)["']/g;
    let match;

    while ((match = re.exec(html))) {
      try {
        const u = new URL(match[1], self.location.origin);
        if (sameOrigin(u) && releaseAsset(u)) assets.add(u.toString());
      } catch {}
    }

    await Promise.all([...assets].map((url) => cacheAsset(cache, url)));
  } catch {}
}

async function captureRelease(version, force) {
  const current = await installedVersion();

  // CRITICAL: a newer server build can NEVER overwrite the installed release
  // automatically. Only an explicit user-approved update may use force=true.
  if (current) {
    if (current === version) return { ok: true, version: current };
    if (!force) return { ok: false, version: current, locked: true };
  }

  await caches.delete(CACHE_NAME);
  const cache = await caches.open(CACHE_NAME);

  for (const route of ROUTES) {
    await cacheRoute(cache, route);
  }

  await cache.put(
    VERSION_META,
    new Response(version, {
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "no-store"
      }
    })
  );

  return { ok: true, version };
}

async function clearInstalledRelease() {
  await caches.delete(CACHE_NAME);

  // Clean only older Task Manager release caches from previous experiments.
  const names = await caches.keys();
  await Promise.all(
    names
      .filter(
        (name) =>
          name.startsWith("task-manager-") ||
          name.startsWith("workbox-") ||
          name.startsWith("next-")
      )
      .map((name) => caches.delete(name))
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // One-time migration to v4. Delete old experimental caches, but keep v4.
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) =>
              name !== CACHE_NAME &&
              (
                name.startsWith("task-manager-") ||
                name.startsWith("workbox-") ||
                name.startsWith("next-")
              )
          )
          .map((name) => caches.delete(name))
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};

  if (data.type === "GET_INSTALLED_VERSION") {
    event.waitUntil(
      installedVersion().then((version) => {
        event.ports?.[0]?.postMessage({ ok: true, version });
      })
    );
    return;
  }

  if (data.type === "CAPTURE_RELEASE" && typeof data.version === "string") {
    event.waitUntil(
      captureRelease(data.version, data.force === true).then((result) => {
        event.ports?.[0]?.postMessage(result);
      })
    );
    return;
  }

  if (data.type === "CLEAR_INSTALLED_RELEASE") {
    event.waitUntil(
      clearInstalledRelease().then(() => {
        event.ports?.[0]?.postMessage({ ok: true });
      })
    );
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Version probe must always be the server's live build.
  if (sameOrigin(url) && url.pathname === "/version.json") {
    event.respondWith(fresh(request));
    return;
  }

  // API/data is always live and never release-cached.
  if (!sameOrigin(url) || liveOnly(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const version = await installedVersion();

        if (version) {
          const cached = await cache.match(url.pathname);
          if (cached) return cached;
        }

        return fetch(request);
      })()
    );
    return;
  }

  if (releaseAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const version = await installedVersion();

        if (version) {
          const cached = await cache.match(request);
          if (cached) return cached;
        }

        return fetch(request);
      })()
    );
  }
});
