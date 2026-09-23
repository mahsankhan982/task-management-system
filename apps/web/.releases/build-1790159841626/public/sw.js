// Release selection belongs to the existing gateway's tm_release cookie.
// Never serve captured HTML/assets over that choice.
const clearReleaseCaches = async () => {
  const names = await caches.keys();
  await Promise.all(names.filter(name => name.startsWith("task-manager-")).map(name => caches.delete(name)));
};
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil((async () => {
  await clearReleaseCaches();
  await self.clients.claim();
})()));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate" || url.pathname === "/version.json" || url.pathname.startsWith("/__")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
  }
});
// Keep messages understood by older pinned clients without capturing stale pages.
self.addEventListener("message", event => {
  const type = event.data?.type;
  event.waitUntil((async () => {
    if (type === "SKIP_WAITING") await self.skipWaiting();
    if (type === "CLEAR_INSTALLED_RELEASE" || type === "CAPTURE_RELEASE") await clearReleaseCaches();
    if (type === "GET_INSTALLED_VERSION") {
      try {
        const info = await (await fetch("/__release-info", { cache: "no-store" })).json();
        event.ports?.[0]?.postMessage({ ok: true, version: info.selectedVersion });
      } catch { event.ports?.[0]?.postMessage({ ok: false }); }
    } else { event.ports?.[0]?.postMessage({ ok: true }); }
  })());
});
