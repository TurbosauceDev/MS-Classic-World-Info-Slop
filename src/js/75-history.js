// Back / Forward (Danny, 2026-10-18): every page change, and every "place" inside a page (a monster, item or skill page,
// a World Map island, area or card, a quest line), is a browser history entry, so the browser's Back button steps
// through the site instead of leaving it. The header ← → buttons call history.back()/forward(). No URL change: share
// links (#key=value&) keep working. Pages report their place with navReg(tab, get, set) (NAVREG in 00-core.js).
(() => {
const here = () => { const b = TABS.find(x => x.getAttribute("aria-selected") === "true"), tab = $("#home").hidden && b ? b.dataset.tab : "home";
  const r = NAVREG[tab]; let v = null; try { v = r ? r.get() : null } catch(e) {} return {tab, v: v ?? null} };
const same = (a, b) => !!a && !!b && a.tab === b.tab && JSON.stringify(a.v) === JSON.stringify(b.v);
let MAX = 0, busy = false, y0 = 0;
try { MAX = +sessionStorage.getItem("navmax") || 0 } catch(e) {}
const st = () => history.state && history.state.nav ? history.state : null;
const setMax = m => { MAX = m; try { sessionStorage.setItem("navmax", m) } catch(e) {} };
const btns = () => { const i = st()?.i || 0; $("#navback").disabled = i <= 0; $("#navfwd").disabled = i >= MAX };
const put = (o, push) => { try { push ? history.pushState(o, "") : history.replaceState(o, "") } catch(e) {} btns() };
// after any click / Enter / change has run its handlers: if the place changed, that's a new entry
function check(){
  if (busy) return; const cur = st(), now = here(); if (same(cur, now)) return;
  if (!cur) return put({nav: 1, i: 0, ...now, y: scrollY});
  put({...cur, y: y0});                                 // where the old place was scrolled to, for Back
  setMax(cur.i + 1); put({nav: 1, i: cur.i + 1, ...now, y: scrollY}, true);
}
const later = () => { y0 = scrollY; setTimeout(check) };
document.addEventListener("click", later, true);
document.addEventListener("change", later, true);
document.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === "Escape") later() }, true);
// keep the current entry's scroll spot fresh (debounced: browsers cap replaceState calls)
let sT; addEventListener("scroll", () => { clearTimeout(sT); sT = setTimeout(() => { const s = st(); if (s && !busy) put({...s, y: scrollY}) }, 300) }, {passive: true});
addEventListener("popstate", () => {
  const s = st(); if (!s) return btns();
  busy = true;
  try { if (s.tab === "home") goHome(); else { const b = $(`[data-tab="${s.tab}"]`); if (b && b.getAttribute("aria-selected") !== "true") b.click(); else if (b){ showCat(b.dataset.cat) } }
    const r = NAVREG[s.tab]; if (r) r.set(s.v); hideQtip(); $("#srch").hidden = true } catch(e) {}
  scrollTo(0, s.y || 0);
  setTimeout(() => { busy = false; btns() });
});
$("#navback").addEventListener("click", e => { e.stopPropagation(); history.back() });
$("#navfwd").addEventListener("click", e => { e.stopPropagation(); history.forward() });
// first entry, once every page has drawn its saved place (some draw in a setTimeout); a reload keeps its spot in the list
setTimeout(() => { const s = st(), now = here(); put(s ? {...s, ...now} : {nav: 1, i: 0, ...now, y: scrollY}); if (!s) setMax(0) });
})();
