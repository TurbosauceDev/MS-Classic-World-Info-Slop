// node tests/router_harness.js <routes.json> <cases.json>: runs scripts/router404.js for each [address, expected] case with a fake
// location/fetch/document and prints the failures (used by tests/routes_test.py).
const fs = require("fs"), path = require("path");
const [rj, cj] = process.argv.slice(2);
const routes = JSON.parse(fs.readFileSync(rj, "utf8")), cases = JSON.parse(fs.readFileSync(cj, "utf8"));
const src = fs.readFileSync(path.join(__dirname, "../scripts/router404.js"), "utf8").replace(/^\/\*[\s\S]*?\*\//, "").trim();
const run = new Function("location", "document", "fetch", "return " + src);
(async () => {
  const bad = [];
  for (const [addr, want] of cases) {
    let got = null;
    const loc = {pathname: addr, replace: p => { got = p }};
    const box = {querySelector: () => ({}), insertAdjacentHTML: () => {}};
    await run(loc, {getElementById: () => box}, async () => ({json: async () => routes}));
    if (got !== want) bad.push(`${addr} -> ${got} (wanted ${want})`);
  }
  console.log(JSON.stringify({n: cases.length, bad: bad.slice(0, 15), nbad: bad.length}));
})();
