/* ---------------- MCI Source-health panel: per-source freshness + the meso.watch now-in-asks contract ----------------
   Additive companion to 56-mci.js. #mcisrc (built by 56-mci.js) shows per-source item counts + the updated DATE;
   this panel flags STALENESS (a source whose `read` is older than its poll cadence allows) and surfaces the
   meso.watch live-listing contract the data-quality test (tests/data_quality_test.py) checks: every item in
   `now` (cheapest live listing) must be present in `asks` (all listings, same first 5 fields). Built from the
   same globals 10-maps.js exposes (PW, PWH, ...) + D.pw.now / D.pw.asks. Injects #mcihealth after #mcisrc —
   zero edits to src/pages/mci.html. Re-renders on MCI tab open (data may have refreshed in the Pages copy). */
(() => {
if (!D.pw?.it) return;   // no price data -> nothing to surface (56-mci.js bails the same way)

// inject minimal styling once (keeps mci.html untouched)
if (!document.getElementById('mcihealth-style')) {
  const s = document.createElement('style');
  s.id = 'mcihealth-style';
  s.textContent = `
    .mcihealth{margin:0 0 12px;padding:8px 12px;background:var(--panel);border:1px solid var(--line);border-radius:10px;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font:13px var(--f-mono)}
    .mcihealth .sub{color:var(--muted);font-family:var(--f-body)}
    .mcihealth b{color:var(--ink);font-weight:600}`;
  document.head.appendChild(s);
}

// expected max freshness (minutes) per source, aligned with the poll cadence (tests/cadence_test.js).
// meso.watch has a full-ISO `generated` timestamp (polled 6/hr -> 180 min = definitively stale); the other sources
// only expose a date-only `read` (YYYY-MM-DD), so we measure those in days: 2 days (2880 min) = a 3h poll has missed
// ~16 consecutive slots, definitively stale. Date-only "today" parses as 0-24h ago -> always fresh.
const FRESH = [
  ['meso.watch',        () => D.pw?.generated, 180],
  ['classicmarket.kr',  () => D.cmp?.read,     2880],
  ['meowdb',            () => D.mdb?.read,     2880],
  ['mesoindex.com',     () => D.mi?.read,      2880],
  ['mesoarbitrage.com', () => D.ma?.read,      2880],
  ['maplestory.watch',  () => D.mw?.read,      2880],
];

const ago = s => {   // "YYYY-MM-DD HH:MM" or ISO -> minutes ago, or null if unreadable
  const t = Date.parse(String(s || '').replace(' ', 'T') + 'Z');
  return isNaN(t) ? null : Math.max(0, Math.round((Date.now() - t) / 60000));
};
const agoTxt = m => m == null ? '?' : m < 60 ? m + ' min ago' : m < 2880 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago';

// meso.watch now-in-asks contract: every cheapest live listing is present in the asks list (same first 5 fields).
// Mirrors tests/data_quality_test.py § 3. Surfaces a fetcher format drift on the page instead of in CI only.
function contract(){
  const now = D.pw?.now || {}, asks = D.pw?.asks || {};
  let checked = 0, broken = 0;
  for (const k in now) {
    checked++;
    const v = now[k];
    if (!asks[k]) { broken++; continue; }
    if (!asks[k].some(a => a[0] === v[0] && a[1] === v[1] && a[2] === v[2] && a[3] === v[3] && a[4] === v[4])) broken++;
  }
  return {checked, broken};
}

function html(){
  const stale = [];
  for (const [name, read, max] of FRESH) {
    const m = ago(read());
    if (m != null && m > max) stale.push({name, m, max});
  }
  const c = contract();
  const parts = [];
  if (stale.length) {
    parts.push(`<span class="pill p-warn">${stale.length} stale source${stale.length > 1 ? 's' : ''}</span>`);
    for (const s of stale) parts.push(`<span class="sub"><b>${esc(s.name)}</b> ${agoTxt(s.m)}</span>`);
  } else {
    parts.push(`<span class="pill p-good">All sources fresh</span>`);
  }
  if (c.checked) {
    parts.push(c.broken === 0
      ? `<span class="sub">meso.watch live listings: <b>✓</b> ${c.checked}/${c.checked} in asks</span>`
      : `<span class="pill p-bad">meso.watch: ${c.broken}/${c.checked} live listings not in asks</span>`);
  }
  return parts.join(' ');
}

// inject #mcihealth right after #mcisrc (zero edits to mci.html: the panel is created + placed by JS)
function place(){
  let box = document.getElementById('mcihealth');
  if (!box) {
    const src = document.getElementById('mcisrc');
    if (!src) return;   // MCI section not in this build
    box = document.createElement('div');
    box.id = 'mcihealth'; box.className = 'mcihealth';
    src.after(box);
  }
  box.innerHTML = html();
}
place();
$("#t-mci")?.addEventListener("click", place);   // re-check on tab open (Pages copy may have refreshed market.json)
})();
