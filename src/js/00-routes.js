/* Clean share addresses (Danny 2026-11-01): Copy link on an item, monster, skill or quest gives
   https://maplestory.scumlord.studio/items/axe-pole-arm/ instead of a base64 #i=... hash. The same paths are written by
   scripts/routes.py (static pages) and resolved by 404.html; tests/routes_test.py checks that this file and routes.py agree. */
const ROUTE_HOST = "https://maplestory.scumlord.studio";
const ROUTE_CLASS = {"Warrior": "warrior", "Fighter": "warrior", "Page": "warrior", "Spearman": "warrior",
  "Magician": "magician", "F/P Wizard": "magician", "I/L Wizard": "magician", "Cleric": "magician",
  "Archer": "archer", "Hunter": "archer", "Crossbowman": "archer", "Rogue": "thief", "Assassin": "thief", "Bandit": "thief"};
const routeSlug = n => String(n).normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "page";
const ROUTE_CNT = {};
// -> canonical path of one entry ("item" | "mob" | "skill" | "quest"), or null when it has no static page
function cleanPath(kind, id, data = D){
  id = String(id); let name, parent = "", plural, list;
  if (kind === "item"){ const x = data.items[id]; if (!x) return null; name = x.n; plural = "items"; list = () => Object.values(data.items).map(v => [v.n, ""]) }
  else if (kind === "mob"){ const x = data.mobdb[id]; if (!x) return null; name = x.name; plural = "monsters"; list = () => Object.values(data.mobdb).map(v => [v.name, ""]) }
  else if (kind === "quest"){ const x = data.quests.find(q => String(q.id) === id); if (!x) return null; name = x.name; plural = "quests"; list = () => data.quests.map(q => [q.name, ""]) }
  else if (kind === "skill"){
    const job = Object.keys(data.skills).find(j => data.skills[j].some(s => String(s.id) === id)); if (!job) return null;
    const c = ROUTE_CLASS[job]; parent = c + "/" + (routeSlug(job) === c ? "" : routeSlug(job) + "/");
    name = data.skills[job].find(s => String(s.id) === id).n; plural = "skills";
    list = () => Object.entries(data.skills).flatMap(([j, l]) => l.map(s => [s.n, ROUTE_CLASS[j] + "/" + (routeSlug(j) === ROUTE_CLASS[j] ? "" : routeSlug(j) + "/")]))
  } else return null;
  const key = kind + "|" + parent + "|" + routeSlug(name), cnt = ROUTE_CNT[kind] || (ROUTE_CNT[kind] = (() => { const o = {}; for (const [n, p] of list()){ const k = kind + "|" + p + "|" + routeSlug(n); o[k] = (o[k] || 0) + 1 } return o })());
  return `/${plural}/${parent}${routeSlug(name)}${cnt[key] > 1 ? "-" + id : ""}/`;
}
// Copy-link address: the clean path on the live site (also from the claude.ai artifact); everywhere else (localhost, the
// GitHub Pages copy, whose pages live under a sub-path) the old #key=... hash link keeps working.
function shareClean(kind, id, k, obj){
  let p = null; try { p = cleanPath(kind, id) } catch(e) {}
  const live = location.hostname === "maplestory.scumlord.studio" || !/^https?:$/.test(location.protocol) || /claude|usercontent|anthropic/.test(location.hostname);
  return p && live ? ROUTE_HOST + p : shareUrl(k, obj);
}
