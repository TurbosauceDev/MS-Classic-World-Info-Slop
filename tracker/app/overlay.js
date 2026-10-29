// Overlay window: floating widgets over the game, on any monitor (Danny, 2026-10-26: "a true overlay style mode", shown
// maplestory.watch's live overlay). The tracker window reads the game and does all the maths; this page only renders what
// it's sent (renderer-overlay.js builds the payload, main.js relays it). Edit mode v2 (Danny, 2026-10-28, after ElvUI's
// Toggle Anchors, WoW Edit Mode and WeakAuras' MoverSizer): a panel picker replaces the checkbox strip, cards snap
// magnetically to each other and the screen (15 px, Shift skips), an alignment grid can show and snap, cards resize by
// corner grip / Ctrl+scroll / a scale slider, and arrows nudge the picked card. Done locks the overlay and every click
// goes through to the game until Ctrl+Shift+E (or View menu) edits again.
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]);
const fmt = n => Math.round(n).toLocaleString();
const hm = h => h < 1 ? Math.round(h * 60) + " min" : h.toFixed(1) + " h";
const mss = sec => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0") };
const respT = ms => { const m = Math.ceil(ms / 6e4); return m > 60 ? Math.floor(m / 60) + " h " + (m % 60) + " min" : m + " min" };
const clockT = t => new Date(t).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});
const runClock = ms => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600);
  return (h ? h + ":" : "") + String(Math.floor(s / 60) % 60).padStart(h ? 2 : 1, "0") + ":" + String(s % 60).padStart(2, "0") };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// what can be tracked: the panel lists these, in this order. HOME is where each lands the first time (desktop pixels)
const KINDS = {status: "Status", exp: "EXP", kills: "Kills", mesos: "Mesos", loot: "Loot", map: "Map & spawns", party: "Party", kpq: "KPQ", log: "Run log", stat: "Stat number", bar: "Level bar", bag: "Bag check", simple: "Simple view", focus: "Focus view", blocker: "Chat blocker"};
const HOME = {status: {on: true, x: 24, y: 24}, exp: {on: true, x: 24, y: 108}, map: {on: true, x: 24, y: 250},
  kills: {on: false, x: 24, y: 620}, mesos: {on: false, x: 24, y: 700}, loot: {on: false, x: 24, y: 780},
  party: {on: false, x: 24, y: 860}, kpq: {on: false, x: 24, y: 940}, log: {on: false, x: 24, y: 1020},
  stat: {on: false, x: 300, y: 24}, bar: {on: false, x: 300, y: 110}, bag: {on: false, x: 300, y: 190}, simple: {on: false, x: 24, y: 24}, focus: {on: false, x: 24, y: 24}, blocker: {on: false, x: 24, y: 800}};
let BD = null, DATA = null, CFG = {edit: true, widgets: {}, snap: true, grid: false, gsize: 64, panel: null, insp: null, profile: "Default", profiles: null}, DESK = {x: 0, y: 0, width: 1920, height: 1080}, zTop = 1;
const picked = {id: null};
// Widget instances (0.2.87, WeakAuras' "make as many displays as you like"): a card id is a kind ("exp") or a kind plus an
// instance number ("exp_2"), so one kind can be placed twice. The panel's Add widget makes them, an instance's x removes it.
// "_" not "~": the id lands in a CSS selector (#ovw-exp_2).
const INST = /^([a-z]+)_([1-9]\d?)$/, MAX_INST = 12;
const baseOf = id => (INST.exec(id) || [null, id])[1];
// groups (Danny 10-29: "a way to group modules, so that they stay aligned and can be moved together"): a card carries a
// letter (inspector → Position → Group); dragging or nudging any member moves the whole letter with it. Letters A-H,
// kept per widget (profiles save them; Share codes carry them too).
const GRPS = "ABCDEFGH";
const grpOf = id => GRPS.includes(CFG.widgets[id]?.grp) ? CFG.widgets[id].grp : null;
const grpIds = g => g ? ids().filter(x => grpOf(x) === g) : [];
const grpCount = g => grpIds(g).length;
function badge(id){ const el = $("#ovw-" + id), gb = el?.querySelector(".gb"); if (!gb) return;
  const g = grpOf(id); gb.textContent = g || ""; gb.classList.toggle("on", !!g) }
const validId = id => !!KINDS[id] || (INST.test(id) && !!KINDS[baseOf(id)]);
const ids = () => [...Object.keys(KINDS), ...Object.keys(CFG.widgets).filter(id => INST.test(id) && validId(id))
  .sort((a, b) => baseOf(a).localeCompare(baseOf(b)) || +INST.exec(a)[2] - +INST.exec(b)[2])];
const wName = id => { const m = INST.exec(id); return m ? KINDS[m[1]] + " " + m[2] : KINDS[id] };
// the token registry: every number a Stat number card can show, all read off the snapshot the tracker built from the
// screen (nothing here touches the game). Add one line here and the picker offers it.
const TOKENS = {
  expHr: ["EXP / hr", d => fmt(d.st?.expHr || 0)], expHr5: ["EXP / hr, last 5 min", d => d.st?.expHr5 != null ? fmt(d.st.expHr5) : "—"],
  exp: ["EXP gained", d => "+" + fmt(d.st?.exp || 0)], toLevel: ["Next level in", d => { const h = d.st?.toLevelHrs; return h == null ? "—" : h < 1 ? Math.round(h * 60) + " min" : h.toFixed(1) + " h" }],
  mesosHr: ["Mesos / hr", d => fmt(d.st?.mesosHr || 0)], mesos: ["Mesos picked up", d => "+" + fmt(d.st?.mesos || 0)],
  lootHr: ["Loot value / hr", d => fmt(d.st?.lootHr || 0)], killsHr: ["Kills / hr", d => fmt(d.st?.killsHr || 0)],
  kills: ["Kills", d => fmt(d.st?.kills || 0)], deaths: ["Deaths", d => fmt(d.st?.deaths || 0)],
  // the clock the tracker sends (clockMs, 0.3.0): frozen while paused by you and at the Stop while wrapping up — it
  // used to keep counting (Danny 10-29: "the tracker keeps counting even when paused or stopped, hangs on wrapping up")
  // an older tracker that doesn't send clockMs still computes from runT0, exactly like before
  runClock: ["On the clock", d => d.clockMs != null ? runClock(d.clockMs) : d.runT0 && (d.on || d.dummy) ? runClock(d.t - d.runT0) : "-"],
  farming: ["Farming time", d => d.st ? hm((d.st.activeMin || 0) / 60) : "-"],
};
const TOK_SETS = {};   // kind -> token set, filled just below
const BARS = {levelPct: ["Level progress", d => d.st?.pct != null ? clamp(d.st.pct, 0, 100) : null]};
TOK_SETS.stat = TOKENS; TOK_SETS.bar = BARS;
const tokOf = (id, set, dflt) => { const t = CFG.widgets[id]?.tok; return set[t] ? t : dflt };
// Per-card parameters (Danny 10-28: "a bunch of parameters we could edit"). One registry drives the inspector pop-up, the
// validation of saved/imported values and the defaults, so adding a knob is one line. t: r = range (u = display multiplier,
// so size shows 50-200 but is stored .5-2), s = select, b = toggle, c = colour (empty = follow the theme). kinds limits it.
const pct = v => Math.round(v) + "%", px = v => Math.round(v) + " px";
const PARAMS = [
  {k: "s", sec: "Size & fit", lab: "Size", t: "r", min: .5, max: 2, step: .05, def: 1, u: 100, f: pct},
  {k: "fs", sec: "Size & fit", lab: "Text size", t: "r", min: .7, max: 1.8, step: .05, def: 1, u: 100, f: pct},
  {k: "mw", sec: "Size & fit", lab: "Max width", t: "r", min: 160, max: 900, step: 10, def: {_: 360, simple: 380, focus: 640}, f: px},
  // fixed width/height (Danny 10-29: "resize these windows into strange boxes... very long or very wide, skinny or
  // fat"): the corner grip or a number here pins one or both axes — blank means fit the content like before. The
  // content adapts inside (the logs scroll a short box, lines wrap a skinny one) instead of the card following it.
  {k: "w", sec: "Size & fit", lab: "Width (px, blank = fit)", t: "n", min: 60, max: 2000, def: {_: null, blocker: 560}, ph: "auto"},
  {k: "h", sec: "Size & fit", lab: "Height (px, blank = fit)", t: "n", min: 40, max: 2000, def: {_: null, blocker: 150}, ph: "auto"},
  {k: "pad", sec: "Size & fit", lab: "Padding", t: "s", opts: {compact: "Compact", normal: "Normal", roomy: "Roomy"}, def: "normal"},
  {k: "al", sec: "Size & fit", lab: "Text align", t: "s", opts: {left: "Left", center: "Centre", right: "Right"}, def: "left"},
  {k: "o", sec: "Look", lab: "Opacity", t: "r", min: .25, max: 1, step: .05, def: 1, u: 100, f: pct},
  {k: "bg", sec: "Look", lab: "Glass tint", t: "r", min: 0, max: 100, step: 2, def: {_: 82, blocker: 100}, f: pct},
  {k: "blur", sec: "Look", lab: "Blur", t: "r", min: 0, max: 30, step: 1, def: {_: 14, blocker: 0}, f: px},
  {k: "rad", sec: "Look", lab: "Corners", t: "r", min: 0, max: 26, step: 1, def: {_: 12, blocker: 4}, f: px},
  {k: "brd", sec: "Look", lab: "Border", t: "s", opts: {none: "None", soft: "Soft", accent: "Accent"}, def: {_: "soft", blocker: "none"}},
  {k: "shd", sec: "Look", lab: "Shadow", t: "b", def: {_: true, blocker: false}},
  {k: "acc", sec: "Look", lab: "Accent colour", t: "c"},
  {k: "txt", sec: "Look", lab: "Text colour", t: "c"},
  {k: "show", sec: "Show when", lab: "Visible", t: "s", opts: {always: "Always", tracking: "Only while tracking", idle: "Only while stopped"}, def: "always"},
  {k: "ttl", sec: "Show when", lab: "Title while playing", t: "b", def: false},
  {k: "cv", sec: "Condition", lab: "Watch", t: "s", opts: {none: "Off", expHr: "EXP / hr", mesosHr: "Mesos / hr", killsHr: "Kills / hr", lootHr: "Loot value / hr", kills: "Kills", deaths: "Deaths", pct: "Level progress %"}, def: "none"},
  {k: "cop", sec: "Condition", lab: "When it is", t: "s", opts: {lt: "Below", gt: "Above"}, def: "lt"},
  {k: "cn", sec: "Condition", lab: "This number", t: "n", min: 0, max: 1e9, def: 0},
  {k: "cact", sec: "Condition", lab: "Then", t: "s", opts: {color: "Recolour the card", pulse: "Pulse the card", hide: "Hide the card"}, def: "color"},
  {k: "ccol", sec: "Condition", lab: "Colour", t: "c"},
  {k: "spark", sec: "This card", lab: "Sparkline", t: "b", def: true, kinds: ["exp", "kills", "mesos"]},
  {k: "sub", sec: "This card", lab: "Detail rows", t: "b", def: true, kinds: ["exp", "kills", "mesos", "status", "kpq"]},
  {k: "lines", sec: "This card", lab: "Lines shown", t: "r", min: 2, max: 14, step: 1, def: {_: 6, loot: 5}, f: Math.round, kinds: ["log", "loot"]},
  {k: "vhp", sec: "This card", lab: "HP bar", t: "b", def: true, kinds: ["blocker"]},
  {k: "vmp", sec: "This card", lab: "MP bar", t: "b", def: true, kinds: ["blocker"]},
  {k: "vex", sec: "This card", lab: "EXP bar", t: "b", def: true, kinds: ["blocker"]},
  {k: "vnum", sec: "This card", lab: "Numbers on the bars", t: "b", def: true, kinds: ["blocker"]},
  {k: "vlay", sec: "This card", lab: "Bars", t: "s", opts: {row: "Side by side", col: "Stacked"}, def: "row", kinds: ["blocker"]},
  {k: "bagi", sec: "This card", lab: "Bag check icons", t: "b", def: false, kinds: ["exp"]},
  {k: "bagl", sec: "This card", lab: "Icons", t: "s", opts: {row: "Side by side", col: "Stacked"}, def: "row", kinds: ["bag"]},
  {k: "bgon", sec: "This card", lab: "Card background", t: "b", def: true, kinds: ["bag"]},
  {k: "bagn", sec: "This card", lab: "Tab names", t: "b", def: false, kinds: ["bag"]},
  {k: "rows", sec: "This card", lab: "Monsters shown", t: "r", min: 2, max: 14, step: 1, def: 6, f: Math.round, kinds: ["map"]},
];
const PMAP = Object.fromEntries(PARAMS.map(p => [p.k, p]));
const defOf = (p, id) => p.def !== null && typeof p.def === "object" ? (p.def[baseOf(id)] ?? p.def._) : p.def;
// a value is valid or it is the default: the page never trusts what a save or a pasted code carries
function okParam(p, v, id){
  if (p.t === "r"){ const n = +v; return Number.isFinite(n) && v !== "" && v !== null ? clamp(+(Math.round(n / p.step) * p.step).toFixed(4), p.min, p.max) : defOf(p, id) }
  if (p.t === "n"){ const n = +v; return v !== "" && v !== null && Number.isFinite(n) ? clamp(Math.round(n * 100) / 100, p.min, p.max) : defOf(p, id) }
  if (p.t === "s") return Object.prototype.hasOwnProperty.call(p.opts, v) ? v : defOf(p, id);
  if (p.t === "b") return typeof v === "boolean" ? v : defOf(p, id);
  return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : "";
}
const wv = (id, k) => { const p = PMAP[k], w = CFG.widgets[id]; return okParam(p, w && w[k] !== undefined ? w[k] : defOf(p, id), id) };
const cleanParams = (id, w) => { const o = {};
  for (const p of PARAMS){ if (w[p.k] === undefined || (p.kinds && !p.kinds.includes(baseOf(id)))) continue;
    const v = okParam(p, w[p.k], id); if (v !== defOf(p, id) && v !== "") o[p.k] = v }
  if (TOK_SETS[baseOf(id)]?.[w.tok]) o.tok = w.tok;
  return o };

// ---- the widgets -----------------------------------------------------------
// the card sparkline (0.2.80): a tiny polyline of the rate's last samples, current-coloured, a dot on the newest value.
// Gaps (null samples) drop out; one sample or none draws nothing. Reads the theme vars live, so it follows re-themes.
function SPK(d, k){
  const vs = (Array.isArray(d.spark) ? d.spark : []).map(x => x?.[k]).filter(v => Number.isFinite(v));
  if (vs.length < 2) return "";
  const w = 122, h = 26, min = Math.min(...vs), span = (Math.max(...vs) - min) || 1;
  const pts = vs.map((v, i) => `${(i / (vs.length - 1) * (w - 3)).toFixed(1)},${(h - 3 - (v - min) / span * (h - 6)).toFixed(1)}`);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${pts.join(" ")}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity=".8"/>
    <circle cx="${pts.at(-1).split(",")[0]}" cy="${pts.at(-1).split(",")[1]}" r="2.2" fill="currentColor"/></svg>`;
}
// Borderless mode (0.2.94): Simple Mode and Focus Mode as cards. Same numbers as renderMini/renderFocus (d.sm is built from
// the same stats); Focus adds the top lists. The corner grip scales the whole card, so it reads at any size on a second monitor.
function svChart(pts){
  if (pts.length < 2) return `<svg viewBox="0 0 300 60" preserveAspectRatio="none"><text x="150" y="34" text-anchor="middle" fill="currentColor" style="font-size:11px;opacity:.6">Chart starts after the first minute of EXP</text></svg>`;
  const max = Math.max(1, ...pts.map(p => p[1])), n = pts.length, x = i => 300 * i / (n - 1), y = v => 56 - 52 * v / max;
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 300 60" preserveAspectRatio="none"><polygon points="0,56 ${line} 300,56" fill="currentColor" opacity=".18"/><polyline points="${line}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}
const svIc = b => b ? `<img class="ico" alt="" src="data:image/png;base64,${b}">` : `<span class="ico"></span>`;
function svList(rows, cell, empty, more){
  return `<table class="svl">` + (rows.length ? rows.map(cell).join("") + (more > 0 ? `<tr class="more"><td colspan="2">and ${more} more</td></tr>` : "") : `<tr class="more"><td colspan="2">${empty}</td></tr>`) + `</table>`;
}
function svHtml(d, full){
  const m = d.sm; if (!m) return `<div class="sub">Waiting for the tracker…</div>`;
  const min = m.min || 0, pm = v => min >= 1 ? fmt(v / min) + "/min" : "";
  let lv = "";
  if (m.a && m.b){
    const ups = m.b.level - m.a.level, gained = ups * 100 + m.b.pct - m.a.pct, from = ups ? 0 : m.a.pct;
    lv = `<div class="svLvl"><span>Lv. <b>${m.a.level}</b></span><div class="trk"><i style="left:${from}%;width:${clamp(m.b.pct - from, 0, 100)}%"></i></div><span>Lv. <b>${m.b.level}</b></span><span class="gain ${gained >= 0 ? "pos" : "neg"}">${gained >= 0 ? "+" : "−"}${Math.abs(gained).toFixed(2)}%</span></div>`;
  }
  const pots = m.pots.length ? m.pots.map(p => `<div class="svPot">${svIc(p.ic)}<div><b class="${p.n < 0 ? "neg" : "pos"}">${p.n < 0 ? "−" : "+"}${fmt(Math.abs(p.n))}</b><span>${esc(p.name)}</span></div></div>`).join("") : `<span class="sub">None used yet</span>`;
  const money = `<span>spent</span><b class="neg">−${fmt(m.spent || 0)}</b><span>${pm(m.spent || 0)}</span><span>picked up</span><b class="pos">+${fmt(m.mesos || 0)}</b><span>${pm(m.mesos || 0)}</span><span>loot value</span><b class="pos">+${fmt(m.loot || 0)}</b><span>${pm(m.loot || 0)}</span>`;
  const top = `<div class="svHead"><div><div class="svMap">${esc(m.map || "No map yet")}</div>${m.level || m.job ? `<div class="sub">${m.level ? `Lv. <b>${m.level}</b>` : ""} ${esc(m.job)}</div>` : ""}</div>${m.spawns ? `<div class="sub">${m.spawns} spawns</div>` : ""}</div>
    <div class="svHero"><div class="svK">EXP gained</div><div class="big">${m.exp > 0 ? "+" : ""}${fmt(m.exp || 0)} <small>${min >= 1 ? "in " + hm(min / 60) : ""}</small></div></div>
    <div class="svTiles"><div><b>${min >= 1 ? fmt(m.exp / min) : "-"}</b><span>EXP / min</span></div><div><b>${m.best ? fmt(m.best) : "-"}</b><span>best minute</span></div></div>${lv}`;
  const mid = `<div class="svChart">${svChart(m.perMin)}</div><div class="svPots">${pots}</div><div class="svMoney">${money}</div>`;
  if (!full) return top + mid;
  const lists = `<div class="svCols"><div><div class="svK">Loot</div>${svList(m.items, i => `<tr><td>${svIc(i.ic)}${esc(i.name)}</td><td class="n">×${fmt(i.n)}</td></tr>`, "Nothing yet", m.itemsMore)}</div>
    <div><div class="svK">Monsters killed</div>${svList(m.mobs, x => `<tr><td>${esc(x.name)}</td><td class="n">${fmt(x.n)}</td></tr>`, "None yet", m.mobsMore)}</div></div>`;
  return `<div class="svTwo"><div>${top}</div><div>${mid}${lists}</div></div>`;
}
// the Bag check icons (also inside the EXP card when its "Bag check icons" switch is on)
function bagRow(d, lay, names){
  const B = window.GrindBag, L = B.tabs(Object.fromEntries(Object.entries(d.inv || {}).map(([k, last]) => [k, {last}])), d.runT0, d.t, d.bagEvery, d.on || d.dummy);
  return `<div class="bagrow ${lay}">${L.map(l => `<span class="bagI ${l.stage}${l.pulse ? " pulse" : ""}" role="button" data-bag="${l.k}" style="color:${B.color(l)}" title="${esc(l.name)}: ${l.stage === "idle" ? "starts when you press Start" : l.last ? "read " + Math.round(l.age / 60e3) + " min ago" : "not read yet"}. Click to read it now">${B.ICONS[l.k]}${names ? `<em>${esc(l.name)}</em>` : ""}</span>`).join("")}</div>`;
}
// the Chat blocker (0.2.108): an opaque panel the player cannot see past; the tracker draws its own HP / MP / EXP bars on it from what
// the readers found in the game pixels (HP/MP: readVitalsAny, EXP: the level bar). Nothing here reads the game.
function vbar(cls, label, cur, max, pct, num, stale){
  const f = pct == null ? 0 : clamp(pct, 0, 100);
  return `<div class="vb ${cls}${stale ? " stale" : ""}" title="${esc(label)}"><i style="width:${f.toFixed(1)}%"></i><span class="vl">${esc(label)}</span><span class="vn">${num ? (cur == null ? "—" : cur === "pct" ? pct.toFixed(2) + "%" : fmt(cur) + " / " + fmt(max)) : ""}</span></div>`;
}
const RENDER = {
  blocker(d, id){
    const vt = d.vit || {}, stale = !vt.t || !(d.on || d.dummy),   // a vitals event is sent on change only, so age says nothing; dim when nothing is being read
       num = wv(id, "vnum"), pc = (a) => a && a[1] > 0 ? a[0] / a[1] * 100 : null;
    const bars = [];
    if (wv(id, "vhp")) bars.push(vbar("hp", "HP", vt.hp?.[0] ?? null, vt.hp?.[1], pc(vt.hp), num, stale));
    if (wv(id, "vmp")) bars.push(vbar("mp", "MP", vt.mp?.[0] ?? null, vt.mp?.[1], pc(vt.mp), num, stale));
    if (wv(id, "vex")){ const p = d.st?.pct; bars.push(vbar("xp", d.st?.level != null ? "Lv " + d.st.level : "EXP", p == null ? null : "pct", 0, p ?? null, num, false)) }
    return `<div class="vbars ${wv(id, "vlay")}">${bars.join("")}</div>`;
  },
  simple: (d) => svHtml(d, false),
  focus: (d) => svHtml(d, true),
  status(d, id){
    const sub = wv(id, "sub");
    return `<div class="big" style="font-size:14px;color:var(--ink)"><span class="dot ${d.on ? (d.paused ? "warn" : "ok") : ""}"></span>${esc(d.state || (d.on ? "Tracking" : "Stopped"))}</div>
      ${sub ? `<div class="rows"><div><span>On the clock</span><b>${d.clockMs != null ? runClock(d.clockMs) : d.runT0 && (d.on || d.dummy) ? runClock(d.t - d.runT0) : "-"}</b></div>
      <div><span>Farming</span><b>${d.st ? hm((d.st.activeMin || 0) / 60) : "-"}</b></div></div>` : ""}`;
  },
  exp(d, id){
    const sp = wv(id, "spark"), sub = wv(id, "sub"), s = d.st || {}, next = s.toLevelHrs == null ? "-" : s.toLevelHrs < 1 ? Math.round(s.toLevelHrs * 60) + " min" : s.toLevelHrs.toFixed(1) + " h";
    const a = s.firstBar, b = s.level != null ? {level: s.level, pct: s.pct} : null;
    let lv = "";
    if (a && b && b.pct != null && b.level >= a.level){
      const gained = Math.max(0, (b.level - a.level) * 100 + b.pct - a.pct);
      lv = `<div class="lvbar"><span>Lv <b>${a.level}</b></span><div class="trk" title="Started at Lv ${a.level} ${a.pct}%, now Lv ${b.level} ${b.pct}%"><i style="width:${Math.min(100, Math.max(0, b.pct))}%"></i></div><span>Lv <b>${b.level}</b></span></div>
        <div class="sub pos">+${gained.toFixed(2)}% this run</div>`;
    }
    return `<div class="big">${fmt(s.expHr || 0)}<small> EXP/hr</small></div>
      ${sp ? `<div class="spk">${SPK(d, "exp")}</div>` : ""}
      ${sub ? `<div class="sub">${s.expHr5 != null ? "last 5 min " + fmt(s.expHr5) : "last 5 min —"}</div>
      <div class="rows"><div><span>gained</span><b class="pos">+${fmt(s.exp || 0)}</b></div><div><span>next level</span><b>${next}</b></div></div>` : ""}` + lv
      + (wv(id, "bagi") ? `<div class="bagin">${bagRow(d, "row", false)}</div>` : "");
  },
  kills(d, id){
    const sp = wv(id, "spark"), sub = wv(id, "sub");
    return `<div class="big">${fmt(d.st?.killsHr || 0)}<small> kills/hr</small></div>
      ${sp ? `<div class="spk">${SPK(d, "kills")}</div>` : ""}
      ${sub ? `<div class="rows"><div><span>total</span><b>${fmt(d.st?.kills || 0)}</b></div><div><span>deaths</span><b class="${d.st?.deaths ? "neg" : ""}">${fmt(d.st?.deaths || 0)}</b></div></div>` : ""}`;
  },
  mesos(d, id){
    const sp = wv(id, "spark"), sub = wv(id, "sub");
    return `<div class="big">${fmt(d.st?.mesosHr || 0)}<small> mesos/hr</small></div>
      ${sp ? `<div class="spk">${SPK(d, "mesos")}</div>` : ""}
      ${sub ? `<div class="rows"><div><span>picked up</span><b class="pos">+${fmt(d.st?.mesos || 0)}</b></div><div><span>loot/hr</span><b>${fmt(d.st?.lootHr || 0)}</b></div></div>` : ""}`;
  },
  loot(d, id){
    const feed = (d.feed || []).filter(l => l.kind === "loot"), n = Math.min(feed.length, Math.max(wv(id, "lines"), fitRows(id, 20)));
    const lines = feed.slice(-n).reverse();
    return lines.length ? lines.map(l => `<div class="lr loot"><span>${esc(l.text)}</span></div>`).join("") : `<div class="empty">Nothing yet.</div>`;
  },
  map(d, id){
    const m = d.map || {}, list = m.spawns || [], nm = Math.min(list.length, Math.max(wv(id, "rows"), fitRows(id, 22)));
    const mobs = list.slice(0, nm).map(x => `<div class="mrow"><b>${esc(x.name)}</b><span>${x.n ? "×" + x.n + " · " : ""}Lv ${x.lv} · ${fmt(x.exp)} EXP</span></div>`).join("");
    const resp = (m.respawns || []).map(r => { const due = r.killed ? r.killed + r.sec * 1000 - d.t : null;
      return `<div class="mrow"><b>${esc(r.name)}${r.boss ? " (boss)" : ""}</b><span class="${due != null && due <= 0 ? "pos" : due != null && due <= 120e3 ? "soon" : ""}">${r.killed ? due > 0 ? "back in ~" + respT(due) : "due now" : "every " + respT(r.sec * 1000)}</span></div>` }).join("");
    return `<div class="mapname">${esc(m.name || "No map yet")}</div>`
      + (list.length ? `<div class="sub">${list.reduce((a, x) => a + (x.n || 0), 0)} spawns</div>` + mobs + (list.length > nm ? `<div class="sub dim">and ${list.length - nm} more</div>` : "") : "")
      + (resp ? `<div class="sect">respawns</div>` + resp : "");
  },
  party(d){
    const n = d.st?.party || 1, p = d.party;
    let rows = "";
    if (p?.members?.length) rows = `<div class="sub pos">${fmt(p.expHr || 0)} EXP/hr together</div>` + p.members.slice(0, 6).map(m =>
      `<div class="mrow"><b>${m.you ? "<span class=dim>you</span>" : esc(m.nick || m.job || "member")}</b><span>${m.level ? "Lv " + m.level + " · " : ""}${fmt(m.expHr || 0)}/hr</span></div>`).join("");
    else if (n > 1) rows = `<div class="sub dim">party view off (Settings)</div>`;
    return `<div class="big" style="font-size:16px">${n > 1 ? "Party of " + n : "Solo"}</div>` + rows;
  },
  kpq(d, id){
    const k = d.kpq, sub = wv(id, "sub");
    if (!k) return `<div class="empty">Not in KPQ.</div>`;
    const clock = k.clock ? mss(k.clock.left - (d.t - k.clock.leftT) / 1000) : null;
    return `<div class="big" style="font-size:16px">Round ${k.rounds || "-"}</div>
      ${sub && k.round ? `<div class="sub">this round ${mss((d.t - k.round.t0) / 1000)}</div>` : ""}
      ${sub && k.stage ? `<div class="sub">${esc(k.stage)} stage${k.stageT0 ? " " + mss((d.t - k.stageT0) / 1000) : ""}</div>` : ""}
      ${clock ? `<div class="rows"><div><span>KPQ clock</span><b>${clock}</b></div></div>` : ""}
      ${k.hold ? `<div class="sub dim">paused between rounds</div>` : ""}`;
  },
  stat(d, id){ const t = tokOf(id, TOKENS, "expHr");
    return `<div class="big">${TOKENS[t][1](d)}</div><div class="sub">${esc(TOKENS[t][0])}</div>` },
  bar(d, id){ const t = tokOf(id, BARS, "levelPct"), v = BARS[t][1](d);
    return v == null ? `<div class="empty">Waiting for the EXP bar.</div>`
      : `<div class="lvbar"><span>Lv <b>${d.st?.level ?? "-"}</b></span><div class="trk"><i style="width:${v}%"></i></div><span>${v.toFixed(1)}%</span></div><div class="sub">${esc(BARS[t][0])}</div>` },
  // Bag check (0.2.96): sword / potion / crate, coloured by how stale the tab's last read is (core/bagstale.js). Clicking one
  // asks the tracker window to scan that tab (same as the chips); see the pointerdown handler near the end.
  bag(d, id){ return bagRow(d, wv(id, "bagl"), wv(id, "bagn")) },
  log(d, id){
    // a pinned-tall card shows as many lines as fit (Danny 10-29: growing a card must never leave strange empty space)
    const feed = d.feed || [], n = Math.min(feed.length, Math.max(wv(id, "lines"), fitRows(id, 20)));
    const lines = feed.slice(-n).reverse();
    return lines.length ? lines.map(l => `<div class="lr ${esc(l.kind)}"><time>${clockT(l.t)}</time><span>${esc(l.text)}</span></div>`).join("") : `<div class="empty">Nothing yet.</div>`;
  },
};

// ---- theme: the tracker pushes its current colours, the overlay follows live -------------------------------
const VARS = {bg: "--bg", panel: "--panel", ink: "--ink", muted: "--muted", line: "--line", accent: "--accent", soft: "--accent-soft", on: "--on-accent", leaf: "--leaf", warn: "--warn", bad: "--bad"};
function theme(th){
  const r = document.documentElement.style;
  if (th?.c) for (const [k, v] of Object.entries(VARS)) if (th.c[k]) r.setProperty(v, th.c[k]);
  document.documentElement.style.colorScheme = th?.mode === "light" ? "light" : "dark";
  // the panel style rides with the theme (0.2.92): sk:"elv" re-skins the cards in ElvUI's crisp look, anything else is glass
  document.body.classList.toggle("skin-elv", th?.sk === "elv");
}

// ---- cards: one element per kind, placed in desktop coordinates -------------------------------
// per-widget settings: on, x/y (desktop px), s = scale .5-2, o = opacity .25-1 (WeakAuras' per-region surface, tamed)
function wPos(id){
  const saved = CFG.widgets[id], home = HOME[baseOf(id)] || {on: false, x: 24, y: 24};
  const xy = k => saved && Number.isFinite(+saved[k]) ? +saved[k] : home[k];   // 0 is a real spot (the desk's edge)
  return {on: saved ? saved.on !== false : home.on, x: xy("x"), y: xy("y"), s: wv(id, "s"), o: wv(id, "o")};
}
function mkCard(id){
  const el = document.createElement("section");
  el.className = "ovw"; el.id = "ovw-" + id; el.dataset.w = id; el.dataset.k = baseOf(id);
  el.innerHTML = `<header><i class="gb" hidden></i><span class="t">${esc(wName(id))}</span><button class="x" title="Hide ${esc(wName(id))}" aria-label="Hide ${esc(wName(id))}">×</button></header><div class="b"></div>` +
    // three ways to resize (Danny 10-29: "dragging the corner like we already do, but dragging an edge should make it
    // taller, or longer"): the corner does both axes, the right edge is width only, the bottom edge height only.
    `<i class="rsz" title="Drag to resize (both ways)"></i><i class="rsz-e" title="Drag to make it longer"></i><i class="rsz-s" title="Drag to make it taller"></i>`;
  el.querySelector(".x").onclick = () => { setOn(id, false); if (picked.id === id) pick(null) };
  el.addEventListener("pointerenter", () => { if (CFG.edit && baseOf(id) !== "blocker") el.style.zIndex = ++zTop });
  badge(id);
  return el;
}
function styleCard(el, id){
  const p = wPos(id), v = k => wv(id, k), set = (n, val) => val == null ? el.style.removeProperty(n) : el.style.setProperty(n, val);
  el.style.transform = p.s === 1 ? "" : `scale(${p.s})`;   // transform-origin top left: x/y stay the card's anchor
  el.style.opacity = p.o === 1 ? "" : p.o;
  const [pv, ph] = PADS[v("pad")], W = v("w"), H = v("h");
  el.classList.toggle("sizedW", !!W); el.classList.toggle("sizedH", !!H);   // a pinned box (Danny's strange boxes)
  set("--glass", v("bg") + "%"); set("--blur", v("blur") + "px"); set("--rad", v("rad") + "px"); set("--mw", v("mw") + "px");
  set("--w", W ? W + "px" : null); set("--h", H ? H + "px" : null);
  set("--pv", pv + "px"); set("--ph", ph + "px"); set("--fs", v("fs") === 1 ? null : v("fs"));
  set("--bc", v("brd") === "none" ? "transparent" : v("brd") === "accent" ? "var(--accent)" : null);
  set("--sh", v("shd") ? null : "none");
  set("--accent", v("acc") || null); set("--ink", v("txt") || null);
  el.style.textAlign = v("al") === "left" ? "" : v("al");
  el.classList.toggle("showt", v("ttl"));
  el.classList.toggle("nobg", baseOf(id) === "bag" && !v("bgon"));   // Bag check without its glass card: just the icons
}
const PADS = {compact: [6, 9], normal: [9, 13], roomy: [13, 18]};
// clamp inside the window's own viewport, not the reported desk: the window is the only place a card can live, and on
// some setups (mixed-DPI monitors, Windows nudging a transparent window) the real content area is smaller than the
// union of the displays — trusting the desk is what left cards cut off in a dead strip around the edge (Danny 10-28).
function clampCard(el){
  const r = el.getBoundingClientRect(), w = r.width || 200, h = r.height || 60;
  el.style.left = Math.min(Math.max(0, el.offsetLeft), Math.max(0, Math.floor(innerWidth - w))) + "px";
  el.style.top = Math.min(Math.max(0, el.offsetTop), Math.max(0, Math.floor(innerHeight - h))) + "px";
}
// Cards keep apart (Danny 10-28: Status ran under Mesos, Mesos' "loot/hr 16,9.." was cut off by Kills): numbers grow wider as a
// run goes on, so after every render and every placement the cards are walked top-left to bottom-right and any that overlap
// are nudged — right if there is room, else down — a GAP clear of what is already placed. Only the DISPLAY moves: x/y in
// settings stay where the player put them, so the cards settle back when the numbers shrink. Skipped mid-drag/resize.
const GAP = 8;
function reflow(){
  if (drag || rz) return;
  const all = [...document.querySelectorAll(".ovw")].filter(el => el.isConnected), els = all.filter(el => el.dataset.k !== "blocker");   // the Chat blocker sits under everything: others may overlap it
  for (const el of all){ const id = el.dataset.w; el.style.left = Math.round(wPos(id).x - DESK.x) + "px"; el.style.top = Math.round(wPos(id).y - DESK.y) + "px"; clampCard(el) }
  const rect = el => { const r = el.getBoundingClientRect(); return {l: r.left, t: r.top, r: r.right, b: r.bottom} };
  const placed = [], order = els.map(el => ({el, r: rect(el)})).sort((a, b) => a.r.t - b.r.t || a.r.l - b.r.l);
  for (const o of order){
    for (let n = 0; n < 24; n++){
      let r = rect(o.el);
      const hit = placed.find(p => r.l < p.r + GAP && r.r + GAP > p.l && r.t < p.b + GAP && r.b + GAP > p.t);
      if (!hit) break;
      const dx = hit.r + GAP - r.l, dy = hit.b + GAP - r.t, w = r.r - r.l, h = r.b - r.t;
      const canX = r.l + dx + w <= innerWidth, canY = r.t + dy + h <= innerHeight;
      if (canX && (dx <= dy || !canY)) o.el.style.left = o.el.offsetLeft + dx + "px";
      else if (canY) o.el.style.top = o.el.offsetTop + dy + "px";
      else { o.el.style.left = o.el.offsetLeft - Math.max(0, r.r - hit.l + GAP) + "px"; break }   // no room either way: sit left of it
    }
    placed.push(rect(o.el));
  }
}
function place(){
  for (const id of ids()){
    const el = $("#ovw-" + id); if (!el || !el.isConnected) continue;
    el.style.left = Math.round(wPos(id).x - DESK.x) + "px";
    el.style.top = Math.round(wPos(id).y - DESK.y) + "px";
    styleCard(el, id);
    clampCard(el);
  }
  reflow();
}
function setOn(id, on){
  CFG.widgets[id] = {...(CFG.widgets[id] || HOME[baseOf(id)] || {x: 24, y: 24}), on};
  const el = $("#ovw-" + id);
  if (on && !el?.isConnected){ const c = el || mkCard(id); $("#ovroot").appendChild(c);
    c.style.left = Math.round(wPos(id).x - DESK.x) + "px"; c.style.top = Math.round(wPos(id).y - DESK.y) + "px";
    styleCard(c, id); clampCard(c) }
  else if (!on && el?.isConnected) el.remove();
  syncPanel(); ovSave(); if (on && DATA) apply(DATA); else reflow();
}
function addInst(kind){
  if (!KINDS[kind] || ids().filter(i => INST.test(i)).length >= MAX_INST) return null;
  let n = 1; while (CFG.widgets[kind + "_" + n]) n++;
  const id = kind + "_" + n, h = HOME[kind] || {x: 24, y: 24}, k = ids().length;
  CFG.widgets[id] = {on: true, x: Math.round(DESK.x + 320 + (k % 6) * 36), y: Math.round(DESK.y + 120 + (k % 6) * 36)};
  const c = mkCard(id); $("#ovroot").appendChild(c); place(); pick(id); syncPanel(); ovSave(); if (DATA) apply(DATA);
  return id;
}
function delInst(id){
  if (!INST.test(id)) return;
  delete CFG.widgets[id]; $("#ovw-" + id)?.remove(); if (picked.id === id){ picked.id = null; buildInsp(null) }
  syncPanel(); ovSave(); reflow();
}
function savePos(id){
  const el = $("#ovw-" + id); if (!el) return;
  CFG.widgets[id] = {...(CFG.widgets[id] || {}), x: DESK.x + el.offsetLeft, y: DESK.y + el.offsetTop};
  ovSave();
}
// one setter for every parameter: validate, store (a default is stored as absence, so codes stay small), restyle, re-render, save
function setP(id, k, v){
  const p = PMAP[k], tok = k === "tok";
  if (tok ? !TOK_SETS[baseOf(id)]?.[v] : (!p || (p.kinds && !p.kinds.includes(baseOf(id))))) return;
  const val = tok ? v : okParam(p, v, id), w = {...(CFG.widgets[id] || {})};
  if (!tok && (val === defOf(p, id) || val === "")) delete w[k]; else w[k] = val;
  CFG.widgets[id] = w;
  const el = $("#ovw-" + id);
  if (el){ styleCard(el, id); if (DATA) apply(DATA); clampCard(el); reflow() }
  const sv = document.querySelector(`.wrow[data-w="${id}"] .sv`); if (sv && k === "s") sv.textContent = Math.round(val * 100) + "%";
  syncDetail(id); ovSave();
}
const setS = (id, s) => setP(id, "s", s), setO = (id, o) => setP(id, "o", o);
// assign a card to a group letter (or take it out): the badge updates, the panel row shows the letter, the inspector
// rebuilds so the counts in the options read true
function setGrp(id, g){
  const w = {...(CFG.widgets[id] || {})}; if (g) w.grp = g; else delete w.grp;
  CFG.widgets[id] = w; badge(id); syncPanel(); buildInsp(id); ovSave();
}
// conditions (WeakAuras' idea, one rule per card): watch a number the tracker read off the screen; while it is below/above the
// line the card recolours, pulses or hides. Numbers only ever come from the snapshot (computer vision output).
const CONDV = {expHr: d => d.st?.expHr, mesosHr: d => d.st?.mesosHr, killsHr: d => d.st?.killsHr, lootHr: d => d.st?.lootHr,
  kills: d => d.st?.kills, deaths: d => d.st?.deaths, pct: d => d.st?.pct};
function conds(d){
  for (const el of document.querySelectorAll(".ovw")){ const id = el.dataset.w, k = wv(id, "cv"), val = k !== "none" && CONDV[k] ? CONDV[k](d) : null;
    const met = Number.isFinite(val) && (wv(id, "cop") === "lt" ? val < wv(id, "cn") : val > wv(id, "cn")), act = wv(id, "cact");
    for (const a of ["color", "pulse", "hide"]) el.classList.toggle("cmet-" + a, met && act === a);
    if (met && act === "color") el.style.setProperty("--cc", wv(id, "ccol") || "#ef4444"); else el.style.removeProperty("--cc") }
}
// the "Show when" rule (WeakAuras' load conditions, tamed): a card can hide unless the tracker is running / stopped. Never while editing.
function vis(){
  const on = !!(DATA && (DATA.on || DATA.dummy));
  document.querySelectorAll(".ovw").forEach(el => { const m = wv(el.dataset.w, "show");
    el.classList.toggle("ovhide", !CFG.edit && ((m === "tracking" && !on) || (m === "idle" && on))) });
}
let saveT = null;
const profSnap = () => ({widgets: JSON.parse(JSON.stringify(CFG.widgets)), panel: CFG.panel ? {...CFG.panel} : null});
const ovSave = () => { clearTimeout(saveT); saveT = setTimeout(() => {
  CFG.profiles[CFG.profile] = profSnap();   // the live layout IS the active profile (ElvUI's model): every save mirrors into it
  window.ovhost.settings({overlay: {edit: CFG.edit, widgets: CFG.widgets, snap: CFG.snap, grid: CFG.grid, gsize: CFG.gsize, panel: CFG.panel, insp: CFG.insp,
    profile: CFG.profile, profiles: CFG.profiles}}).catch(() => {});
}, 200) };

// ---- data: re-render every card (a push, or the 1 s tick for the countdowns) -------------------------------
// flow cards (lists) keep their lines at the top and scroll; the rest centre in a pinned-tall box, so growing a card
// never leaves a strange void under the number (Danny 10-29: "never start looking like there's strange empty space")
const FLOW = new Set(["log", "loot", "map"]);
// how many text rows fit in a pinned-height card's body (log/loot/map render to fill it; fitRows says 0 when free)
function fitRows(id, lineH){
  const el = $("#ovw-" + id); if (!el || !el.classList.contains("sizedH")) return 0;
  const head = el.querySelector("header"), cs = getComputedStyle(el);
  const h = (el.offsetHeight || 0) - (head?.offsetHeight || 0) - (parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + 2);
  return Math.max(0, Math.floor(h / lineH));
}
function apply(d){
  DATA = d;
  if (d.th) theme(d.th);
  for (const id of ids()){
    const el = $("#ovw-" + id);
    if (el?.isConnected){ const b = el.querySelector(".b"); b.classList.toggle("flow", FLOW.has(baseOf(id))); b.innerHTML = RENDER[baseOf(id)](d, id); }
  }
  conds(d); vis(); reflow();
  if (bagHit && !document.querySelector(".ovw:hover")){ bagHit = false; window.ovhost.hit(false) }   // the card went away under the mouse
  toastsShow(d.toasts);
}
// the conditions engine's toasts (0.2.78): a glass stack top-right, gone after 6.5 s or when the tracker pulls them;
// the card they belong to pulses three times (WeakAuras' region flash). Never while editing — edit mode is for layout.
const flashed = new Set();
function toastsShow(list){
  const box = $("#ovtoasts"), now = Date.now();
  const live = (Array.isArray(list) ? list : []).filter(x => x && now - x.at < 6500);
  box.classList.toggle("hidden", CFG.edit || !live.length);
  const have = new Set([...box.children].map(el => el.dataset.at));
  for (const x of live){
    if (!have.has(String(x.at))){
      const el = document.createElement("div");
      el.className = "toast " + (x.sev || "info"); el.dataset.at = x.at; el.textContent = x.text;
      box.appendChild(el);
    }
    if (x.w && !flashed.has(x.at) && !CFG.edit){
      flashed.add(x.at); if (flashed.size > 8) flashed.delete(flashed.values().next().value);
      const c = $("#ovw-" + x.w);
      if (c){ c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash"); setTimeout(() => c.classList.remove("flash"), 2400) }
    }
  }
  for (const el of [...box.children]) if (!live.some(x => String(x.at) === el.dataset.at)) el.remove();
}

// ---- the edit panel (was a checkbox strip; now one in-style card): rows with an eye toggle and size steppers, a detail
// strip under the picked row (scale, opacity, x/y, reset), and snap/grid/reset in the footer -------------------------------
const EYE = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8Z"/><circle cx="8" cy="8" r="2.2"/></svg>`;
const EYEOFF = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8Z" opacity=".45"/><path d="M2.5 13.5 13.5 2.5"/></svg>`;
function buildPanel(){
  const p = $("#ovpanel");
  p.innerHTML = `<header id="ovpHead"><span class="t">Overlay edit</span><button class="btn" id="ovDone">Done</button><button class="btn alt" id="ovClose" title="Close the overlay">×</button></header>
    <div class="foot" id="ovBd" hidden><button class="btn alt" id="ovBack" title="Bring the tracker window back and hide the Simple / Focus card">Back to tracker window</button></div>
    <p class="hint">Drag the cards — Shift skips snapping, arrows nudge. The corner grip stretches a card into any box (long, wide, skinny, fat); an edge makes it longer or taller; Ctrl+scroll scales it. Group cards (inspector → Group) to move them together. All saves by itself.</p>
    <div id="ovpRows"></div>
    <div class="foot add"><select id="ovAddKind" title="What to add">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select>
      <button class="btn alt" id="ovAdd" title="Place another card of this kind, with its own spot, size and (for stats) number">Add widget</button></div>
    <div class="foot"><label><input type="checkbox" id="ovSnap"> Snap</label><label><input type="checkbox" id="ovGrid"> Grid</label>
      <select id="ovGsize" title="Grid spacing"><option value="32">32 px</option><option value="64">64 px</option><option value="128">128 px</option></select>
      <button class="rw-all" id="ovReset">Reset layout</button></div>
    <div class="foot prof"><select id="ovProf" title="Layout profile"></select>
      <input id="ovProfName" maxlength="24" placeholder="new name" title="Type a name and press Save to copy this layout into it">
      <button class="btn alt" id="ovProfSave" title="Copy this layout into the name on the left">Save</button>
      <button class="btn alt" id="ovProfDel" title="Delete this profile">Del</button>
      <button class="btn alt" id="ovProfShare" title="Export or import this layout as a code">Share</button></div>
    <div id="ovShare" class="hidden"><input id="ovShareIn" spellcheck="false" title="The whole layout as a code — copy it somewhere safe, or paste one and Apply">
      <div class="shBtns"><button class="btn alt" id="ovShareCopy">Copy</button><button class="btn" id="ovShareApply">Apply code</button></div></div>`;
  $("#ovDone").onclick = () => window.ovhost.done();
  $("#ovClose").onclick = () => window.ovhost.close();
  $("#ovBack").onclick = () => { for (const k of ["simple", "focus"]) if (wPos(k).on) setOn(k, false); window.ovhost.showMain?.() };
  $("#ovAdd").onclick = () => addInst($("#ovAddKind").value);
  $("#ovSnap").onchange = e => { CFG.snap = e.target.checked; ovSave() };
  $("#ovGrid").onchange = e => { CFG.grid = e.target.checked; gridShow() ; ovSave() };
  $("#ovGsize").onchange = e => { CFG.gsize = +e.target.value || 64; gridShow(); ovSave() };
  $("#ovReset").onclick = () => { const b = $("#ovReset");
    if (b.dataset.arm){ delete b.dataset.arm; b.textContent = "Reset layout"; resetAll() }
    else { b.dataset.arm = "1"; b.textContent = "Reset everything?"; setTimeout(() => { if (b.isConnected){ delete b.dataset.arm; b.textContent = "Reset layout" } }, 2600) } };
  profUi();
  $("#ovProf").onchange = e => profApply(e.target.value);
  $("#ovProfSave").onclick = () => { const n = $("#ovProfName").value.trim().slice(0, 24);
    if (!n) return;
    CFG.profiles[n] = profSnap(); CFG.profile = n; profUi(); ovSave(); $("#ovProfName").value = "" };
  $("#ovProfDel").onclick = () => { const b = $("#ovProfDel");
    if (!b.dataset.arm){ b.dataset.arm = "1"; b.textContent = "Delete?"; setTimeout(() => { if (b.isConnected && b.dataset.arm){ delete b.dataset.arm; b.textContent = "Del" } }, 2600); return }
    delete b.dataset.arm; b.textContent = "Del";
    const names = Object.keys(CFG.profiles); if (names.length <= 1) return;   // the last profile stays
    const gone = CFG.profile; delete CFG.profiles[gone];
    profApply(names.find(n => n !== gone) || names[0]) };
  $("#ovProfShare").onclick = () => { const sh = $("#ovShare");
    sh.classList.toggle("hidden");
    if (!sh.classList.contains("hidden")) $("#ovShareIn").value = profCode() };
  $("#ovShareCopy").onclick = () => { const i = $("#ovShareIn"); i.focus(); i.select(); navigator.clipboard?.writeText(i.value).catch(() => {}) };
  $("#ovShareApply").onclick = profImport;
  // the panel moves by its header, like any card; its spot saves too
  let pd = null;
  p.querySelector("#ovpHead").addEventListener("pointerdown", e => {
    if (e.target.closest("button") || e.button) return;
    const r = p.getBoundingClientRect();   // visual rect: the panel rests at left:50% + translateX(-50%), so offsetLeft lies
    pd = {dx: e.clientX - r.left, dy: e.clientY - r.top};
    p.setPointerCapture(e.pointerId); e.preventDefault();
  });
  p.addEventListener("pointermove", e => { if (!pd) return;
    p.style.left = clamp(e.clientX - pd.dx, 0, Math.max(0, innerWidth - p.offsetWidth)) + "px";
    p.style.top = clamp(e.clientY - pd.dy, 0, Math.max(0, innerHeight - p.offsetHeight)) + "px";
    p.style.transform = "none"; p.style.right = "auto" });
  p.addEventListener("pointerup", () => { if (!pd) return; pd = null;
    CFG.panel = {x: DESK.x + p.offsetLeft, y: DESK.y + p.offsetTop}; ovSave() });
  syncPanel();
}
function syncPanel(){
  const rows = $("#ovpRows"); if (!rows) return;
  const bd = $("#ovBd"); if (bd) bd.hidden = !(wPos("simple").on || wPos("focus").on);
  rows.innerHTML = ids().map(id => { const name = wName(id), p = wPos(id), inst = INST.test(id), g = grpOf(id);
    return `<div class="wrow${p.on ? "" : " off"}${picked.id === id ? " sel" : ""}" data-w="${id}">
      <button class="eye${p.on ? "" : " off"}" title="${p.on ? "Hide" : "Show"} ${esc(name)}">${p.on ? EYE : EYEOFF}</button>
      <button class="nm" title="Pick ${esc(name)}">${esc(name)}</button>${g ? `<span class="wgb" title="Group ${g}: these cards move together">${g}</span>` : ""}
      <button class="st" data-d="-1" title="Smaller">−</button><span class="sv">${Math.round(p.s * 100)}%</span><button class="st" data-d="1" title="Bigger">+</button>${inst ? `<button class="st del" title="Remove ${esc(name)}">×</button>` : ""}
    </div>`; }).join("");
  rows.querySelectorAll(".wrow").forEach(row => {
    const id = row.dataset.w;
    row.querySelector(".eye").onclick = () => setOn(id, !wPos(id).on);
    row.querySelector(".del")?.addEventListener("click", () => delInst(id));
    row.querySelector(".nm").onclick = () => pick(picked.id === id ? null : id);
    row.querySelectorAll(".st[data-d]").forEach(b => b.onclick = () => setS(id, wPos(id).s + .05 * +b.dataset.d));
    row.onpointerenter = () => { const el = $("#ovw-" + id); document.body.classList.add("dim");
      if (el) el.classList.add("spot") };
    row.onpointerleave = () => { document.body.classList.remove("dim");
      document.querySelectorAll(".ovw.spot").forEach(el => el.classList.remove("spot")) };
  });
  const snap = $("#ovSnap"); if (snap) snap.checked = CFG.snap;
  const grid = $("#ovGrid"); if (grid) grid.checked = CFG.grid;
  const gs = $("#ovGsize"); if (gs) gs.value = String(CFG.gsize);
}
// ---- the per-module inspector: its own pop-up (not part of the main panel), opened by picking a card --------------------
const insp = {id: null};
function paramRow(p, id){
  const v = wv(id, p.k), id2 = "in-" + p.k;
  if (p.t === "r") return `<label><b>${p.lab}</b><input type="range" id="${id2}" data-k="${p.k}" min="${p.min * (p.u || 1)}" max="${p.max * (p.u || 1)}" step="${p.step * (p.u || 1)}" value="${v * (p.u || 1)}"><span class="pv">${p.f(v * (p.u || 1))}</span></label>`;
  if (p.t === "s") return `<label><b>${p.lab}</b><select data-k="${p.k}">${Object.entries(p.opts).map(([k, n]) => `<option value="${k}"${k === v ? " selected" : ""}>${n}</option>`).join("")}</select></label>`;
  if (p.t === "n") return `<label><b>${p.lab}</b><input type="number" data-k="${p.k}" min="${p.min}" max="${p.max}" step="any" placeholder="${p.ph || ""}" value="${v ?? ""}"></label>`;
  if (p.t === "b") return `<label><b>${p.lab}</b><input type="checkbox" data-k="${p.k}"${v ? " checked" : ""}></label>`;
  return `<label><b>${p.lab}</b><input type="color" data-k="${p.k}" value="${v || "#a78bfa"}"><button class="clr" data-clr="${p.k}" title="Follow the tracker's theme again">Theme</button></label>`;
}
function buildInsp(id){
  const box = $("#ovinsp"); if (!box) return;
  if (!id || !CFG.edit){ insp.id = null; box.classList.add("hidden"); box.innerHTML = ""; return }
  const base = baseOf(id), inst = INST.test(id), name = wName(id), secs = {};
  for (const p of PARAMS) if (!p.kinds || p.kinds.includes(base)) (secs[p.sec] = secs[p.sec] || []).push(p);
  const tokSet = TOK_SETS[base], tokKey = tokSet ? tokOf(id, tokSet, Object.keys(tokSet)[0]) : null;
  const was = box.scrollTop;
  box.innerHTML = `<header id="ovinHead"><span class="t">${esc(name)}</span><button class="btn" id="ovinClose" title="Close (the card stays)">×</button></header>
    <div class="wdet open" data-w="${id}">
      ${tokSet ? `<h4>Shows</h4><label><b>Value</b><select data-k="tok">${Object.entries(tokSet).map(([k, v]) => `<option value="${k}"${tokKey === k ? " selected" : ""}>${esc(v[0])}</option>`).join("")}</select></label>` : ""}
      ${Object.entries(secs).map(([sec, ps]) => `<h4>${sec}</h4>${ps.map(p => paramRow(p, id)).join("")}`).join("")}
      <h4>Position</h4><div class="xy">x <input type="number" step="1" data-k="x"> y <input type="number" step="1" data-k="y"></div>
      <label><b>Group</b><select data-k="grp" title="Cards sharing a letter move together (drag or nudge one, the letter follows)"><option value="">None — moves alone</option>${GRPS.split("").map(l => `<option value="${l}"${grpOf(id) === l ? " selected" : ""}>${l}${grpCount(l) ? ` · ${grpCount(l)} card${grpCount(l) === 1 ? "" : "s"}` : ""}</option>`).join("")}</select></label>
      <div class="acts"><button data-a="reset" title="Back to the default look and spot">Reset ${esc(name)}</button><button data-a="copy" title="Give every card this card's look (size, glass, colours)">Copy look to all</button><button data-a="dup">Duplicate</button>${inst ? `<button data-a="del" class="danger">Remove</button>` : ""}</div>
    </div>`;
  const first = insp.id !== id; insp.id = id; box.classList.remove("hidden"); box.scrollTop = first ? 0 : was;
  const det = box.querySelector(".wdet");
  const live = e => { const k = e.target.dataset.k; if (!k) return; const el = e.target;
    if (k === "x" || k === "y"){ const c = $("#ovw-" + id); if (!c) return; c.style[k === "x" ? "left" : "top"] = (Math.round(+el.value || 0) - DESK[k]) + "px"; clampCard(c); savePos(id); return }
    if (k === "grp"){ setGrp(id, el.value || null); return }
    if (k === "tok"){ setP(id, "tok", el.value); return }
    const p = PMAP[k]; if (!p) return;
    const raw = p.t === "b" ? el.checked : p.t === "r" ? +el.value / (p.u || 1) : el.value;
    setP(id, k, raw);
    const pv = el.parentElement.querySelector(".pv"); if (pv && p.t === "r") pv.textContent = p.f(wv(id, k) * (p.u || 1)) };
  det.addEventListener("input", e => { if (e.target.type === "range" || e.target.type === "color") live(e) });
  det.addEventListener("change", e => { if (e.target.type !== "range" && e.target.type !== "color") live(e) });
  det.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.clr){ setP(id, b.dataset.clr, ""); buildInsp(id); return }
    const a = b.dataset.a; if (!a) return;
    if (a === "reset"){ const on = wPos(id).on, home = HOME[baseOf(id)] || {x: 24, y: 24}; CFG.widgets[id] = {...home, on: INST.test(id) ? true : on}; const el = $("#ovw-" + id);
      if (el){ el.style.left = home.x - DESK.x + "px"; el.style.top = home.y - DESK.y + "px"; styleCard(el, id); clampCard(el) }
      if (DATA) apply(DATA); syncPanel(); buildInsp(id); ovSave() }
    else if (a === "copy"){ const look = PARAMS.filter(p => !p.kinds && ["Size & fit", "Look"].includes(p.sec)).map(p => p.k), src = CFG.widgets[id] || {};
      for (const other of ids()) if (other !== id){ const w = {...(CFG.widgets[other] || {})};
        for (const k of look){ if (src[k] === undefined) delete w[k]; else w[k] = src[k] }
        CFG.widgets[other] = w; const el = $("#ovw-" + other); if (el) styleCard(el, other) }
      if (DATA) apply(DATA); place(); syncPanel(); ovSave() }
    else if (a === "dup"){ const n = addInst(baseOf(id)); if (n){ const src = CFG.widgets[id] || {}, w = {...src}; delete w.x; delete w.y; w.on = true;
      CFG.widgets[n] = {...CFG.widgets[n], ...w, x: (+CFG.widgets[n].x || 0), y: (+CFG.widgets[n].y || 0)}; const el = $("#ovw-" + n); if (el) styleCard(el, n); if (DATA) apply(DATA); place(); ovSave() } }
    else if (a === "del") delInst(id) });
  box.querySelector("#ovinClose").onclick = () => pick(null);
  // placed beside the main panel the first time; after that wherever the player dragged it (remembered)
  if (first){ const pn = $("#ovpanel").getBoundingClientRect(), w = box.offsetWidth || 286;
    let x = CFG.insp && Number.isFinite(+CFG.insp.x) ? CFG.insp.x - DESK.x : (pn.right + 10 + w <= innerWidth ? pn.right + 10 : pn.left - w - 10), y = CFG.insp && Number.isFinite(+CFG.insp.y) ? CFG.insp.y - DESK.y : pn.top;
    box.style.left = clamp(x, 0, Math.max(0, innerWidth - w)) + "px"; box.style.top = clamp(y, 0, Math.max(0, innerHeight - box.offsetHeight)) + "px" }
  syncDetail(id);
}
(function(){ const box = $("#ovinsp"); let d = null;
  box.addEventListener("pointerdown", e => { if (!e.target.closest("#ovinHead") || e.target.closest("button") || e.button) return;
    const r = box.getBoundingClientRect(); d = {dx: e.clientX - r.left, dy: e.clientY - r.top}; box.setPointerCapture(e.pointerId); e.preventDefault() });
  box.addEventListener("pointermove", e => { if (!d) return;
    box.style.left = clamp(e.clientX - d.dx, 0, Math.max(0, innerWidth - box.offsetWidth)) + "px"; box.style.top = clamp(e.clientY - d.dy, 0, Math.max(0, innerHeight - box.offsetHeight)) + "px" });
  box.addEventListener("pointerup", () => { if (!d) return; d = null; CFG.insp = {x: DESK.x + box.offsetLeft, y: DESK.y + box.offsetTop}; ovSave() }) })();
function syncDetail(id){
  const det = document.querySelector(`#ovinsp .wdet[data-w="${id}"]`), el = $("#ovw-" + id);
  if (!det || !el) return;
  for (const inp of det.querySelectorAll("[data-k]")){ const k = inp.dataset.k, p = PMAP[k];
    if (k === "x") inp.value = Math.round(DESK.x + el.offsetLeft); else if (k === "y") inp.value = Math.round(DESK.y + el.offsetTop);
    else if (p && p.t === "r" && document.activeElement !== inp){ inp.value = wv(id, k) * (p.u || 1); const pv = inp.parentElement.querySelector(".pv"); if (pv) pv.textContent = p.f(wv(id, k) * (p.u || 1)) } }
}
function pick(id){
  picked.id = id;
  document.querySelectorAll(".ovw.sel").forEach(el => el.classList.remove("sel"));
  if (id){ $("#ovw-" + id)?.classList.add("sel"); $("#ovw-" + id)?.style.setProperty("z-index", ++zTop) }
  syncPanel();
  if (insp.id !== id) buildInsp(id); else syncDetail(id);
}
function resetAll(){
  CFG.widgets = {};
  document.querySelectorAll(".ovw").forEach(el => el.remove());
  for (const id of Object.keys(KINDS)) if ((HOME[id] || {}).on) $("#ovroot").appendChild(mkCard(id));
  pick(null); place(); syncPanel(); ovSave();
}
// the grid is an edit-mode affordance (ElvUI draws its grid only while anchors are unlocked): the checkbox is the
// preference and survives Done, but the lines only render while editing — locked play never sees them (Danny 10-28:
// "the grid is only supposed to be active during edit mode. why is it permanently active?")
function gridShow(){
  const g = $("#ovgrid");
  g.classList.toggle("hidden", !CFG.grid || !CFG.edit);
  g.style.setProperty("--gs", CFG.gsize + "px");
}

// ---- layout profiles (0.2.79, ElvUI's profiles + WeakAuras' export ritual): named snapshots of the cards; the live
// layout is the active profile and mirrors on every save, switching loads the snapshot back out, and Share hands you a
// versioned code string to paste elsewhere (Apply reads one back, validating every widget). -------------------------------
const profCode = () => "OVL1." + btoa(JSON.stringify({widgets: CFG.widgets, panel: CFG.panel}));
function profCards(){
  const live = new Set(ids().filter(id => wPos(id).on));
  document.querySelectorAll(".ovw").forEach(el => { if (!live.has(el.dataset.w)) el.remove() });
  for (const id of live) if (!$("#ovw-" + id)?.isConnected) $("#ovroot").appendChild(mkCard(id));
}
function profApply(name){
  const p = CFG.profiles[name]; if (!p) return;
  CFG.profile = name;
  CFG.widgets = JSON.parse(JSON.stringify(p.widgets || {}));
  CFG.panel = p.panel ? {...p.panel} : null;
  profCards(); pick(null); place(); syncPanel(); profUi(); ovSave();
}
function profUi(){
  const sel = $("#ovProf"); if (!sel) return;
  sel.innerHTML = Object.keys(CFG.profiles).sort().map(n => `<option${n === CFG.profile ? " selected" : ""}>${esc(n)}</option>`).join("");
}
function profImport(){
  try {
    const v = $("#ovShareIn").value.trim();
    if (!v.startsWith("OVL1.")) throw new Error("prefix");
    const o = JSON.parse(atob(v.slice(5)));
    if (!o || typeof o.widgets !== "object" || !o.widgets) throw new Error("shape");
    const clean = {};
    let inst = 0;
    for (const id of Object.keys(o.widgets)){ const w = o.widgets[id];
      if (!validId(id) || !w || typeof w !== "object" || (INST.test(id) && ++inst > MAX_INST)) continue;
      clean[id] = {on: w.on !== false, x: Math.round(+w.x || 0), y: Math.round(+w.y || 0), ...cleanParams(id, w), ...(GRPS.includes(w.grp) ? {grp: w.grp} : {})} }
    CFG.widgets = clean;
    if (o.panel && Number.isFinite(+o.panel.x)) CFG.panel = {x: Math.round(+o.panel.x), y: Math.round(+o.panel.y)};
    profCards(); pick(null); place(); syncPanel(); ovSave();
    return true;
  } catch { $("#ovShareIn").value = "that code didn't read — paste the whole OVL1. line"; return false }
}

// ---- dragging + snapping (edit mode only): ElvUI's sticky snap — 15 px to the screen edges/centre or another card's
// edges/centre on each axis, and a card's candidates only count when it really sits beside the moving card (they
// overlap on the other axis, like LibSimpleSticky) — a card half a screen away can't yank the drag sideways. Shift skips.
// A lock, once taken, holds until the drag clearly leaves it (SNAP_BRK > SNAP_PX): scooting a card flush against its
// neighbour no longer squeezes it out like a wet bar of soap (Danny 10-29), the snap works with you, not against you.
const SNAP_PX = 15, SNAP_BRK = 26;
const guides = {v: $("#ovgv"), h: $("#ovgh")};
function guide(kind, at){
  const el = guides[kind]; if (at == null){ el.classList.add("hidden"); return }
  el.classList.remove("hidden");
  if (kind === "v") el.style.left = Math.round(at) + "px"; else el.style.top = Math.round(at) + "px";
}
function hideGuides(){ guide("v", null); guide("h", null) }
function magnet(L, T, W, H, skipId){
  const tol = 8;   // near-overlap still counts: rows of cards rarely sit pixel-exact
  const xs = [0, innerWidth / 2, innerWidth], ys = [0, innerHeight / 2, innerHeight];
  for (const el of document.querySelectorAll(".ovw")) if (el.dataset.w !== skipId){
    const r = el.getBoundingClientRect();
    if (r.top - tol < T + H && r.bottom + tol > T) xs.push(r.left, r.left + r.width / 2, r.left + r.width);
    if (r.left - tol < L + W && r.right + tol > L) ys.push(r.top, r.top + r.height / 2, r.top + r.height);
  }
  const best = (card, cands) => { let b = null;
    for (const c of card) for (const t of cands){ const d = t - c;
      if (Math.abs(d) <= SNAP_PX && (!b || Math.abs(d) < Math.abs(b.d))) b = {d, t} }
    return b };
  const bx = best([L, L + W / 2, L + W], xs), by = best([T, T + H / 2, T + H], ys);
  return {L: bx ? L + bx.d : null, T: by ? T + by.d : null, v: bx?.t, h: by?.t};
}
let drag = null, rz = null;
// live readout while moving (0.2.92, ElvUI's movers say where they are): a tiny chip over the card with desktop pixels —
// the same numbers the panel's x/y inputs keep — or the size % while resizing. Gone the moment you let go.
let xyChip = null, xyT = null;
function chip(text, card){
  if (!CFG.edit) return;
  if (!xyChip){ xyChip = document.createElement("div"); xyChip.id = "ovxy"; xyChip.className = "hidden"; document.body.appendChild(xyChip) }
  clearTimeout(xyT);
  xyChip.textContent = text;
  xyChip.classList.remove("hidden");
  const r = card.getBoundingClientRect();
  xyChip.style.left = clamp(r.left, 4, Math.max(4, innerWidth - xyChip.offsetWidth - 4)) + "px";
  xyChip.style.top = Math.max(4, r.top - xyChip.offsetHeight - 6) + "px";
}
function chipHide(){ clearTimeout(xyT); xyChip?.classList.add("hidden") }
// bag icons: the window is click-through, so while the mouse is over an icon it asks main.js to catch clicks (ov-hit), and
// hands them back the moment it leaves. A click asks the tracker window to scan that tab. Never while editing (edit
// mode is for layout, and the whole window already takes the mouse).
let bagHit = false;
const bagCard = el => !!el?.closest?.(".ovw")?.querySelector("[data-bag]");   // any card showing bag icons (Bag check, or EXP with the switch on)
addEventListener("mousemove", e => {
  const on = !CFG.edit && bagCard(e.target);   // the whole Bag check card takes the mouse, not only the icons
  if (on !== bagHit){ bagHit = on; window.ovhost.hit(on) }
});
addEventListener("pointerdown", e => {
  const b = !CFG.edit && !e.button && e.target.closest?.("[data-bag]");
  if (b) window.ovhost.bag(b.dataset.bag);
});
addEventListener("pointerdown", e => {
  if (!CFG.edit || e.button) return;
  const card = e.target.closest?.(".ovw");
  if (card){
    if (e.target.closest("button")) return;
    const hz = e.target.closest(".rsz, .rsz-e, .rsz-s");
    if (hz){
      // three resize handles (Danny 10-29): the corner free-resizes (each axis joins in once the drag means it), the
      // right edge is width only (longer), the bottom edge height only (taller). offsetWidth/Height ignore the scale
      // transform, and the delta is divided by the scale so the edge tracks the cursor exactly.
      const mode = hz.classList.contains("rsz-e") ? "w" : hz.classList.contains("rsz-s") ? "h" : "both";
      rz = {id: card.dataset.w, card, px0: e.clientX, py0: e.clientY, w0: card.offsetWidth, h0: card.offsetHeight,
        s0: wPos(card.dataset.w).s, both: mode === "both", mx: mode === "w", my: mode === "h"};
      card.setPointerCapture(e.pointerId);
    } else {
      // a grouped card takes its letter along (Danny 10-29: groups move together): every mate keeps its offset from the
      // card at pickup and rides the same delta
      const g = grpOf(card.dataset.w);
      drag = {id: card.dataset.w, dx: e.clientX - card.offsetLeft, dy: e.clientY - card.offsetTop, card, snap: null,
        mates: g ? grpIds(g).filter(x => x !== card.dataset.w).map(mid => { const el = $("#ovw-" + mid);
          return el ? {id: mid, el, dx: el.offsetLeft - card.offsetLeft, dy: el.offsetTop - card.offsetTop} : null }).filter(Boolean) : []};
      card.setPointerCapture(e.pointerId); card.classList.add("moving");
    }
    pick(card.dataset.w);
    e.preventDefault();
  } else if (!e.target.closest("#ovpanel") && !e.target.closest("#ovinsp")) pick(null);
});
addEventListener("pointermove", e => {
  if (rz){
    const dx = e.clientX - rz.px0, dy = e.clientY - rz.py0;
    if (rz.both){ if (!rz.mx && Math.abs(dx) > 2) rz.mx = true; if (!rz.my && Math.abs(dy) > 2) rz.my = true }   // corner: one axis at a time, once the drag means it
    if (rz.mx) setP(rz.id, "w", clamp(Math.round(rz.w0 + dx / rz.s0), 60, 2000));
    if (rz.my) setP(rz.id, "h", clamp(Math.round(rz.h0 + dy / rz.s0), 40, 2000));
    chip(rz.card.offsetWidth + " × " + rz.card.offsetHeight + " px", rz.card);
    return;
  }
  if (!drag) return;
  let L = Math.round(e.clientX - drag.dx), T = Math.round(e.clientY - drag.dy);
  const r = drag.card.getBoundingClientRect(), free = e.shiftKey;
  if (!free){
    if (CFG.grid){ L = Math.round(L / CFG.gsize) * CFG.gsize; T = Math.round(T / CFG.gsize) * CFG.gsize }
    if (CFG.snap){
      // the snap lock: each axis keeps its engaged target until the drag moves SNAP_BRK past it, so a flush pair
      // survives the pointer pushing on (no more slip), and re-arms from magnet() once you're clearly moving again
      const hold = drag.snap, keep = (t, raw) => t != null && Math.abs(raw - t) <= SNAP_BRK;
      if (!keep(hold?.x, L) || !keep(hold?.y, T)){
        const s = magnet(L, T, r.width, r.height, drag.id);
        drag.snap = {x: keep(hold?.x, L) ? hold.x : s.L, y: keep(hold?.y, T) ? hold.y : s.T,
          v: keep(hold?.x, L) ? hold.v : s.v, h: keep(hold?.y, T) ? hold.h : s.h};
      }
      if (drag.snap.x != null){ L = drag.snap.x; guide("v", drag.snap.v) } else guide("v", null);
      if (drag.snap.y != null){ T = drag.snap.y; guide("h", drag.snap.h) } else guide("h", null);
    }
    else hideGuides();
  } else hideGuides();
  drag.card.style.left = L + "px";
  drag.card.style.top = T + "px";
  for (const m of drag.mates){ m.el.style.left = (L + m.dx) + "px"; m.el.style.top = (T + m.dy) + "px" }   // the letter moves with its card
  chip(Math.round(DESK.x + L) + ", " + Math.round(DESK.y + T), drag.card);
  syncDetail(drag.id);
});
addEventListener("pointerup", () => {
  chipHide();
  if (rz){ const c = rz.card; rz = null; clampCard(c); reflow(); return }   // a grown box can hang past an edge
  if (!drag) return;
  const {card, id, mates} = drag; drag = null;
  card.classList.remove("moving");
  hideGuides();
  clampCard(card);
  savePos(id);
  for (const m of mates){ clampCard(m.el); savePos(m.id) }   // the whole letter lands where the drag left it
  reflow();
});
// Ctrl+scroll resizes the hovered card (WeakAuras' scale slider, at the pointer)
addEventListener("wheel", e => {
  if (!CFG.edit || !e.ctrlKey) return;
  const card = e.target.closest?.(".ovw"); if (!card) return;
  e.preventDefault();
  setS(card.dataset.w, wPos(card.dataset.w).s + (e.deltaY < 0 ? .05 : -.05));
}, {passive: false});
// arrows nudge the picked card (ElvUI's nudge panel: 1 px, Shift = 10); Esc = Done
addEventListener("keydown", e => {
  if (!CFG.edit || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName || "")) return;
  if (e.key === "Escape"){ window.ovhost.done(); return }
  if (!picked.id) return;
  const d = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]}[e.key];
  if (!d) return;
  const step = e.shiftKey ? 10 : 1, el = $("#ovw-" + picked.id); if (!el) return;
  el.style.left = el.offsetLeft + d[0] * step + "px";
  el.style.top = el.offsetTop + d[1] * step + "px";
  clampCard(el); savePos(picked.id);
  for (const mid of grpIds(grpOf(picked.id))) if (mid !== picked.id){ const m = $("#ovw-" + mid);   // nudge the letter, not just the card
    if (m){ m.style.left = m.offsetLeft + d[0] * step + "px"; m.style.top = m.offsetTop + d[1] * step + "px"; clampCard(m); savePos(mid) } }
  syncDetail(picked.id);
  chip(Math.round(DESK.x + el.offsetLeft) + ", " + Math.round(DESK.y + el.offsetTop), el);
  xyT = setTimeout(chipHide, 900);   // nudges end from the keyboard: the chip lingers a beat, then leaves on its own
  e.preventDefault();
});

// ---- boot -------------------------------
(async () => {
  try {
    const st = await window.ovhost.state();
    CFG = {edit: st.edit !== false, widgets: st.widgets && typeof st.widgets === "object" ? st.widgets : {},
      snap: st.snap !== false, grid: st.grid === true, gsize: [32, 64, 128].includes(+st.gsize) ? +st.gsize : 64, panel: st.panel || null, insp: st.insp && Number.isFinite(+st.insp.x) ? {x: +st.insp.x, y: +st.insp.y} : null,
      profile: typeof st.profile === "string" && st.profile ? st.profile : "Default",
      profiles: st.profiles && typeof st.profiles === "object" ? st.profiles : null};
    if (st.desk?.width) DESK = st.desk;
    BD = st.bd || null;
  } catch {}
  // profiles: the live layout is the truth, so the active profile starts as a mirror of it (first boot makes Default)
  if (!CFG.profiles || typeof CFG.profiles !== "object" || !CFG.profiles[CFG.profile])
    CFG.profiles = {[CFG.profile]: profSnap()};
  CFG.profiles[CFG.profile] = profSnap();
  for (const id of ids()) if (wPos(id).on) $("#ovroot").appendChild(mkCard(id));
  buildPanel();
  gridShow();
  document.body.classList.toggle("edit", CFG.edit);
  document.body.classList.toggle("locked", !CFG.edit);
  $("#ovpanel").classList.toggle("hidden", !CFG.edit);
  if (CFG.panel && Number.isFinite(+CFG.panel.x)){
    const p = $("#ovpanel");
    p.style.transform = "none"; p.style.right = "auto";
    p.style.left = clamp(CFG.panel.x - DESK.x, 0, Math.max(0, innerWidth - p.offsetWidth || 0)) + "px";
    p.style.top = clamp(CFG.panel.y - DESK.y, 0, Math.max(0, innerHeight - p.offsetHeight || 0)) + "px";
  }
  place();
  window.ovhost.onData(apply);
  window.ovhost.onMode(on => {
    CFG.edit = !!on;
    document.body.classList.toggle("edit", CFG.edit);
    document.body.classList.toggle("locked", !CFG.edit);
    $("#ovpanel").classList.toggle("hidden", !CFG.edit);
    if (!CFG.edit){ hideGuides(); pick(null); buildInsp(null); chipHide() }
    gridShow();   // the grid follows edit mode: locked hides it, editing brings it back if the preference says so
    toastsShow(DATA ? DATA.toasts : []);   // toasts too: hidden at once while editing, back when the push resumes
    place(); vis(); if (!CFG.edit) reflow(); ovSave();
  });
  // borderless (main.js): the tracker window stepped aside; the view it was showing becomes a card. A card placed before keeps its spot
  const bdCard = b => {
    if (!b || !HOME[b.kind] || !["simple", "focus"].includes(b.kind)) return;
    const w = CFG.widgets[b.kind], placed = w && Number.isFinite(+w.x);
    // first time: the card IS the window's content — no glass, border, shadow or blur, only the text over the game
    if (!placed && Number.isFinite(+b.x) && Number.isFinite(+b.y)) CFG.widgets[b.kind] = {bg: 0, blur: 0, brd: "none", shd: false, ...(w || {}), x: Math.round(b.x), y: Math.round(b.y), ...(Number.isFinite(+b.mw) && !w?.mw ? {mw: clamp(Math.round(+b.mw), 160, 900)} : {})};
    for (const k of ["simple", "focus"]) if (k !== b.kind && wPos(k).on) setOn(k, false);
    setOn(b.kind, true); place();
    const el = $("#ovw-" + b.kind); if (el){ el.classList.add("bdIn"); setTimeout(() => el.classList.remove("bdIn"), 450) }   // fades in as the window fades out
  };
  window.ovhost.onBorderless?.(bdCard);
  if (BD) bdCard(BD);   // the overlay was opened by Borderless: its first card request rode in with the state
  window.ovhost.onScreens(d => { if (d?.width){ DESK = d; place() } });
  setInterval(() => { if (DATA) apply({...DATA, t: Date.now()}) }, 1000);   // the countdowns and clocks tick between pushes
})();
