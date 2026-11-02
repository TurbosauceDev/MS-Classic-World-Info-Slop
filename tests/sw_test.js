// Service worker must serve the cached planner shell only for the scope root, never for deep links
// (2026-11-01: /skills/warrior/fighter/final-attack-axe/ opened the planner with an empty skills list, no redirect).
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const handlers = {};
const ctx = { self: { registration: { scope: "https://x.test/" }, location: { origin: "https://x.test" }, addEventListener: (n, f) => handlers[n] = f, skipWaiting() {}, clients: { claim() {} } },
  caches: { match: async () => ({ cached: true }), open: async () => ({ put: async () => {}, addAll: async () => {}, keys: async () => [] }), keys: async () => [] },
  fetch: async r => ({ ok: false }), URL, Response: { error: () => "err" } };
ctx.self.location = ctx.location = { origin: "https://x.test" };
vm.runInNewContext(fs.readFileSync(__dirname + "/../src/pwa/sw.js", "utf8"), Object.assign(ctx, { self: Object.assign(ctx.self, { addEventListener: ctx.self.addEventListener }) }), {});
const nav = path => { let res; handlers.fetch({ request: { method: "GET", mode: "navigate", url: "https://x.test" + path }, respondWith: p => res = p, waitUntil() {} }); return res };
assert(nav("/"), "scope root is answered from the cache");
for (const p of ["/skills/warrior/fighter/final-attack-axe/", "/items/axe-pole-arm/", "/404.html", "/skills/"]) assert(!nav(p), p + " must go to the network");

// the hashed-file prune (keep only the newest of each kind): it used to test a bare-filename regex against
// pathnames and full URLs, never matched, and never deleted — one ~1.3 MB prices blob cached per market poll,
// forever, until Chrome's origin-wide eviction took the offline cache AND localStorage with it (round 2)
(async () => {
  const deleted = [];
  const keys = [{url: "https://x.test/prices-abc1234500.json"}, {url: "https://x.test/prices-dead9876500.json"},
    {url: "https://x.test/assets-aaaa111111.json"}, {url: "https://x.test/manifest.webmanifest"}];
  const cache = {put: async () => {}, addAll: async () => {}, keys: async () => keys, delete: async k => deleted.push(k.url)};
  const ctx2 = { self: { registration: { scope: "https://x.test/" }, location: { origin: "https://x.test" }, addEventListener: (n, f) => handlers[n] = f, skipWaiting() {}, clients: { claim() {} } },
    caches: { match: async () => undefined, open: async () => cache, keys: async () => [] },
    fetch: async r => ({ ok: true, type: "basic", clone(){ return this } }), URL, Response: { error: () => "err" } };
  ctx2.self.location = ctx2.location = { origin: "https://x.test" };
  vm.runInNewContext(fs.readFileSync(__dirname + "/../src/pwa/sw.js", "utf8"), ctx2, {});
  let waited;
  handlers.fetch({ request: { method: "GET", mode: "cors", url: "https://x.test/prices-dead9876500.json" },
    respondWith(){}, waitUntil: p => waited = Promise.resolve(p).catch(() => {}) });
  await waited; await new Promise(r => setTimeout(r, 10));
  assert(deleted.includes("https://x.test/prices-abc1234500.json"), "the older prices blob is pruned (basename match)");
  assert(!deleted.includes("https://x.test/assets-aaaa111111.json"), "other kinds are kept");
  assert(!deleted.includes("https://x.test/manifest.webmanifest"), "non-hashed entries are kept");
  assert(!deleted.includes("https://x.test/prices-dead9876500.json"), "the file just stored is kept");
  console.log("hashed prune ok");
})().then(() => console.log("sw_test ok")).catch(e => { console.error(e); process.exit(1) });
