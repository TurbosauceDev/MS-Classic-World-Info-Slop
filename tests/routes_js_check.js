// node tests/routes_js_check.js <dist/index.html> <json file {"kind:id": canonicalPath}> <pages json {tab: path}, optional>:
// src/js/00-routes.js must give the same paths as scripts/routes.py (entities and the pages' own addresses)
const fs = require("fs");
const html = fs.readFileSync(process.argv[2], "utf8"), want = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const pages = process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4], "utf8")) : null;
const D = JSON.parse(/<script type="application\/json" id="sitedata">([\s\S]*?)<\/script>/.exec(html)[1]);
const src = fs.readFileSync(__dirname + "/../src/js/00-routes.js", "utf8");
const { cleanPath, TAB_PATH, placePath } = new Function("D", src + "; return {cleanPath, TAB_PATH, placePath}")(D);
const bad = []; let n = 0;
for (const [k, path] of Object.entries(want)){ const [kind, id] = k.split(":"); n++; const got = cleanPath(kind, id); if (got !== path) bad.push(`${k}: ${got} != ${path}`) }
// the pages' own addresses: the JS table (the bar's source) must carry exactly what routes.py writes pages for
if (pages){ for (const [tab, path] of Object.entries(pages)){ n++;
    if (TAB_PATH[tab] !== path) bad.push(`tab ${tab}: ${TAB_PATH[tab]} != ${path}`);
    else if (placePath(tab, "") !== path) bad.push(`tab ${tab}: placePath ${placePath(tab, "")} != ${path}`) }
  for (const tab of Object.keys(TAB_PATH)) if (!(tab in pages)) bad.push(`tab ${tab} has no routes.py PAGE_PATHS entry`);
  if (placePath("home", null) !== "/") bad.push("home must resolve to /");
  n++; }
if (bad.length){ console.error(bad.length + " mismatches", bad.slice(0, 8)); process.exit(1) }
console.log("JS paths match for " + n + (pages ? " (entities + pages)" : ""));
