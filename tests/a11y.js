// Accessibility check with axe-core (blind-spot report B5, 2026-10-31): label, name, ARIA and colour-contrast rules on the pages
// players land on, in the light and dark default themes. Ratchet, not a clean slate: tests/a11y_baseline.json holds the count of
// affected elements per rule today; the run fails if any rule gets WORSE, and prints "better" so the baseline can be lowered
// (node tests/a11y.js --write). Needs axe-core (CI: npm i --no-save axe-core@4.10.2). Run: node tests/a11y.js
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const URL = "file://" + path.resolve(__dirname, "../dist/index.html"), BASE = path.join(__dirname, "a11y_baseline.json");
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const PAGES = ["", "items", "mobs", "wmap", "keep", "train", "skills", "snipe"];   // "" = Home; others are #t-<key> tabs (missing ones are skipped)
const RULES = ["button-name", "link-name", "label", "image-alt", "aria-valid-attr", "aria-valid-attr-value", "aria-allowed-attr", "aria-required-attr", "color-contrast", "duplicate-id-aria", "select-name"];
(async () => {
  const b = await chromium.launch(), found = {}; let scanned = 0;
  for (const scheme of ["light", "dark"]){
    const ctx = await b.newContext({viewport: {width: 1300, height: 900}, colorScheme: scheme}), p = await ctx.newPage();
    await p.goto(URL); await p.waitForTimeout(600); await p.evaluate(AXE => (0, eval)(AXE), AXE);
    for (const t of PAGES){
      if (t){ const ok = await p.evaluate(t => { const b = document.querySelector("#t-" + t); if (!b) return false; document.querySelector("#c-" + b.dataset.cat).click(); b.click(); return true }, t); if (!ok) continue; await p.waitForTimeout(250) }
      scanned++; const r = await p.evaluate(rules => axe.run(document, {runOnly: {type: "rule", values: rules}}), RULES);
      for (const v of r.violations){ const k = v.id; found[k] = Math.max(found[k] || 0, 0) + v.nodes.length }
    }
    await ctx.close();
  }
  await b.close();
  if (scanned < 12){ console.log(`FAILED: only ${scanned} page scans ran (expected 16); a tab key changed?`); process.exit(1) }
  if (process.argv.includes("--write")){ fs.writeFileSync(BASE, JSON.stringify(found, null, 1) + "\n"); console.log("baseline written", found); return }
  const base = JSON.parse(fs.readFileSync(BASE, "utf8")); let fails = 0;
  for (const k of new Set([...Object.keys(found), ...Object.keys(base)])){
    const n = found[k] || 0, was = base[k] || 0;
    if (n > was){ fails++; console.log(`FAILED: ${k}: ${n} elements (baseline ${was})`) }
    else console.log(`ok  ${k}: ${n} (baseline ${was})${n < was ? "  better: lower the baseline with --write" : ""}`);
  }
  if (fails) process.exit(1); console.log("a11y ratchet held");
})();
