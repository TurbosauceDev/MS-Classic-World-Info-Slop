// Tracker window, Mini view, inventory/Loot tab, tabs, box docking layout (renderer.js is split in load order; all share one global scope, see renderer.js)
// Mini view (Danny, 2026-10-18): totals, times, the run log and the top 5 of each list; the window is sized to fit it
const MINI_ROWS = 5;
function miniList(rows, cell, empty){ if (!rows.length) return `<tr class="more"><td>${empty}</td></tr>`;
  const more = rows.length - MINI_ROWS; return rows.slice(0, MINI_ROWS).map(cell).join("") + (more > 0 ? `<tr class="more"><td colspan="2">and ${more} more</td></tr>` : "") }
function renderMini(s){
  $("#miniTotal").textContent = fmt(s.exp); $("#miniActive").textContent = hm(s.activeMin / 60);
  $("#miniClock").textContent = runT0 && (timer != null || dummyOn) ? hm((Date.now() - runT0) / 3.6e6) : "-";
  $("#miniState").textContent = [$("#stateText").textContent, s.mapName].filter(Boolean).join(" · ");
  $("#miniItems").innerHTML = miniList(s.items, i => `<tr><td>${ico(i.id)}${esc(i.name)}</td><td class="n">×${fmt(i.n)}</td></tr>`, "Nothing yet");
  $("#miniMobs").innerHTML = miniList(s.mobs, m => `<tr><td>${esc(m.name)}</td><td class="n">${fmt(m.kills)}</td></tr>`, "None yet");
  $("#miniUsed").innerHTML = miniList(s.used.filter(u => u.n), u => `<tr><td>${ico(u.id)}${esc(u.name)}</td><td class="n">×${fmt(u.n)}</td></tr>`, "None yet");
  const f = $("#miniFeed"); f.scrollTop = f.scrollHeight;   // (it can't scroll while hidden: set again once shown)
  miniFit();
}
// the window fits the Mini view when it opens, and grows if the lists outgrow it (only when that changed: setting it every
// tick would fight a user resizing). A window made bigger than that gets bigger content, not blank space (Danny, 2026-10-19:
// "have the content grow to match its new container size"): the view is zoomed up as far as the window's height allows (to
// 2.5x, keeping at least 340 px of layout width) and the run log takes what's left.
let miniH = 0, miniZ = 1;
function miniFit(force){ if (!document.body.classList.contains("mini")) return compactFit(force);
  const m = $("#mini"), B = document.body, bottom = z => (m.style.zoom = z, m.getBoundingClientRect().bottom + scrollY + 10);
  B.classList.add("measure");   // natural height: no stretching
  const h = Math.ceil(bottom(1));
  if (force || (h > innerHeight + 6 && Math.abs(h - miniH) > 6)){ miniH = h; miniZ = 1; B.classList.remove("measure"); host.mini?.(true, h); return }
  let lo = 1, hi = Math.max(1, Math.min(2.5, innerWidth / 340));
  for (let i = 0; i < 8 && hi - lo > 0.02; i++){ const z = (lo + hi) / 2; if (bottom(z) <= innerHeight) lo = z; else hi = z }
  miniZ = Math.floor(lo * 50) / 50; m.style.zoom = miniZ; B.classList.remove("measure");
}
let miniRaf = 0;
addEventListener("resize", () => { if (document.body.classList.contains("mini") && !miniRaf) miniRaf = requestAnimationFrame(() => { miniRaf = 0; miniFit() }) });
// Compact (Danny, 2026-10-18: a middle ground between everything and Mini): the tabs and their boxes are hidden, only the
// boxes pinned above them show (the main card, the run log, whatever else is pinned), and the window fits their height.
// Saved in settings.compact; View menu and a shortcut toggle it
function compactSet(on){ document.body.classList.toggle("compact", on); miniH = 0;
  if (on) requestAnimationFrame(() => compactFit(true)); else if (!document.body.classList.contains("mini")) host.mini?.(false) }
function compactFit(force){ if (!document.body.classList.contains("compact") || document.body.classList.contains("mini")) return;
  const h = Math.ceil(Math.max(...[...document.body.children].filter(e => e.offsetParent && getComputedStyle(e).position !== "fixed").map(e => e.getBoundingClientRect().bottom + scrollY)) + 10);
  if (force || Math.abs(h - miniH) > 6){ miniH = h; host.mini?.(true, h) } }

// inventory: which tabs were read and when (Session tab), and what changed since the first look (Loot tab)
const INV_TABS = [["equip", "Equip"], ["use", "Use"], ["etc", "Etc"]];
function renderInv(s){
  const tabs = s?.invTabs || {}, at = t => new Date(t).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});
  $("#invTabs").innerHTML = INV_TABS.map(([k, name]) => { const v = tabs[k];
    return `<button class="chip ${v ? v.last > v.first ? "ok" : "half" : "need"}" data-tab="${k}" title="${(v ? "first read " + at(v.first) + ", last " + at(v.last) : "not seen yet") + ". Click to read it now (have the " + name + " tab open in the game)"}">${v ? v.last > v.first ? "✓✓" : "✓" : "○"} ${name}</button>` }).join(" ");
  // the start count: asked for until all 3 tabs were read once
  const missing = timer != null ? INV_TABS.filter(([k]) => !tabs[k]).map(([, n]) => n) : [];
  $("#invAsk").classList.toggle("hidden", !missing.length);
  $("#invAsk").textContent = `Open your inventory and show the ${missing.join(", ")} tab${missing.length > 1 ? "s" : ""} for a second${missing.length > 1 ? " each" : ""}: that's the start count.`;
}
// a number with its sign, green when gained and red when lost or spent
const sg = (n, coin) => { n = Math.round(n || 0); return `<span class="${n > 0 ? "pos" : n < 0 ? "neg" : ""}">${n > 0 ? "+" : n < 0 ? "−" : ""}${coin ? COIN : ""}${fmt(Math.abs(n))}</span>` };
const kills = n => fmt(n) + (n === 1 ? " kill" : " kills");
const sgm = n => sg(n, true), mz = n => COIN + fmt(n);
// Loot tab: where the mesos came from and went
const cell = (k, v, note = "") => `<div><div class="k">${k}</div><div class="v">${v}</div>${note ? `<div class="note">${note}</div>` : ""}</div>`;
function renderMesos(s){
  $("#mesoGrid").innerHTML = cell("Picked up", sgm(s.mesos), mz(s.mesosHr) + "/hr of farming") + cell("Per kill", mz(s.mesoPerKill), kills(s.kills))
    + cell("Spent on consumables", s.used.some(u => u.n) ? sgm(-s.usedCost) : "-", s.used.some(u => u.n) ? mz(s.usedCostHr) + "/hr" : "")
    + cell("Items looted are worth", sgm(s.lootValue), "if sold at the prices below")
    + cell("Net", sgm(s.mesos + s.lootValue - s.usedCost), "picked up + items - consumables")
    + cell("Inventory mesos", s.walletNet == null ? "-" : sgm(s.walletNet), s.walletNet == null ? "open the inventory to read it" : "now vs. first look, shop trips included");
}
// after Stop: each inventory tab read since then (green), open on screen right now (amber) or not yet (grey)
function renderWrap(s){
  $("#wrap").classList.toggle("hidden", !wrap);
  $("#nameRow").classList.toggle("hidden", !!wrap);   // asked in the wrap-up card instead
  if (!wrap) return;
  const tabs = (s || session?.stats())?.invTabs || {}, n = INV_TABS.filter(([k]) => tabs[k]?.last >= wrap.t).length;
  $("#wrapTabs").innerHTML = INV_TABS.map(([k, name]) => { const done = tabs[k]?.last >= wrap.t, seeing = !done && lastInvTab === k && Date.now() - (tabs[k]?.last || 0) < 10e3;
    return `<button class="chip ${done ? "ok" : seeing ? "half" : "need"}" data-tab="${k}" title="${done ? "Read after Stop" : "Not read since Stop. Click to read it now (have the " + name + " tab open in the game)"}">${done ? "✓" : seeing ? "…" : "○"} ${name}</button>` }).join(" ");
  $("#wrapNote").textContent = n === 3 ? "All 3 tabs read: add a name or note below if you like, then Finalize log." : `${n} of 3 tabs read since Stop.`;
  $("#wrapName").value = $("#runName").value;
  // all 3 tabs read: on to the name and note (once, and not while typing somewhere)
  if (n === 3 && !wrap.noted){ wrap.noted = true; if (!document.activeElement?.matches("input, textarea")) $("#runNote").focus() }
}
// the line next to Start/Stop: tracking or not, paused, for how long
function renderState(s){
  const on = timer != null, paused = on && s?.paused;
  $("#state").className = wrap ? "paused" : paused ? "paused" : on ? "on" : "";
  $("#stateText").textContent = wrap ? "Stopped at " + clock(wrap.t) + " · wrapping up" : paused ? "Paused" : on ? "Tracking" + (s ? " · " + hm(s.activeMin / 60) + " farmed" : "") : s && s.activeMin ? "Stopped · " + hm(s.activeMin / 60) + " farmed" : "Not tracking";
  $("#go").textContent = wrap ? "Resume" : on ? "Stop" : "Start"; $("#go").classList.toggle("on", on && !wrap);
  if (held && paused && !wrap) $("#stateText").textContent = "Paused by you";
  pauseUi();
}
// tabs under the numbers; the last one open is remembered
function showTab(name){
  for (const b of document.querySelectorAll(".tabs button")){ b.classList.toggle("sel", b.dataset.tab === name); b.setAttribute("aria-selected", String(b.dataset.tab === name)); b.tabIndex = b.dataset.tab === name ? 0 : -1 }
  for (const sec of document.querySelectorAll("section[data-tab]")) sec.classList.toggle("hidden", sec.dataset.tab !== name);
  try { localStorage.setItem("tab", name) } catch {}
}
for (const b of document.querySelectorAll(".tabs button")){ b.setAttribute("role", "tab"); if (b.id !== "histBtn") b.onclick = () => showTab(b.dataset.tab) }
for (const sec of document.querySelectorAll("section[data-tab]")) sec.setAttribute("role", "tabpanel");
// left/right arrows move between the tabs (the usual tab-strip keys)
$(".tabs").addEventListener("keydown", e => { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const bs = [...document.querySelectorAll(".tabs button")], i = bs.indexOf(document.activeElement); if (i < 0) return;
  const n = bs[(i + (e.key === "ArrowRight" ? 1 : bs.length - 1)) % bs.length]; n.click(); n.focus(); e.preventDefault() });
// boxes, like OBS sources: dragged by the ⠿ grip or the title onto another box (above or below it), onto a tab (to the end of it), or onto
// the strip above the tabs (pinned: shows on every tab); – folds one to its title. Saved in settings.layout (Danny, 2026-10-18).
// Dropped on a box's left or right edge, it goes beside it in a row (Danny, 2026-10-18: "like OBS"); the splitter between them
// resizes; dropped on the top or bottom of a box in a row, the two stack in a column inside the row
function foldMark(b){ const f = b.querySelector(".fold"), on = b.classList.contains("folded"); f.textContent = on ? "+" : "–"; f.setAttribute("aria-expanded", String(!on)) }
const BOXES = [...document.querySelectorAll("[data-box]")], BOX_HOME = BOXES.map(b => [b, b.parentElement, b.nextElementSibling, b.classList.contains("folded")]);   // folded in the HTML = folded by default
let dragBox = null;
const isRow = e => !!e?.classList?.contains("boxrow"), isCol = e => !!e?.classList?.contains("boxcol"), isSplit = e => !!e?.classList?.contains("split");
const mk = cls => Object.assign(document.createElement("div"), {className: cls});
const parts = r => [...r.children].filter(x => !isSplit(x));
const grow = e => parseFloat(e.style.flexGrow) || 0;
function mkSplit(){ const s = mk("split"); s.tabIndex = 0; s.title = "Drag to resize (or left and right arrow keys)";
  s.setAttribute("role", "separator"); s.setAttribute("aria-orientation", "vertical"); s.setAttribute("aria-label", "Resize the boxes beside it"); return s }
// after a move: a column or row left with one part unwraps, empty ones go, a splitter sits between each two parts of a row,
// and a part new to a row gets the row's average width
function tidy(){
  for (const c of [...document.querySelectorAll(".boxcol")]){ const k = [...c.children]; if (k.length < 2 || !isRow(c.parentElement)) c.replaceWith(...k) }
  for (const r of [...document.querySelectorAll(".boxrow")]){
    const p = parts(r);
    if (p.length < 2){ r.replaceWith(...(isCol(p[0]) ? [...p[0].children] : p)); continue }
    const k = [...r.children]; k.forEach((x, i) => { if (isSplit(x) && (i === 0 || i === k.length - 1 || isSplit(k[i - 1]))) x.remove() });
    for (const x of p){ if (x.previousElementSibling && !isSplit(x.previousElementSibling)) x.before(mkSplit()); if (x.nextElementSibling && !isSplit(x.nextElementSibling)) x.after(mkSplit()) }
    const set = p.filter(grow), avg = set.length ? set.reduce((a, x) => a + grow(x), 0) / set.length : 0;
    if (avg) for (const x of p) if (!grow(x)) x.style.flex = `${avg} 1 0px`;
  }
  for (const e of document.querySelectorAll("[data-box], .boxcol")) if (!isRow(e.parentElement)) e.style.flex = "";
}
// saved as order[tab] = [box id | {row: [box id | [box ids (a column)]], w: [widths]}]; older saves (just ids) still load
function layoutSave(){
  requestAnimationFrame(() => compactFit());
  tidy(); const order = {};
  const hOf = e => e.classList.contains("sized") ? parseFloat(e.style.getPropertyValue("--h")) || undefined : undefined;
  const ser = e => isRow(e) ? {row: parts(e).map(p => isCol(p) ? [...p.children].map(b => b.dataset.box) : p.dataset.box), w: parts(e).map(p => Math.round(grow(p)) || 1), h: hOf(e)} : e.dataset.box;
  for (const h of [$("#dock"), ...document.querySelectorAll("section[data-tab]")]) order[h.id || h.dataset.tab] = [...h.querySelectorAll(":scope > [data-box], :scope > .boxrow")].map(ser);
  const h = {}; for (const b of BOXES){ const v = hOf(b); if (v) h[b.dataset.box] = v }   // heights set with the bar under a box
  host.settings({layout: {order, folded: BOXES.filter(b => b.classList.contains("folded")).map(b => b.dataset.box), h}}).then(x => settings = x);
}
function layoutLoad(l){
  if (!l?.order) return;
  const box = id => BOXES.find(x => x.dataset.box === id);
  for (const [k, items] of Object.entries(l.order)){
    const h = k === "dock" ? $("#dock") : document.querySelector(`section[data-tab="${k}"]`); if (!h || !Array.isArray(items)) continue;
    for (const it of items){
      if (typeof it === "string"){ const b = box(it); if (b) h.appendChild(b); continue }
      if (!Array.isArray(it?.row)) continue;
      const r = mk("boxrow"); h.appendChild(r); if (+it.h > 0) heightSet(r, +it.h);
      it.row.forEach((p, i) => { let e;
        if (Array.isArray(p)){ e = mk("boxcol"); for (const id of p){ const b = box(id); if (b) e.appendChild(b) } if (!e.children.length) return }
        else if (!(e = box(p))) return;
        r.appendChild(e); const w = +it.w?.[i]; if (w > 0) e.style.flex = `${w} 1 0px`;
      });
    }
  }
  for (const b of BOXES){ b.classList.toggle("folded", (l.folded || []).includes(b.dataset.box)); const v = +l.h?.[b.dataset.box]; heightSet(b, v > 0 ? v : null) }
  tidy();
}
// puts box b at side z (top, bottom, left, right) of target t (a box, or a row when dropped in a row's gap)
function place(b, t, z){
  b.style.flex = "";
  if (isRow(t)){ z === "bottom" ? t.after(b) : t.before(b); return }
  const p = t.parentElement;
  if (z === "left" || z === "right"){
    let u = t, r = p;
    if (isCol(p)){ u = p; r = p.parentElement }
    else if (!isRow(p)){ r = mk("boxrow"); t.before(r); r.appendChild(t) }
    z === "left" ? u.before(b) : u.after(b);
  } else {
    if (isRow(p)){ const c = mk("boxcol"); c.style.flex = t.style.flex; t.style.flex = ""; t.before(c); c.appendChild(t) }
    z === "bottom" ? t.after(b) : t.before(b);
  }
}
for (const b of BOXES){
  b.classList.add("box");
  const c = document.createElement("div"); c.className = "boxctl";
  c.innerHTML = `<span class="btitle">${esc(b.dataset.title)}</span><span class="grip" tabindex="0" role="button" aria-label="Move ${esc(b.dataset.title)} (arrow keys)" title="Drag to move. Drop on the left or right side of another box to put them side by side, on its middle to go above or below; or onto a tab, or the strip above the tabs. Keys: focus it, then arrows (left/right puts it beside its neighbour)">⠿</span><button class="fold" aria-label="Fold ${esc(b.dataset.title)}" aria-expanded="true" title="Fold or unfold">–</button>`;
  b.prepend(c);
  c.querySelector(".fold").onclick = () => { b.classList.toggle("folded"); foldMark(b); layoutSave() };
  // keyboard: arrow up/down on the grip moves the box past its neighbour (out of its row at a row's or column's end); left/right
  // moves it along its row, or puts a box that's on its own beside its neighbour
  c.querySelector(".grip").onkeydown = e => { const k = e.key, up = k === "ArrowUp" || k === "ArrowLeft"; if (!/^Arrow(Up|Down|Left|Right)$/.test(k)) return; e.preventDefault();
    const p = b.parentElement, side = x => { do x = up ? x.previousElementSibling : x.nextElementSibling; while (isSplit(x)); return x };
    if (k === "ArrowLeft" || k === "ArrowRight"){ const u = isCol(p) ? p : b;
      // not in a row yet: it goes beside the box above it (or below, when it's the first), making a row
      if (!isRow(u.parentElement)){ const n = [b.previousElementSibling, b.nextElementSibling].find(x => x?.matches("[data-box], .boxrow")); if (!n) return;
        place(b, isRow(n) ? parts(n)[up ? 0 : parts(n).length - 1] : n, up ? "left" : "right") }
      else { const s = side(u); if (!s) return; up ? s.before(u) : s.after(u) } }
    else if (isRow(p)) up ? p.before(b) : p.after(b);
    else { const s = side(b); if (s?.matches("[data-box], .boxrow")) up ? s.before(b) : s.after(b); else if (isCol(p) && !s) up ? p.parentElement.before(b) : p.parentElement.after(b); else return }
    c.querySelector(".grip").focus(); layoutSave() };
}
// mouse dragging (pointer events: the browser's own drag and drop didn't start in the app, Danny 2026-10-18). Held on the
// grip or the box's title, moved 5 px: the box follows as a label under the pointer until it's let go
let drag = null;
document.addEventListener("pointerdown", e => {
  const h = e.button === 0 && e.target.closest(".grip, .box h3"), b = h?.closest("[data-box]");
  if (!b) return;
  e.preventDefault(); drag = {b, x: e.clientX, y: e.clientY, on: false, el: null};
});
const dropTarget = (x, y) => { const t = document.elementFromPoint(x, y)?.closest("[data-box], .boxrow, #dock, section[data-tab], .tabs button");
  if (!t || t === dragBox || dragBox.contains(t)) return null;
  if (t.matches(".tabs button") && !["session", "loot", "hist"].includes(t.dataset.tab)) return null; return t };
// which side of a box the pointer is on: its left or right third = beside it, the middle third = above or below. (It was the
// left/right quarter, at most 90 px, marked by a 3 px line: Danny never found it, "i can only move things up and down",
// 2026-10-18.) The ghost shows where the box will land: half the box for side by side, a bar for above or below
function dropZone(t, x, y){ const r = t.getBoundingClientRect(), ex = Math.max(r.width / 3, Math.min(40, r.width / 2));
  if (t.matches("[data-box]")){ if (x < r.left + ex) return "left"; if (x > r.right - ex) return "right" }
  return y > r.top + r.height / 2 ? "bottom" : "top" }
let ghost = null;
function dropMark(t, z){
  for (const x of document.querySelectorAll(".over-top, .over-bottom, .over-left, .over-right, .over-drop")) x.classList.remove("over-top", "over-bottom", "over-left", "over-right", "over-drop");
  ghost ||= document.body.appendChild(mk("dropGhost"));
  const box = t?.matches("[data-box], .boxrow");
  ghost.classList.toggle("hidden", !box); if (t) t.classList.add(box ? "over-" + z : "over-drop");
  if (!box) return;
  const r = t.getBoundingClientRect(), side = z === "left" || z === "right", h = Math.min(30, r.height / 2);
  Object.assign(ghost.style, {left: (z === "right" ? r.left + r.width / 2 : r.left) + "px", width: (side ? r.width / 2 : r.width) + "px",
    top: (z === "bottom" ? r.bottom - h : r.top) + "px", height: (side ? r.height : h) + "px"});
  ghost.textContent = side ? (z === "left" ? "◧ Side by side (left)" : "Side by side (right) ◨") : z === "top" ? "▲ Above" : "▼ Below";
}
document.addEventListener("pointermove", e => {
  if (!drag) return;
  if (!drag.on){
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 5) return;
    drag.on = true; dragBox = drag.b; dragBox.classList.add("moving"); document.body.classList.add("dragging");
    drag.el = Object.assign(document.createElement("div"), {className: "dragLabel", innerHTML: `${esc(dragBox.dataset.title)}<small>left or right side of a box: side by side</small>`}); document.body.appendChild(drag.el);
    // near the window's top or bottom edge: the page scrolls, to reach boxes out of sight
    drag.iv = setInterval(() => { if (drag?.cy < 72) scrollBy(0, -15); else if (drag?.cy > innerHeight - 40) scrollBy(0, 15) }, 30);
  }
  drag.cy = e.clientY;
  drag.el.style.left = Math.max(4, Math.min(e.clientX + 12, innerWidth - drag.el.offsetWidth - 4)) + "px"; drag.el.style.top = Math.min(e.clientY + 8, innerHeight - drag.el.offsetHeight - 4) + "px";
  const t = dropTarget(e.clientX, e.clientY);
  dropMark(t, t && dropZone(t, e.clientX, e.clientY));
  // held over a tab for half a second: that tab opens, so the box can go between its boxes
  if (t?.matches(".tabs button")){ if (drag.tab !== t){ drag.tab = t; drag.tabT = Date.now() } else if (Date.now() - drag.tabT > 500 && !t.classList.contains("sel")) showTab(t.dataset.tab) } else drag.tab = null;
});
const endDrag = (e, cancel) => {
  if (!drag) return; const d = drag; drag = null;
  if (!d.on) return;
  // the target is found while the page still looks as it did under the pointer: the pin strip shrinks away once dragging ends
  d.el.remove(); const t = !cancel && dropTarget(e.clientX, e.clientY), z = t && dropZone(t, e.clientX, e.clientY);
  clearInterval(d.iv); d.b.classList.remove("moving"); document.body.classList.remove("dragging"); dropMark(null); dragBox = null;
  if (!t) return;
  if (t.matches("[data-box], .boxrow")) place(d.b, t, z);
  else if (t.matches(".tabs button")){ document.querySelector(`section[data-tab="${t.dataset.tab}"]`).appendChild(d.b); showTab(t.dataset.tab) }
  else t.appendChild(d.b);
  layoutSave();
};
document.addEventListener("pointerup", e => endDrag(e, false));
document.addEventListener("pointercancel", e => endDrag(e, true));
document.addEventListener("keydown", e => { if (e.key === "Escape" && drag) endDrag(e, true) });
// resizing (Danny, 2026-10-19: "it should require something like a shift click or an alt click ... the adjustment bars
// shouldn't be perpetually visible and grabbable"): bars show in the gaps only while Shift or Alt is held (the pointer's own
// modifier flags count too, so it works while the game has the keyboard). The bar between two boxes side by side shares the
// row's width (each at least 110 px); the bar under a box or a row sets its height, and the boxes beside or under it give way.
// Double-click a bar to undo it. A focused side-by-side bar also takes the left and right arrow keys.
// Widths are measured once at the start of a drag and moved by the pointer's total travel: re-measuring on every move (the
// old way) drifted whenever a box's content was wider than its share, which is what made it feel buggy.
let rs = null;
const HMIN = 48;
function rzBuild(){ const L = $("#rzLayer"); L.innerHTML = "";
  for (const e of document.querySelectorAll("#dock > [data-box], #dock > .boxrow, section[data-tab] > [data-box], section[data-tab] > .boxrow, .boxcol > [data-box]:not(:last-child)")){
    if (!e.offsetParent || e.classList.contains("folded")) continue;
    const h = mk("hsplit"); h.rz = e; h.title = "Drag to change the height (double-click: back to fit)"; L.appendChild(h) }
  rzPlace() }
function rzPlace(){ for (const h of $("#rzLayer").children){ const r = h.rz.getBoundingClientRect();
  h.classList.toggle("hidden", !r.height); Object.assign(h.style, {left: r.left + "px", width: r.width + "px", top: r.bottom - 1 + "px"}) } }
function rzOn(on){ if (on === document.body.classList.contains("rzKeys")) return; document.body.classList.toggle("rzKeys", on); if (on) rzBuild() }
function heightSet(e, h){ if (h == null){ e.classList.remove("sized"); e.style.removeProperty("--h"); return }
  e.style.setProperty("--h", Math.max(HMIN, Math.round(h)) + "px"); e.classList.add("sized") }
function widthBase(s){ for (const p of parts(s.parentElement)) p.style.flex = `${Math.round(p.getBoundingClientRect().width)} 1 0px`; return [grow(s.previousElementSibling), grow(s.nextElementSibling)] }
function widthSet(s, wa, wb, dx){ const sum = wa + wb; if (sum < 220) return; const na = Math.max(110, Math.min(sum - 110, wa + dx));
  s.previousElementSibling.style.flex = `${Math.round(na)} 1 0px`; s.nextElementSibling.style.flex = `${Math.round(sum - na)} 1 0px` }
function resize(s, dx){ const [wa, wb] = widthBase(s); widthSet(s, wa, wb, dx) }
document.addEventListener("pointerdown", e => { const s = e.button === 0 && e.target.closest?.(".split, .hsplit"); if (!s) return;
  e.preventDefault(); try { s.setPointerCapture(e.pointerId) } catch {}
  rs = s.rz ? {s, y: e.clientY, h: s.rz.getBoundingClientRect().height} : {s, x: e.clientX, w: widthBase(s)};
  s.classList.add("on"); document.body.classList.add("resizing"); document.body.classList.toggle("rows", !!s.rz) });
let rzRaf = 0;
document.addEventListener("pointermove", e => {
  if (!rs){ rzOn(e.shiftKey || e.altKey); if (document.body.classList.contains("rzKeys") && !rzRaf) rzRaf = requestAnimationFrame(() => { rzRaf = 0; rzPlace() }); return }
  if (rs.s.rz){ heightSet(rs.s.rz, rs.h + e.clientY - rs.y); rzPlace() } else { widthSet(rs.s, ...rs.w, e.clientX - rs.x); rzPlace() } });
const endResize = () => { if (!rs) return; rs.s.classList.remove("on"); document.body.classList.remove("resizing", "rows"); rs = null; layoutSave(); requestAnimationFrame(rzPlace) };
document.addEventListener("pointerup", endResize); document.addEventListener("pointercancel", endResize);
document.addEventListener("dblclick", e => { const s = e.target.closest?.(".split, .hsplit"); if (!s) return;
  if (s.rz) heightSet(s.rz, null); else for (const p of parts(s.parentElement)) p.style.flex = "1 1 0px";
  layoutSave(); requestAnimationFrame(rzPlace) });
addEventListener("keydown", e => { if (e.key === "Shift" || e.key === "Alt"){ if (e.key === "Alt") e.preventDefault(); rzOn(true) } });   // Alt: not the menu bar
addEventListener("keyup", e => { if (e.key === "Shift" || e.key === "Alt") rzOn(e.shiftKey || e.altKey) });
addEventListener("blur", () => rzOn(false));
addEventListener("scroll", () => { if (document.body.classList.contains("rzKeys")) rzPlace() }, true);
document.addEventListener("keydown", e => { if (!isSplit(e.target) || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
  e.preventDefault(); resize(e.target, e.key === "ArrowLeft" ? -24 : 24); layoutSave() });
$("#layoutReset").onclick = () => { for (const [b, p, next, f] of [...BOX_HOME].reverse()){ p.insertBefore(b, next); b.classList.toggle("folded", f); heightSet(b, null); foldMark(b) } layoutSave() };
try { const t = localStorage.getItem("tab"); if (t && t !== "hist" && t !== "help" && document.querySelector(`section[data-tab="${t}"]`)) showTab(t) } catch {}

