// Tracker window, Mini view, inventory boxes, Modules toolbox, box docking layout (renderer.js is split in load order; all share one global scope, see renderer.js)
// Mini view (Danny, 2026-10-18): totals, times, the run log and the top 5 of each list; the window is sized to fit it
const MINI_ROWS = 5;
function miniList(rows, cell, empty){ if (!rows.length) return `<tr class="more"><td>${empty}</td></tr>`;
  const more = rows.length - MINI_ROWS; return rows.slice(0, MINI_ROWS).map(cell).join("") + (more > 0 ? `<tr class="more"><td colspan="2">and ${more} more</td></tr>` : "") }
function renderMini(s){
  $("#miniTotal").textContent = fmt(s.exp); $("#miniActive").textContent = hm(s.activeMin / 60);
  $("#miniClock").textContent = runT0 && (timer != null || dummyOn) ? hm((Date.now() - runT0) / 3.6e6) : "-";
  $("#miniState").textContent = [$("#stateText").textContent, s.nowMapName].filter(Boolean).join(" · ");
  $("#miniItems").innerHTML = miniList(s.items, i => `<tr><td>${ico(i.id)}${esc(i.name)}</td><td class="n">×${fmt(i.n)}</td></tr>`, "Nothing yet");
  $("#miniMobs").innerHTML = miniList(s.mobs, m => `<tr><td>${esc(m.name)}</td><td class="n">${fmt(m.kills)}</td></tr>`, "None yet");
  $("#miniUsed").innerHTML = miniList(s.used.filter(u => u.n), u => `<tr><td>${ico(u.id)}${esc(u.name)}</td><td class="n">×${fmt(u.n)}</td></tr>`, "None yet");
  simpleDraw(s);
  const f = $("#miniFeed"); f.scrollTop = f.scrollHeight;   // (it can't scroll while hidden: set again once shown)
  miniFit();
}
// Simple Mode's top half (Danny 2026-10-23, modeled on his B2 <Subway Depot> mockup): map, Lv/job, EXP gained in the farming
// time, EXP/min, best minute, the level bar from the run's first reading to now, potions used (red) and picked up (green),
// mesos spent / picked up / loot value, and EXP per clock minute (session perMin; gaps are 0). The level bar, potions and
// mesos are built by helpers shared with Focus Mode (one source of truth; the views restyle them in CSS)
function lvlHtml(a, b){ const ups = b.level - a.level, gained = ups * 100 + b.pct - a.pct, from = ups ? 0 : a.pct;
  return `<span>Lv. <b>${a.level}</b></span><div class="smTrack" title="Started at Lv ${a.level} ${a.pct.toFixed(2)}%, now Lv ${b.level} ${b.pct.toFixed(2)}%"><i class="was" style="width:${from}%"></i><i class="now" style="left:${from}%;width:${Math.max(0, b.pct - from)}%"></i>${ups ? `<span class="up" style="left:0"></span>` : ""}</div><span>Lv. <b>${b.level}</b></span><span class="gain">${gained >= 0 ? "+" : "−"}${Math.abs(gained).toFixed(2)}%</span>` }
function potsHtml(s){
  const pots = [...s.used.filter(u => u.n > 0).map(u => ({id: u.id, name: u.name, n: -u.n})), ...s.items.filter(i => G.items[i.id]?.c === "Consumable").map(i => ({id: i.id, name: i.name, n: i.n}))].slice(0, 6);
  return pots.length ? pots.map(p => `<div class="smPot">${ico(p.id)}<div><b class="${p.n < 0 ? "neg" : "pos"}">${p.n < 0 ? "−" : "+"}${fmt(Math.abs(p.n))}</b><span class="note">${esc(p.name)}</span></div></div>`).join("") : `<span class="note">None used yet</span>` }
function moneyHtml(s){
  const pm = v => s.activeMin >= 1 ? fmt(v / s.activeMin) + "/min" : "";
  return `<span class="note">spent</span><span class="v neg">−${fmt(s.usedCost)}</span><span class="note">${pm(s.usedCost)}</span>`
    + `<span class="note">picked up</span><span class="v pos">+${fmt(s.mesos)}</span><span class="note">${pm(s.mesos)}</span>`
    + `<span class="note" title="Etc monster drops at the NPC price; ores, crafting materials, equipment and scrolls at the player-shop price (meso.watch)">loot value</span><span class="v pos">+${fmt(s.lootValue)}</span><span class="note">${pm(s.lootValue)}</span>` }
function simpleDraw(s){
  const mapId = s.nowMap || s.map, name = s.nowMapName || s.mapName, spawns = (G.maps[mapId]?.[2] || []).reduce((a, [, c]) => a + (c || 0), 0);
  $("#smMap").textContent = name || "No map yet"; $("#smSpawns").textContent = spawns ? spawns + " spawns" : "";
  $("#smWho").hidden = !(s.level || s.job); $("#smWho").innerHTML = (s.level ? `Lv. <b>${s.level}</b>` : "") + (s.job ? " " + esc(s.job) : "");
  const min = s.activeMin; $("#smIn").textContent = min >= 1 ? "in " + hm(min / 60) : "";
  $("#miniTotal").textContent = (s.exp > 0 ? "+" : "") + fmt(s.exp);
  $("#smPerMin").textContent = min >= 1 ? fmt(s.exp / min) : "-"; $("#smBest").textContent = s.bestMin ? fmt(s.bestMin) : "-";
  // level bar: dim = where the run started, bright = gained, a tick per level-up; "+%" = level percent gained over the run
  const a = s.firstBar, b = s.bar, lv = $("#smLvl"); lv.hidden = !(a && b);
  if (a && b) lv.innerHTML = lvlHtml(a, b);
  $("#smPots").innerHTML = potsHtml(s);
  $("#smMoney").innerHTML = moneyHtml(s);
  smChart($("#smChart"), s.perMin || []);
}
function smChart(svg, pts){
  const L = 34, R = 512, T = 8, B = 128;
  if (pts.length < 2){ svg.innerHTML = `<text x="260" y="70" text-anchor="middle">The chart starts after the first minute of EXP</text>`; return }
  const top = Math.max(...pts.map(p => p[1])), step = top <= 0 ? 1 : Math.pow(10, Math.floor(Math.log10(top))) * (top / Math.pow(10, Math.floor(Math.log10(top))) > 5 ? 2 : top / Math.pow(10, Math.floor(Math.log10(top))) > 2 ? 1 : 0.5);
  const max = Math.max(step, Math.ceil(top / step) * step), n = pts.length, x = i => L + (R - L) * i / (n - 1), y = v => B - (B - T) * v / max;
  const kfmt = v => v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + "K" : String(v);
  let h = ""; for (let v = 0; v <= max + 1e-9; v += step) h += `<line x1="${L}" x2="${R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--line)"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${kfmt(Math.round(v))}</text>`;
  const every = Math.max(1, Math.ceil(n / 6)); for (let i = 0; i < n; i += every) h += `<text x="${x(i).toFixed(1)}" y="${B + 14}" text-anchor="${x(i) > R - 24 ? "end" : x(i) < L + 24 ? "start" : "middle"}">${new Date(pts[i][0]).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"})}</text>`;
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  h += `<polygon points="${L},${B} ${line} ${R},${B}" fill="color-mix(in srgb, var(--warn) 22%, transparent)"/><polyline points="${line}" fill="none" stroke="var(--warn)" stroke-width="2" stroke-linejoin="round"/>`;
  svg.innerHTML = h;
}
// the window fits the Mini view when it opens, and grows if the lists outgrow it (only when that changed: setting it every
// tick would fight a user resizing). A window made bigger than that gets bigger content, not blank space (Danny, 2026-10-19:
// "have the content grow to match its new container size"): the view is zoomed up as far as the window's height allows (to
// 2.5x, keeping at least 340 px of layout width) and the run log takes what's left.
let miniH = 0, miniZ = 1, miniKey = "";
function miniFit(force){ if (!document.body.classList.contains("mini")) return compactFit(force);
  const m = $("#mini"), B = document.body, bottom = z => (m.style.zoom = z, m.getBoundingClientRect().bottom + scrollY + 10);
  B.classList.add("measure");   // natural height: no stretching
  const h = Math.ceil(bottom(1));
  if (force || (h > innerHeight + 6 && Math.abs(h - miniH) > 6)){ miniH = h; miniZ = 1; B.classList.remove("measure"); host.mini?.(true, h); return }
  // same content height and window as last time: the same zoom (the search below lays the view out ~10 times; every tick
  // in Mini took ~50 ms instead of ~5, 2026-10-19)
  const key = h + "x" + innerWidth + "x" + innerHeight;
  if (!force && key === miniKey){ m.style.zoom = miniZ; B.classList.remove("measure"); return }
  miniKey = key;
  let lo = 1, hi = Math.max(1, Math.min(2.5, innerWidth / 340));
  for (let i = 0; i < 9 && hi - lo > 0.005; i++){ const z = (lo + hi) / 2; if (bottom(z) <= innerHeight) lo = z; else hi = z }
  miniZ = Math.floor(lo * 200) / 200; m.style.zoom = miniZ; B.classList.remove("measure");   // fine steps: in 0.02 steps the text visibly jumped as the edge moved
}
// refit in the resize event itself, before the frame paints (it waited a frame, so a window edge being dragged showed the
// view a step behind: cut off growing, a gap shrinking)
addEventListener("resize", () => { if (document.body.classList.contains("mini")) miniFit() });
// Focus Mode (Danny, 2026-10-26: a third view beside Simple Mode, skinned after maplestory.watch's market page): the same
// session data as Simple Mode in one centred column — hero, stat tiles, level bar, chart, potions and mesos, run log, top
// lists. No zoom games: the roominess is the point; a wider window just leaves more air around the column
function renderFocus(s){
  const mapId = s.nowMap || s.map, name = s.nowMapName || s.mapName, spawns = (G.maps[mapId]?.[2] || []).reduce((a, [, c]) => a + (c || 0), 0);
  $("#fzState").textContent = $("#stateText").textContent;
  $("#fzMap").textContent = name || "No map yet"; $("#fzSpawns").textContent = spawns ? spawns + " spawns" : "";
  $("#fzWho").hidden = !(s.level || s.job); $("#fzWho").innerHTML = (s.level ? `Lv. <b>${s.level}</b>` : "") + (s.job ? " " + esc(s.job) : "");
  const min = s.activeMin;
  $("#fzTotal").textContent = (s.exp > 0 ? "+" : "") + fmt(s.exp); $("#fzIn").textContent = min >= 1 ? "in " + hm(min / 60) : "";
  $("#fzPerMin").textContent = min >= 1 ? fmt(s.exp / min) : "-"; $("#fzBest").textContent = s.bestMin ? fmt(s.bestMin) : "-";
  const a = s.firstBar, b = s.bar, lv = $("#fzLvl"); lv.hidden = !(a && b);
  if (a && b) lv.innerHTML = lvlHtml(a, b);
  $("#fzPots").innerHTML = potsHtml(s);
  $("#fzMoney").innerHTML = moneyHtml(s);
  smChart($("#fzChart"), s.perMin || []);
  $("#fzActive").textContent = hm(min / 60); $("#fzClock").textContent = runT0 && (timer != null || dummyOn) ? hm((Date.now() - runT0) / 3.6e6) : "-";
  $("#fzItems").innerHTML = miniList(s.items, i => `<tr><td>${ico(i.id)}${esc(i.name)}</td><td class="n">×${fmt(i.n)}</td></tr>`, "Nothing yet");
  $("#fzMobs").innerHTML = miniList(s.mobs, m => `<tr><td>${esc(m.name)}</td><td class="n">${fmt(m.kills)}</td></tr>`, "None yet");
  $("#fzUsed").innerHTML = miniList(s.used.filter(u => u.n), u => `<tr><td>${ico(u.id)}${esc(u.name)}</td><td class="n">×${fmt(u.n)}</td></tr>`, "None yet");
  const f = $("#fzFeed"); f.scrollTop = f.scrollHeight;   // (it can't scroll while hidden: set again once shown)
  focusFit();
}
// the window fits the Focus view: the same shrink-to-content host.mini gives Simple Mode (it keeps the width, and restores
// the old size on the way back). No zoom: the air is the point
let fzH = 0;
function focusFit(force){ if (!document.body.classList.contains("focus")) return;
  const B = document.body, el = $("#focus"); B.classList.add("measure");
  const h = Math.ceil(el.getBoundingClientRect().bottom + scrollY + 12);
  B.classList.remove("measure");
  if (force || Math.abs(h - fzH) > 6){ fzH = h; host.mini?.(true, h) } }
addEventListener("resize", () => { if (document.body.classList.contains("focus")) focusFit() });
// "Window height follows the boxes" (settings.fitWin, Danny 2026-10-19: auto size): the full view gets the same fitting, so
// folding a box, a list filling up or another tab grows or shrinks the window to what's there. Off: the player sizes it
const fitsWindow = () => document.body.classList.contains("fitWin");
function fitWinSet(on){ document.body.classList.toggle("fitWin", on); miniH = 0;
  if (fitsWindow()) requestAnimationFrame(() => compactFit(true)); else if (!document.body.classList.contains("mini")) host.mini?.(false) }
function compactFit(force){ if (!fitsWindow() || document.body.classList.contains("mini")) return;
  const B = document.body; B.classList.add("measure");   // natural height
  const h = Math.ceil(Math.max(...[...B.children].filter(e => e.offsetParent && getComputedStyle(e).position !== "fixed").map(e => e.getBoundingClientRect().bottom + scrollY)) + 10);
  B.classList.remove("measure");
  if (force || Math.abs(h - miniH) > 6){ miniH = h; host.mini?.(true, h) } }

// inventory: which tabs were read and when, and what changed since the first look
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
// Mesos box: where the mesos came from and went
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
  // Mini and Focus hide the wrap-up card (Stop from a shortcut): one line there instead, with its own Finalize log
  $("#miniWrap").classList.toggle("hidden", !wrap);
  $("#fzWrap").classList.toggle("hidden", !wrap);
  if (!wrap) return;
  const tabs = (s || session?.stats())?.invTabs || {}, n = INV_TABS.filter(([k]) => tabs[k]?.last >= wrap.t).length;
  $("#wrapTabs").innerHTML = INV_TABS.map(([k, name]) => { const done = tabs[k]?.last >= wrap.t, seeing = !done && lastInvTab === k && Date.now() - (tabs[k]?.last || 0) < 10e3;
    return `<button class="chip ${done ? "ok" : seeing ? "half" : "need"}" data-tab="${k}" title="${done ? "Read after Stop" : "Not read since Stop. Click to read it now (have the " + name + " tab open in the game)"}">${done ? "✓" : seeing ? "…" : "○"} ${name}</button>` }).join(" ");
  $("#miniWrapText").textContent = `Stopped: ${n} of 3 inventory tabs read. Show Equip, Use and Etc, then`;
  $("#fzWrapText").textContent = $("#miniWrapText").textContent;
  if (n === 3) $("#miniWrapText").textContent = "Stopped: all 3 inventory tabs read.";
  if (n === 3) $("#fzWrapText").textContent = $("#miniWrapText").textContent;
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
// boxes, like OBS sources: dragged by the ⠿ grip or the title onto another box (above or below it); – folds one to its title, ×
// puts it away in the Modules toolbox. Saved in settings.layout (Danny, 2026-10-18).
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
// saved as order.dock = [box id | {row: [box id | [box ids (a column)]], w: [widths]}], v: 2; a box not in it is in the toolbox.
// Older saves (order per tab: dock, session, loot, hist) load with dock, Session and Loot in that order. "hist" (Past sessions)
// is a pop-up since 0.2.70 (F2): a save that lists it just skips it
function layoutSave(){
  requestAnimationFrame(() => compactFit());
  tidy(); fitRows(); if (snapOn()) alignRows(SNAP); const order = {};
  const hOf = e => e.classList.contains("sized") ? parseFloat(e.style.getPropertyValue("--h")) || undefined : undefined;
  const ser = e => isRow(e) ? {row: parts(e).map(p => isCol(p) ? [...p.children].map(b => b.dataset.box) : p.dataset.box), w: parts(e).map(p => Math.round(grow(p)) || 1), h: hOf(e)} : e.dataset.box;
  order.dock = [...$("#dock").querySelectorAll(":scope > [data-box], :scope > .boxrow")].map(ser); tbRender();
  const h = {}; for (const b of BOXES){ const v = hOf(b); if (v) h[b.dataset.box] = v }   // heights set with the bar under a box
  host.settings({layout: {v: 2, order, folded: BOXES.filter(b => b.classList.contains("folded")).map(b => b.dataset.box), h}}).then(x => settings = x);
}
function layoutLoad(l){
  if (!l?.order) return;
  const box = id => BOXES.find(x => x.dataset.box === id), h = $("#dock");
  // v2: what isn't listed is put away (the main card always stays: it has Start). Old saves: boxes they don't list stay at home
  if (l.v >= 2) for (const b of BOXES) if (b.dataset.box !== "main") $("#shelf").appendChild(b);
  for (const k of l.v >= 2 ? ["dock"] : ["dock", "session", "loot"]){ const items = l.order[k]; if (!Array.isArray(items)) continue;
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
  // an old save: the boxes it didn't list (new ones, or a tab it never saved) follow the ones it did, in their home order
  if (!(l.v >= 2)){ const said = new Set(["dock", "session", "loot"].flatMap(k => JSON.stringify(l.order[k] || []).match(/"[a-z]+"/g) || []).map(x => x.slice(1, -1)));
    for (const b of BOXES) if (b.parentElement === h && !said.has(b.dataset.box)) h.appendChild(b) }
  for (const b of BOXES){ b.classList.toggle("folded", (l.folded || []).includes(b.dataset.box)); const v = +l.h?.[b.dataset.box]; heightSet(b, v > 0 ? v : null) }
  tidy(); fitRows(); tbRender();
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
  c.innerHTML = `<span class="btitle">${esc(b.dataset.title)}</span><span class="grip" tabindex="0" role="button" aria-label="Move ${esc(b.dataset.title)} (arrow keys)" title="Drag to move. Drop on the left or right side of another box to put them side by side, on its middle to go above or below; or onto a tab, or the strip above the tabs. Keys: focus it, then arrows (left/right puts it beside its neighbour)">⠿</span><button class="fold" aria-label="Fold ${esc(b.dataset.title)}" aria-expanded="true" title="Fold or unfold">–</button>${b.dataset.box === "main" ? "" : `<button class="shut" aria-label="Put ${esc(b.dataset.title)} away" title="Put away (back to the Modules toolbox)">×</button>`}`;
  b.prepend(c);
  c.querySelector(".shut")?.addEventListener("click", () => shelve(b));
  c.querySelector(".fold").onclick = () => { flip(() => { b.classList.toggle("folded"); foldMark(b); fitRows() }); layoutSave() };
  // keyboard: arrow up/down on the grip moves the box past its neighbour (out of its row at a row's or column's end); left/right
  // moves it along its row, or puts a box that's on its own beside its neighbour
  c.querySelector(".grip").onkeydown = e => { const k = e.key, up = k === "ArrowUp" || k === "ArrowLeft"; if (!/^Arrow(Up|Down|Left|Right)$/.test(k)) return; e.preventDefault(); const fm = flipFrom();
    const p = b.parentElement, side = x => { do x = up ? x.previousElementSibling : x.nextElementSibling; while (isSplit(x)); return x };
    if (k === "ArrowLeft" || k === "ArrowRight"){ const u = isCol(p) ? p : b;
      // not in a row yet: it goes beside the box above it (or below, when it's the first), making a row
      if (!isRow(u.parentElement)){ const n = [b.previousElementSibling, b.nextElementSibling].find(x => x?.matches("[data-box], .boxrow")); if (!n) return;
        place(b, isRow(n) ? parts(n)[up ? 0 : parts(n).length - 1] : n, up ? "left" : "right") }
      else { const s = side(u); if (!s) return; up ? s.before(u) : s.after(u) } }
    else if (isRow(p)) up ? p.before(b) : p.after(b);
    else { const s = side(b); if (s?.matches("[data-box], .boxrow")) up ? s.before(b) : s.after(b); else if (isCol(p) && !s) up ? p.parentElement.before(b) : p.parentElement.after(b); else return }
    tidy(); fitRows(); flipTo(fm); c.querySelector(".grip").focus(); layoutSave() };
}
// mouse dragging (pointer events: the browser's own drag and drop didn't start in the app, Danny 2026-10-18). Held on the
// grip or the box's title, moved 5 px: the box follows as a label under the pointer until it's let go
let drag = null;
document.addEventListener("pointerdown", e => {
  const it = e.button === 0 && !e.target.closest("button") && e.target.closest(".tbItem");
  if (it){ e.preventDefault(); drag = {b: BOXES.find(x => x.dataset.box === it.dataset.mod), item: it, x: e.clientX, y: e.clientY, on: false, el: null}; return }
  const h = e.button === 0 && e.target.closest(".grip, .box h3"), b = h?.closest("[data-box]");
  if (!b) return;
  e.preventDefault(); drag = {b, x: e.clientX, y: e.clientY, on: false, el: null};
});
// targets: a box or row in the layout, the layout itself, or the toolbox (= put away). From the toolbox, the empty space under
// the layout counts as "the end of it", so a module dropped anywhere below the last box lands there
const dropTarget = (x, y) => { const e = document.elementFromPoint(x, y), t = e?.closest("#toolbox, [data-box], .boxrow, #dock");
  if (t?.id === "toolbox") return drag?.item ? null : t;
  if (!t){ const d = $("#dock").getBoundingClientRect(); return drag?.item && e && !e.closest("#titlebar, .card") && y > d.bottom ? $("#dock") : null }
  if (t === dragBox || dragBox.contains(t)) return null; return t };
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
    drag.on = true; dragBox = drag.b; dragBox.classList.add("moving"); drag.item?.classList.add("moving"); document.body.classList.add("dragging");
    drag.el = Object.assign(document.createElement("div"), {className: "dragLabel", innerHTML: `${esc(dragBox.dataset.title)}<small></small>`}); document.body.appendChild(drag.el);
    // near the window's top or bottom edge: the page scrolls, to reach boxes out of sight
    drag.iv = setInterval(() => { if (drag?.cy < 72) scrollBy(0, -15); else if (drag?.cy > innerHeight - 40) scrollBy(0, 15) }, 30);
  }
  drag.cy = e.clientY;
  drag.el.style.left = Math.max(4, Math.min(e.clientX + 12, innerWidth - drag.el.offsetWidth - 4)) + "px"; drag.el.style.top = Math.min(e.clientY + 8, innerHeight - drag.el.offsetHeight - 4) + "px";
  const t = dropTarget(e.clientX, e.clientY);
  dropMark(t, t && dropZone(t, e.clientX, e.clientY));
  drag.el.querySelector("small").textContent = t?.id === "toolbox" ? "let go: put away" : t?.id === "dock" ? "let go: add at the bottom" : t ? "left or right side of a box: side by side" : drag.item ? "drop it in your layout" : "";
});
const endDrag = (e, cancel) => {
  if (!drag) return; const d = drag; drag = null;
  if (!d.on) return;
  // the target is found while the page still looks as it did under the pointer: the pin strip shrinks away once dragging ends
  d.el.remove(); const t = !cancel && dropTarget(e.clientX, e.clientY), z = t && dropZone(t, e.clientX, e.clientY);
  clearInterval(d.iv); d.b.classList.remove("moving"); d.item?.classList.remove("moving"); document.body.classList.remove("dragging"); dropMark(null); dragBox = null;
  if (!t) return;
  if (t.id === "toolbox") return shelve(d.b);
  flip(() => {
    if (t.matches("[data-box], .boxrow")) place(d.b, t, z);
    else t.appendChild(d.b);
    tidy(); fitRows() });
  if (d.item) added(d.b);
  layoutSave();
};
document.addEventListener("pointerup", e => endDrag(e, false));
document.addEventListener("pointercancel", e => endDrag(e, true));
document.addEventListener("keydown", e => { if (e.key === "Escape" && drag){ e.preventDefault(); endDrag(e, true) } });
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
  for (const e of document.querySelectorAll("#dock > [data-box], #dock > .boxrow, .boxcol > [data-box]:not(:last-child)")){
    if (!e.offsetParent || e.classList.contains("folded")) continue;
    const h = mk("hsplit"); h.rz = e; h.title = "Drag to change the height (double-click: back to fit)"; L.appendChild(h) }
  rzPlace() }
function rzPlace(){ for (const h of $("#rzLayer").children){ const r = h.rz.getBoundingClientRect();
  h.classList.toggle("hidden", !r.height); Object.assign(h.style, {left: r.left + "px", width: r.width + "px", top: r.bottom - 1 + "px"}) } }
function rzOn(on){ if (on === document.body.classList.contains("rzKeys")) return; document.body.classList.toggle("rzKeys", on); if (on) rzBuild() }
function heightSet(e, h){ if (h == null){ e.classList.remove("sized"); e.style.removeProperty("--h"); return }
  e.style.setProperty("--h", Math.max(HMIN, Math.round(h)) + "px"); e.classList.add("sized") }
// with Fit on, neither side of the bar goes narrower than its content (it used to stop at 110 px and cut the table off)
// weights are widths less padding (a box never flexes below its padding), so they share the row out 1:1 in px and a drag
// starts where the bar is (whole widths, each read after the last was set, made the edges jump when a drag began)
const r2 = v => Math.round(v * 100) / 100;
function widthBase(s){ const m = [s.previousElementSibling, s.nextElementSibling].map(e => (fitOn() ? Math.max(110, minW(e)) : 110) - pad(e));
  const ps = parts(s.parentElement), w = ps.map(p => p.getBoundingClientRect().width - pad(p));   // all read before any is set
  ps.forEach((p, i) => p.style.flex = `${r2(w[i])} 1 0px`); return [grow(s.previousElementSibling), grow(s.nextElementSibling), ...m] }
function widthSet(s, wa, wb, dx, ma = 110, mb = 110){ const sum = wa + wb; if (sum < ma + mb) return; const na = Math.max(ma, Math.min(sum - mb, wa + dx));
  s.previousElementSibling.style.flex = `${r2(na)} 1 0px`; s.nextElementSibling.style.flex = `${r2(sum - na)} 1 0px` }
function resize(s, dx){ const [wa, wb, ma, mb] = widthBase(s); widthSet(s, wa, wb, dx, ma, mb) }
document.addEventListener("pointerdown", e => { const s = e.button === 0 && e.target.closest?.(".split, .hsplit"); if (!s) return;
  e.preventDefault(); try { s.setPointerCapture(e.pointerId) } catch {}
  rs = s.rz ? {s, y: e.clientY, h: s.rz.getBoundingClientRect().height} : {s, x: e.clientX, w: widthBase(s)};
  s.classList.add("on"); document.body.classList.add("resizing"); document.body.classList.toggle("rows", !!s.rz) });
let rzRaf = 0;
document.addEventListener("pointermove", e => {
  if (!rs){ rzOn(e.shiftKey || e.altKey); if (document.body.classList.contains("rzKeys") && !rzRaf) rzRaf = requestAnimationFrame(() => { rzRaf = 0; rzPlace() }); return }
  if (rs.s.rz){ heightSet(rs.s.rz, rs.h + e.clientY - rs.y); rzPlace() } else { widthSet(rs.s, rs.w[0], rs.w[1], e.clientX - rs.x, rs.w[2], rs.w[3]); rzPlace() } });
const endResize = () => { if (!rs) return; rs.s.classList.remove("on"); document.body.classList.remove("resizing", "rows"); const r = rs.s.rz ? null : rs.s.parentElement; rs = null;
  if (snapOn() && r) alignRows(SNAP, r); layoutSave(); requestAnimationFrame(rzPlace) };
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
$("#layoutReset").onclick = () => { flip(() => { for (const [b, p, next, f] of [...BOX_HOME].reverse()){ p.insertBefore(b, next?.parentElement === p ? next : null); b.classList.toggle("folded", f); heightSet(b, null); foldMark(b) } tidy(); fitRows() }); layoutSave() };

// ---- fitting (Danny, 2026-10-19: "auto size the modules to properly fit ... properly resizing when the window is moved and
// resized ... it should be smooth and flawless") ----
// Fit (settings.fit, on unless turned off): body.fit gives every box side by side at least its content's width (index.html);
// fitRows wraps a row whose boxes can't all fit side by side onto more lines (index.html .wrapped), and unwraps it once they do. It runs synchronously in the
// window's resize event and after every layout change, so a row never paints a frame overflowing or half cut off.
// Wrapping is decided by trying the row side by side and seeing if its parts add up wider than it: no stored threshold.
const fitOn = () => document.body.classList.contains("fit");
function fitRows(){
  const rows = document.querySelectorAll(".boxrow");
  if (!fitOn()){ for (const r of rows) r.classList.remove("wrapped"); return }
  if (rs) return;   // mid width-drag: the bar keeps both sides at their content width already
  for (const r of rows){ if (!r.offsetParent) continue;
    r.classList.remove("wrapped");
    // layout widths, not scrollWidth: a box still gliding into place (flip) would read as overflow. Fractional widths, not
    // offsetWidth: 4 boxes and 3 bars each rounded up added 2-3 px at some window widths, so a row that fit was marked
    // wrapped and its height bar did nothing (Danny, 2026-10-19: Event log, Mesos, Session numbers, Run log side by side)
    if ([...r.children].reduce((a, x) => a + x.getBoundingClientRect().width, 0) > r.getBoundingClientRect().width + 1) r.classList.add("wrapped") }
  if (document.body.classList.contains("rzKeys")) rzPlace();
}
// a box's (or column's) narrowest width that still shows all of its content
function minW(e){ const st = e.style.cssText; e.style.flex = "none"; e.style.width = "min-content"; const w = e.getBoundingClientRect().width; e.style.cssText = st; return Math.ceil(w) }
function fitSet(on){ document.body.classList.toggle("fit", on); fitRows() }
// "Fit every box now": widths and heights you set go back to fitting their content (the arrangement stays)
function fitAll(){ flip(() => { for (const e of document.querySelectorAll(".sized")) heightSet(e, null);
  for (const r of document.querySelectorAll(".boxrow")) for (const p of parts(r)) p.style.flex = ""; fitRows() }); layoutSave() }
// ---- lining up (Danny, 2026-10-19: "a button that would align all windows nicely ... crisp") ----
// "Line up every box" (View menu, Ctrl+Shift+L, Settings > Layout): rows stacked over each other (same left and right edge:
// the pinned strip and the open tab together) get the edges between their boxes snapped into shared columns, and a box in a
// row that has its own height hands it to the row, so every box in a row shares its top and bottom. Gaps are the fixed 8 px
// of index.html, so they come out even. The pinned strip leads (a tab's rows snap to it, so its columns stay put when you
// change tabs); a row you just resized follows the others. Widths go back as px flex weights, so the edges hold as the window
// resizes. settings.snap (on unless turned off): the same after every move, resize and tab change, for edges already close.
const pad = e => { const c = getComputedStyle(e); return ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"].reduce((a, k) => a + parseFloat(c[k]), 0) };
const snapOn = () => document.body.classList.contains("snap"), SNAP = 24;
function alignRows(tol, lead){
  if (rs) return false;
  const rows = [...document.querySelectorAll(".boxrow")].filter(r => r.offsetParent && !r.classList.contains("wrapped"));
  let moved = false;
  for (const r of rows){ const own = parts(r).filter(p => p.classList.contains("sized") && !p.classList.contains("folded")); if (!own.length) continue;
    const h = r.getBoundingClientRect().height; for (const p of own) heightSet(p, null); heightSet(r, h); moved = true }
  const groups = [];
  for (const r of rows){ const b = r.getBoundingClientRect(); let g = groups.find(g => Math.abs(g.l - b.left) < 2 && Math.abs(g.r - b.right) < 2);
    if (!g) groups.push(g = {l: b.left, r: b.right, rows: []}); g.rows.push(r) }
  for (const g of groups){ if (g.rows.length < 2) continue;
    const W = g.r - g.l, near = tol ?? W / 8, at = new Map(), pts = [];
    // each edge between two boxes, as x from the rows' left
    for (const r of g.rows){ const e = parts(r).slice(0, -1).map(p => p.getBoundingClientRect().right - g.l), rank = r === lead ? 0 : r.closest("#dock") ? 2 : 1;
      at.set(r, e); e.forEach((x, i) => pts.push({r, i, x, rank})) }
    pts.sort((a, b) => a.x - b.x);
    // close edges (never two from one row) meet at the mean of the leading ones
    let c = [];
    const meet = () => { if (c.length > 1){ const top = Math.max(...c.map(p => p.rank)), ld = c.filter(p => p.rank === top), x = ld.reduce((a, p) => a + p.x, 0) / ld.length;
      for (const p of c) at.get(p.r)[p.i] = x } c = [] };
    for (const p of pts){ if (c.length && (p.x - c[0].x > near || c.some(q => q.r === p.r))) meet(); c.push(p) }
    meet();
    for (const r of g.rows){ const p = parts(r), e = at.get(r), gap = p.length > 1 ? p[1].getBoundingClientRect().left - p[0].getBoundingClientRect().right : 0;
      const w = p.map((_, i) => (i < e.length ? e[i] : W) - (i ? e[i - 1] + gap : 0));
      if (w.some(x => x < 40)) continue;
      const was = p.map(x => x.getBoundingClientRect().width);
      if (w.every((x, i) => Math.abs(x - was[i]) < 0.5)) continue;
      // a box never flexes below its padding, so only the width past it is shared out by weight
      p.forEach((x, i) => x.style.flex = `${r2(w[i] - pad(x))} 1 0px`); moved = true }
  }
  if (moved) fitRows();
  return moved;
}
function alignAll(){ flip(() => alignRows()); layoutSave() }
function snapSet(on){ document.body.classList.toggle("snap", on); if (on) alignRows(SNAP) }
// double-clicking a box's title fits just that box: its own height, and the widths of the row it's in
document.addEventListener("dblclick", e => { const t = e.target.closest?.(".box > h3, .box .btitle"), b = t?.closest("[data-box]"); if (!b) return;
  flip(() => { heightSet(b, null); const r = b.closest(".boxrow"); if (r){ heightSet(r, null); for (const p of parts(r)) p.style.flex = "" } fitRows() }); layoutSave() });
addEventListener("resize", () => { fitRows(); if (document.body.classList.contains("rzKeys")) rzPlace() });
// content that grows or shrinks (lists filling up, a tab shown) refits on the next frame: a box's size changing is the signal
let fitRaf = 0; const fitRO = new ResizeObserver(() => { if (!fitRaf) fitRaf = requestAnimationFrame(() => { fitRaf = 0; fitRows() }) });
for (const b of BOXES) fitRO.observe(b);
// moves animate: every box glides from where it was to where it lands (FLIP), so a drop, a fold or a row wrapping reads as
// one motion instead of a jump. Off with the system's "reduce motion"; never during a window resize (that must track the edge)
const calm = matchMedia("(prefers-reduced-motion: reduce)");
function flipFrom(){ const m = new Map(); if (calm.matches) return m; for (const b of BOXES) if (b.offsetParent) m.set(b, b.getBoundingClientRect()); return m }
// while boxes glide, #dock clips sideways: a box sliding in from the right would flash a sideways scrollbar (monkey seed 1, 2026-10-20)
let glideT = 0;
function flipTo(m){ if (m.size){ document.body.classList.add("gliding"); clearTimeout(glideT); glideT = setTimeout(() => document.body.classList.remove("gliding"), 220) }
  for (const [b, r] of m){ if (!b.offsetParent) continue; const n = b.getBoundingClientRect(), dx = r.left - n.left, dy = r.top - n.top;
  if (Math.abs(dx) + Math.abs(dy) < 2) continue;
  b.animate([{transform: `translate(${dx}px, ${dy}px)`}, {transform: "none"}], {duration: 180, easing: "cubic-bezier(.2,.7,.3,1)"}) } }
function flip(fn){ const m = flipFrom(); fn(); flipTo(m) }
// the run log (and Mini's copy) stays on its newest line through any resize, unless you scrolled up to read
for (const f of [$("#feed"), $("#events"), $("#miniFeed"), $("#fzFeed")]){ f._stick = true;
  // only your own scrolling (wheel, keys, the scrollbar) lets go of the newest line: a scroll the browser makes when the box
  // changes size arrives a frame late, after the lines re-wrapped, and used to read as "scrolled up"
  for (const ev of ["wheel", "pointerdown", "keydown", "touchstart"]) f.addEventListener(ev, () => f._user = Date.now(), {passive: true});
  f.addEventListener("scroll", () => { if (!f.clientHeight) return; const end = f.scrollHeight - f.scrollTop - f.clientHeight < 24;
    if (end) f._stick = true; else if (Date.now() - (f._user || 0) < 1500) f._stick = false }, {passive: true});
  new ResizeObserver(() => { if (f._stick) f.scrollTop = f.scrollHeight }).observe(f) }
fitSet(true); document.body.classList.add("snap");   // on until settings say otherwise (renderer-settings.js)

// ---- Modules toolbox (Danny, 2026-10-19: "instead of the tabs and having a compact view to juggle, have the module selection
// be a popout little toolbox that the user can drag and drop modules"; replaced the Session/Loot/History tabs and Compact).
// Put-away boxes live in #shelf (hidden) and show here as cards: drag one into the layout (same drop targets and ghost as moving
// a box), or + adds it at the bottom. × on a box, or a box dragged onto the toolbox, puts it back. Title bar ▦ Modules, View menu,
// Ctrl+Shift+K (key "toolbox") open it; Esc or ✕ closes it
function tbRender(){
  const list = $("#tbList"), away = [...$("#shelf").children].filter(b => b.dataset.box);
  list.innerHTML = away.length ? away.map(b => `<div class="tbItem" role="listitem" tabindex="0" data-mod="${esc(b.dataset.box)}" title="Drag into your layout, or press + (Enter)"><span class="g">⠿</span><span>${esc(b.dataset.title)}</span><button class="alt" aria-label="Add ${esc(b.dataset.title)}">+</button></div>`).join("")
    : `<div id="tbEmpty">Every module is in your layout. Press × on a box to put it away here.</div>`;
}
function tbOpen(on = $("#toolbox").classList.contains("hidden")){ $("#toolbox").classList.toggle("hidden", !on); $("#tbBtn").setAttribute("aria-expanded", String(on)); if (on){ tbRender(); ($("#tbList .tbItem") || $("#tbClose")).focus() } }
// a module just added: unfolded, scrolled into view, briefly lit; History loads its list when it arrives
function added(b){ if (b.classList.contains("folded")){ b.classList.remove("folded"); foldMark(b) }
  requestAnimationFrame(() => { b.scrollIntoView({block: "nearest", behavior: calm.matches ? "auto" : "smooth"}); if (!calm.matches) b.animate([{boxShadow: "0 0 0 3px var(--accent)"}, {boxShadow: "0 0 0 0 transparent"}], {duration: 700}) }) }
function addBox(id){ const b = BOXES.find(x => x.dataset.box === id); if (!b || !b.closest("#shelf")) return; flip(() => { $("#dock").appendChild(b); tidy(); fitRows() }); added(b); layoutSave() }
function shelve(b){ if (b.dataset.box === "main") return; flip(() => { $("#shelf").appendChild(b); b.style.flex = ""; tidy(); fitRows() }); layoutSave(); tbRender() }
$("#tbList").addEventListener("click", e => { const it = e.target.closest("button") && e.target.closest(".tbItem"); if (it) addBox(it.dataset.mod) });
$("#tbList").addEventListener("keydown", e => { const it = e.target.closest(".tbItem"); if (!it) return;
  if (e.key === "Enter" || e.key === " "){ e.preventDefault(); const n = it.nextElementSibling || it.previousElementSibling; addBox(it.dataset.mod); (n && $(`#tbList [data-mod="${n.dataset.mod}"]`) || $("#tbClose")).focus() }
  else if (e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); (e.key === "ArrowDown" ? it.nextElementSibling : it.previousElementSibling)?.focus() } });
$("#tbBtn").onclick = () => tbOpen(); $("#tbClose").onclick = () => tbOpen(false);
document.addEventListener("keydown", e => { if (e.key === "Escape" && !e.defaultPrevented && !drag && !$("#toolbox").classList.contains("hidden") && !MODALS.length){ e.preventDefault(); tbOpen(false) } });
tbRender();

