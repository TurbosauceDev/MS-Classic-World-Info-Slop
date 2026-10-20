// Service worker for the GitHub Pages copy only (registered from 00-core.js on https when the data loads lazily; the claude.ai
// artifact never loads it). Network first, so an update shows up on the next visit; the cache is only the offline copy.
// Same-origin GETs only: Google Fonts and the tracker's /api/summary go to the network as usual.
const CACHE = "mscw-1";
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(["./", "manifest.webmanifest", "icon-192.png"]))) });
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== "GET" || u.origin !== location.origin) return;
  const nav = req.mode === "navigate", key = nav ? "./" : req;   // every page load is the one page (#share links ride in the hash)
  e.respondWith(fetch(req).then(r => {
    if (r.ok && r.type === "basic") { const copy = r.clone();
      e.waitUntil(caches.open(CACHE).then(async c => {
        // icons file names carry a content hash: keep only the newest one
        if (/assets-[0-9a-f]+\.json$/.test(u.pathname)) for (const k of await c.keys()) if (/assets-[0-9a-f]+\.json$/.test(k.url) && k.url !== req.url) await c.delete(k);
        await c.put(key, copy) })) }
    return r;
  }).catch(() => caches.match(key).then(r => r || Response.error())));
});
