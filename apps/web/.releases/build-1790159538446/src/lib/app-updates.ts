export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (value: string) => /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value)?.slice(1).map(Number);
  const next = parse(latest), installed = parse(current);
  if (!next || !installed) return false;
  for (let i = 0; i < 3; i++) {
    if (next[i] !== installed[i]) return next[i] > installed[i];
  }
  return false;
}

export async function clearApplicationCaches() {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.filter(registration => {
      const worker = registration.active || registration.waiting || registration.installing;
      return worker && new URL(worker.scriptURL).origin === window.location.origin && new URL(worker.scriptURL).pathname === "/sw.js";
    }).map(async registration => {
      await registration.update().catch(() => {});
      await registration.unregister();
    }));
  }
  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith("task-manager-")).map(name => caches.delete(name)));
  }
}
