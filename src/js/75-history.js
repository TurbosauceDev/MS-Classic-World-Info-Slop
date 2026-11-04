// Back / Forward (Danny, 2026-10-18): every page change, and every "place" inside a page (a monster, item or skill page,
// a World Map island, area or card, a quest line), is a browser history entry, so the browser's Back button steps
// through the site instead of leaving it. The header ← → buttons call history.back()/forward(). No URL change: share
// links (#key=value&) keep working. Pages report their place with navReg(tab, get, set) (NAVREG in 00-core.js).
// Cross-document Back (Turbozo 2026-11-04: a linked mention in a post opens the entity's clean page, whose redirect
// hops into the planner; Back must land the reader back in the article): a fresh document reboots with its saved tab and
// the browser's own scroll restore fires before the page has any height. So the site owns scroll (manual) and each
// non-deep-link document mirrors its {tab, y} into sessionStorage (navx:<path>), which the boot restores for
// back_forward/reload entries. Deep-link documents (#i=..., where an entity page's redirect lands) never mirror or
// restore: a share link must open what it names, and the mirror of the article the reader left stays intact.
(() => {
const here = () => { const b = TABS.find(x => x.getAttribute("aria-selected") === "true"), tab = $("#home").hidden && b ? b.dataset.tab : "home";
  const r = NAVREG[tab]; let v = null; try { v = r ? r.get() : null } catch(e) {} return {tab, v: v ?? null} };
const same = (a, b) => !!a && !!b && a.tab === b.tab && JSON.stringify(a.v) === JSON.stringify(b.v);
let MAX = 0, busy = false, y0 = 0;
try { MAX = +sessionStorage.getItem("navmax") || 0 } catch(e) {}
try { history.scrollRestoration = "manual" } catch(e) {}   // old browsers without the API keep the native behavior
const DEEP = Object.keys(HASH).length > 0;   // a share-link document: no mirror, no restore (see the header comment)
const st = () => history.state && history.state.nav ? history.state : null;
const setMax = m => { MAX = m; try { sessionStorage.setItem("navmax", m) } catch(e) {} };
const btns = () => { const i = st()?.i || 0; $("#navback").disabled = i <= 0; $("#navfwd").disabled = i >= MAX };
const put = (o, push) => { try { push ? history.pushState(o, "") : history.replaceState(o, "") } catch(e) {}
  if (!DEEP && o.tab){ try { sessionStorage.setItem("navx:" + location.pathname, JSON.stringify({tab: o.tab, y: Math.round(o.y || 0)})) } catch(e) {} }   // storage can be off (private mode): Back then lands at the top, the old behavior
  btns() };
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
// first entry, once every page has drawn its saved place (some draw in a setTimeout); a reload keeps its spot in the
// list, and a cross-document Back (or reload) puts back the {tab, y} this document mirrored while it was live (read it
// before the put below overwrites the mirror). On a Back the mirrored tab wins too: the entity page's redirect rewrites
// localStorage.tab when it hops into #i=..., so the saved-tab restore alone would reopen the wrong page.
setTimeout(() => {
  let x = null, nav = "navigate";
  if (!DEEP){ try { nav = performance.getEntriesByType("navigation")[0]?.type || nav } catch(e) {}   // no Navigation Timing: nothing to restore, stay at the top
    if (nav === "back_forward" || nav === "reload"){ try { x = JSON.parse(sessionStorage.getItem("navx:" + location.pathname) || "null") } catch(e) {} } }   // broken or absent mirror: stay at the top
  const sel = TABS.find(t => t.getAttribute("aria-selected") === "true")?.dataset.tab;
  // a reload keeps the site's own saved-tab restore (it always matched where the reader was); a cross-document Back pins
  // the mirrored tab too, because the deep-link hop on the way out rewrote localStorage.tab behind this document's back
  if (x && x.tab && x.tab !== sel && nav === "back_forward"){ if (x.tab === "home") goHome(); else $(`[data-tab="${x.tab}"]`)?.click() }
  const s = st(), now = here();
  put(s ? {...s, ...now} : {nav: 1, i: 0, ...now, y: x ? x.y : scrollY}); if (!s) setMax(0);
  if (x && x.y > 0 && x.y < document.documentElement.scrollHeight - innerHeight + 40) scrollTo(0, x.y);
});
})();
