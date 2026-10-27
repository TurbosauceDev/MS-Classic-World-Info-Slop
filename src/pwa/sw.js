// Service worker for the GitHub Pages copy only (registered from 00-core.js on https when the data loads lazily; the claude.ai
// artifact never loads it). Same-origin GETs only: Google Fonts and the tracker's /api/summary go to the network as usual.
// Navigation = stale-while-revalidate (audit P9): the cached shell answers at once and a fresh copy lands in the cache for
// the next visit. The polls rebuild the shell several times an hour, and network-first made every returning visitor
// re-download it whole; the volatile part (prices) is a separate file (scripts/pages_site.py) fetched fresh each visit,
// so cached-shell + fresh-prices keeps the data current at a fraction of the bytes. Code changes show up one visit later.
const CACHE = "mscw-2";
const HASHED = /^(assets|prices)-[0-9a-f]+\.json$/;   // file names carry a content hash: keep only the newest of each kind
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(["./", "manifest.webmanifest", "icon-192.png"]))) });
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== "GET" || u.origin !== location.origin) return;
  const nav = req.mode === "navigate", key = nav ? "./" : req;
  if (nav) {
    e.respondWith(caches.match(key).then(c => {
      const net = fetch(req).then(r => { if (r.ok && r.type === "basic") e.waitUntil(caches.open(CACHE).then(x => x.put(key, r.clone()))); return r })
        .catch(() => c || Response.error());
      return c ? (e.waitUntil(net.catch(() => {})), c) : net }));
    return }
  e.respondWith(fetch(req).then(r => {
    if (r.ok && r.type === "basic") { const copy = r.clone();
      e.waitUntil(caches.open(CACHE).then(async c => {
        if (HASHED.test(u.pathname)) for (const k of await c.keys()) if (HASHED.test(k.url) && k.url.split("/").pop().split("-")[0] === u.pathname.split("/").pop().split("-")[0] && k.url !== req.url) await c.delete(k);
        await c.put(key, copy) })) }
    return r;
  }).catch(() => caches.match(key).then(r => r || Response.error())));
});
