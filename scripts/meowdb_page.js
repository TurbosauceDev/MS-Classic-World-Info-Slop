// The page our meowdb fetchers use: a browser context whose User-Agent keeps the real browser string and adds who we are
// (idea from the MaplePrice teardown, Danny 2026-10-31: "honest user agent"). meowdb walls some clients, so one probe call
// checks the suffix is fine; if it is not, the fetch falls back to the plain browser UA and says so in the log.
const SUFFIX = " ms-classic-world-info/1.0 (+https://maplestory.scumlord.studio; fan site data build)";
async function open(browser, url, timeout = 60000){
  const probe = async p => p.evaluate(async () => { try { return (await fetch("/msclassic/api/items?page=1")).status } catch { return 0 } });
  const first = await browser.newPage();
  const ua = await first.evaluate(() => navigator.userAgent);
  await first.close();
  const ctx = await browser.newContext({userAgent: ua + SUFFIX}), p = await ctx.newPage();
  try { await p.goto(url, {timeout}); if (await probe(p) === 200) return p } catch {}
  console.log("::warning::meowdb refused the suffixed User-Agent; using the plain browser one");
  await ctx.close();
  const plain = await browser.newPage(); await plain.goto(url, {timeout}); return plain;
}
module.exports = {open, SUFFIX};
