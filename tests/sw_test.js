// Service worker must serve the cached planner shell only for the scope root, never for deep links
// (2026-11-01: /skills/warrior/fighter/final-attack-axe/ opened the planner with an empty skills list, no redirect).
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const handlers = {};
const fetched = [];
const ctx = { self: { registration: { scope: "https://x.test/" }, location: { origin: "https://x.test" }, addEventListener: (n, f) => handlers[n] = f, skipWaiting() {}, clients: { claim() {} } },
  caches: { match: async () => ({ cached: true }), open: async () => ({ put: async () => {}, addAll: async () => {}, keys: async () => [] }), keys: async () => [] },
  fetch: async r => { fetched.push(r.url); return { ok: false } }, URL, Response: { error: () => "err" } };
ctx.self.location = ctx.location = { origin: "https://x.test" };
vm.runInNewContext(fs.readFileSync(__dirname + "/../src/pwa/sw.js", "utf8"), Object.assign(ctx, { self: Object.assign(ctx.self, { addEventListener: ctx.self.addEventListener }) }), {});
const nav = path => { let res; handlers.fetch({ request: { method: "GET", mode: "navigate", url: "https://x.test" + path }, respondWith: p => res = p, waitUntil() {} }); return res };
assert(nav("/"), "scope root is answered from the cache");
for (const p of ["/skills/warrior/fighter/final-attack-axe/", "/items/axe-pole-arm/", "/404.html", "/skills/"]) assert(!nav(p), p + " must go to the network");
console.log("sw_test ok");
