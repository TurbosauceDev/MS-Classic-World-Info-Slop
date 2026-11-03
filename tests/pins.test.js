// node tests/pins.test.js (CI: docs.yml): Playwright has ONE pinned version, in the root package.json. Workflows install
// it with `npm ci`; a hardcoded `playwright@x.y.z` in a workflow is how 5 pins at 1.56.1 and one at 1.64.1 happened (Hermes
// review 2026-11-02). EXCEPT lists deliberate outliers with the reason.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), wf = path.join(root, ".github/workflows");
const EXCEPT = {
  "meowdb-market-poll.yml": "headed Chromium against meowdb's headless-UA wall; pinned separately since 2026-10-21 (a35496e), change only with a live poll check",
};
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
let fail = 0; const bad = m => { fail++; console.log("FAILED: " + m) };
const want = pkg.devDependencies.playwright;
if (!/^\d+\.\d+\.\d+$/.test(want)) bad(`package.json playwright must be an exact version, got ${want}`);
if (lock.packages?.["node_modules/playwright"]?.version !== want) bad(`package-lock.json playwright != package.json (${want}); run npm install`);
for (const f of fs.readdirSync(wf).filter(f => f.endsWith(".yml"))){
  const t = fs.readFileSync(path.join(wf, f), "utf8");
  if (/playwright@\d/.test(t) && !EXCEPT[f]) bad(`${f}: hardcoded playwright@version; use npm ci (root package.json)`);
}
const dep = fs.readFileSync(path.join(root, ".github/dependabot.yml"), "utf8");
if (!/package-ecosystem: npm, directory: \/,/.test(dep)) bad("dependabot.yml: root npm (directory: /) entry missing");
console.log(fail ? `${fail} problem(s)` : `pins test passed (playwright ${want})`); process.exit(fail ? 1 : 0);
