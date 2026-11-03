// node tests/inject.js (CI: tests.yml): every name that comes from OTHER people renders as text, never as markup.
// Sellers, shop titles, FM rooms, trade posts, shared-run and KPQ names come from price sites, the tracker server and
// players' own uploads (11-01: shop uploads carry seller IGN + shop title). The page builds most views with innerHTML,
// so one missed esc() is a script injection on everyone who opens that page. This test rewrites every string in those
// data sections to a hostile string, opens every tab plus item pages that have listings, and fails if any of it runs.
// (Hermes review B3, 2026-11-02; tests/edge.js covers the live /api/summary reply the same way.)
const fs = require("fs"), os = require("os"), path = require("path"), {chromium} = require("playwright");
const SRC = path.resolve(__dirname, "../dist/index.html"), OUT = path.join(os.tmpdir(), `inject-test-${process.pid}.html`);
const H = `"'><img src=x onerror="window.__x=(window.__x||0)+1"><svg onload="window.__x=(window.__x||0)+1">`;
// sections whose strings are other people's words; ids, numbers and dates stay as they are so the views still render
const SECTIONS = [["pw", "now"], ["pw", "asks"], ["cm", "posts"], ["mw", "ls"], ["mi", "ls"], ["mdb", "ls"], ["shared"]];   // D.kpq is game data (OSMS), D.crank is parked
const DATEISH = /^\d{4}-\d{2}-\d{2}|^\d+(\.\d+)?$|^$/;
let hits = 0;
const poison = v => {
  if (typeof v === "string") { if (DATEISH.test(v)) return v; hits++; return H }
  if (Array.isArray(v)) return v.map(poison);
  if (v && typeof v === "object") { for (const k of Object.keys(v)) if (k !== "read" && k !== "generated") v[k] = poison(v[k]); return v }
  return v;
};
const html = fs.readFileSync(SRC, "utf8"), TAG = '<script type="application/json" id="sitedata">';
const a = html.indexOf(TAG) + TAG.length, b = html.indexOf("</script>", a);
if (a < TAG.length || b < 0) { console.log("FAILED: no sitedata block in dist/index.html (run scripts/build.py)"); process.exit(1) }
const D = JSON.parse(html.slice(a, b)), ids = new Set();
for (const [k, sub] of SECTIONS){
  const box = sub ? D[k]?.[sub] : D[k]; if (!box) continue;
  if (sub && typeof box === "object" && !Array.isArray(box)) Object.keys(box).slice(0, 15).forEach(id => /^\d+$/.test(id) && ids.add(id));
  if (sub) D[k][sub] = poison(box); else D[k] = poison(box);
}
fs.writeFileSync(OUT, html.slice(0, a) + JSON.stringify(D).replace(/</g, "\\u003c") + html.slice(b));

(async () => {
  const browser = await chromium.launch(), ctx = await browser.newContext({viewport: {width: 1300, height: 900}});
  const page = await ctx.newPage(), errs = [];
  page.on("pageerror", e => errs.push(e.message));
  await page.route(/^https?:\/\/(?!fonts\.)/, r => r.abort());   // offline: the poisoned build is the only data
  await page.goto("file://" + OUT);
  const tabs = await page.$$eval("nav [id^='t-']", bs => bs.map(b => b.id.slice(2)));
  let seen = 0;
  for (const t of tabs){
    await page.evaluate(t => { const b = document.querySelector("#t-" + t); if (b.dataset.cat) document.querySelector("#c-" + b.dataset.cat)?.click(); b.click() }, t).catch(() => {});
    await page.waitForTimeout(120); seen++;
  }
  let items = 0;
  // open each listed item's page the way a click on any item name does (49-items.js document click handler)
  for (const id of ids){
    const ok = await page.evaluate(id => { const el = document.createElement("span"); el.className = "itname"; el.dataset.item = id;
      document.body.append(el); el.click(); el.remove(); return !document.querySelector("#itpage").hidden }, id).catch(() => false);
    if (ok) items++; await page.waitForTimeout(80);
    // "show all" buttons on long listing tables
    await page.$$eval("#itpage [data-pxall]", bs => bs.forEach(b => b.click())).catch(() => {});
  }
  const where = await page.evaluate(() => [...document.querySelectorAll('img[src="x"], svg[onload]')].map(e => { const s = e.closest("section"), p = e.parentElement;
    return (s ? "#" + s.id : "?") + " > " + p.tagName.toLowerCase() + (p.id ? "#" + p.id : "") + (p.className ? "." + String(p.className).split(" ")[0] : "") }));
  const r = await page.evaluate(() => ({x: window.__x || 0, tags: document.querySelectorAll('img[src="x"], svg[onload]').length,
    text: document.body.innerText.includes("onerror=")}));
  await browser.close(); fs.rmSync(OUT, {force: true});
  const ok = !r.x && !r.tags && r.text && items > 0;   // the poisoned strings must actually be on screen, or the test proves nothing
  console.log(`${ok ? "ok " : "FAILED:"} ${hits} outside strings poisoned, ${seen} tabs + ${items} item pages opened: ` +
    `${r.x} ran, ${r.tags} hostile tags in the page, shown as text: ${r.text}`);
  if (where.length) console.log("injected at: " + [...new Set(where)].join(" | "));
  if (errs.length) console.log(`note: ${errs.length} page error(s) with poisoned data (not a failure): ${[...new Set(errs)].slice(0, 3).join(" | ")}`);
  process.exit(ok ? 0 : 1);
})();
