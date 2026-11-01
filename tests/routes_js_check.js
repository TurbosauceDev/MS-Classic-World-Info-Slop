// node tests/routes_js_check.js <dist/index.html> <json file {"kind:id": canonicalPath}>: src/js/00-routes.js must give the same paths as scripts/routes.py
const fs = require("fs");
const html = fs.readFileSync(process.argv[2], "utf8"), want = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const D = JSON.parse(/<script type="application\/json" id="sitedata">([\s\S]*?)<\/script>/.exec(html)[1]);
const src = fs.readFileSync(__dirname + "/../src/js/00-routes.js", "utf8");
const { cleanPath } = new Function("D", src + "; return {cleanPath}")(D);
const bad = []; let n = 0;
for (const [k, path] of Object.entries(want)){ const [kind, id] = k.split(":"); n++; const got = cleanPath(kind, id); if (got !== path) bad.push(`${k}: ${got} != ${path}`) }
if (bad.length){ console.error(bad.length + " mismatches", bad.slice(0, 8)); process.exit(1) }
console.log("JS paths match for " + n);
