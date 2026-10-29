// Tracker window, History: goal, filters, maps, personal bests, compare up to 6 runs, details, rename, delete, level-up log, last 7 days (maths in core/history.js; renderer.js is split in load order, all share one global scope)
// goal: "next" (the default: the level after the one you're on), a typed level, or "off"
const goalOf = () => settings.goal === "off" ? 0 : +settings.goal >= 2 ? +settings.goal : "next";
function goalUi(){ const g = goalOf(); $("#goalNext").setAttribute("aria-pressed", String(g === "next")); $("#goalOff").setAttribute("aria-pressed", String(g === 0));
  $("#goal").value = typeof g === "number" && g ? g : "" }
// "I only buy meat and lemons": Red/Orange/White/Blue Potions are drops or quest rewards, so using them costs nothing
const FREE_POTS = ["2000000", "2000007", "2000001", "2000002", "2000003", "2000008"];
const freeIds = () => settings.meatOnly ? FREE_POTS : [];
// "Dropped potions are free" switch (was the "I only buy meat and lemons" button): the colour potions cost nothing
function meatUi(){ $("#meatOnly").checked = !!settings.meatOnly }
$("#meatOnly").onchange = () => host.settings({meatOnly: $("#meatOnly").checked}).then(s => { settings = s; session?.setFree(freeIds()); meatUi(); if (session) render() });
const setGoal = v => host.settings({goal: v}).then(s => { settings = s; session?.setGoal(goalOf()); goalUi(); if (session) render(); if (typeof etaDraw === "function") etaDraw() });
$("#goal").onchange = e => { const v = Math.round(+e.target.value || 0); setGoal(v >= 2 ? Math.min(200, v) : "next") };
$("#goalNext").onclick = () => setGoal("next"); $("#goalOff").onclick = () => setGoal("off");
const fullView = () => { document.body.classList.remove("mini"); document.body.classList.remove("focus"); if (fitsWindow()) requestAnimationFrame(() => compactFit(true)); else host.mini(false) };
$("#miniBtn").onclick = () => { document.body.classList.remove("focus"); document.body.classList.add("mini"); miniH = 0; if (session) renderMini(session.stats()); else miniFit(true) };
$("#miniFull").onclick = fullView;
$("#focusBtn").onclick = () => { document.body.classList.remove("mini"); document.body.classList.add("focus"); fzH = 0; if (session) renderFocus(session.stats()); else focusFit(true) };
$("#fzFull").onclick = fullView;
$("#fzWrapEnd").onclick = () => $("#miniWrapEnd").click();
// History (the maths is core/history.js): search and filters, Maps, personal bests, an EXP/hr trend for one map, rows with
// details (monsters, loot, used, level-ups) and rename/note editing, and compare for up to 6 runs against a baseline
const H = GrindHistory, hctx = {bestDrop: x => bestDrop(x)};
let histList = [], histF = {q: "", map: "", player: "", kind: "", sort: "new"}, histShown = 30, histOpen = new Set(), histEdit = new Set(), cmpSel = [], cmpBase = null;
const expOf = H.expOf, apm = x => H.metrics(x).apm;
// a run's who and how: character, job, levels, party, kills, deaths, the monster killed most, clock time
const who = x => [x.player, x.job, x.startLevel != null && x.endLevel != null && x.endLevel !== x.startLevel ? `Lv ${x.startLevel} → ${x.endLevel}` : x.level ? "Lv " + (x.endLevel ?? x.level) : null,
  x.party > 1 ? "party of " + x.party : "solo", x.kills != null && fmt(x.kills) + (x.kills === 1 ? " kill" : " kills"), (x.deaths || 0) + (x.deaths === 1 ? " death" : " deaths"),
  x.topMob && `mostly ${x.topMob.name}`, x.clockMin != null && `${Math.round(x.clockMin)} min on the clock`].filter(Boolean).join(" · ");
const when = x => x.saved ? new Date(+x.saved).toLocaleString([], {month: "short", day: "numeric", hour: "numeric", minute: "2-digit"}) : x.date;
const whatOf = x => H.isKpq(x) ? `KPQ (${x.kpq.mode === "Rush" ? "Rush" : "Bonus"}) · ${+x.kpq.rounds || 0} round${+x.kpq.rounds === 1 ? "" : "s"}` : x.mapName || "";
const byId = id => histList.find(x => String(+x.saved) === String(id));
const PB_NAMES = {expHr: "EXP/hr", mesosHr: "mesos/hr", netHr: "net/hr", killsHr: "kills/hr"};
async function loadHist(){
  histList = await host.sessions();
  cmpSel = cmpSel.filter(byId); if (cmpBase != null && !byId(cmpBase)) cmpBase = null;
  todayDraw(); etaDraw(); $("#recap").innerHTML = recap(histList) + levelLog(histList);
  histFilters(); histMaps(); histDraw(); cmpDraw();
}
// the filter bar: maps and characters come from the saved runs; a filter whose map or character is gone goes back to All
function histFilters(){
  const maps = [...new Set(histList.map(H.placeOf))].filter(m => m !== "?").sort(), people = [...new Set(histList.map(x => x.player).filter(Boolean))].sort();
  if (histF.map && !maps.includes(histF.map)) histF.map = ""; if (histF.player && !people.includes(histF.player)) histF.player = "";
  const opt = (v, t, on) => `<option value="${esc(v)}"${on ? " selected" : ""}>${esc(t)}</option>`;
  $("#histMap").innerHTML = opt("", "All maps", !histF.map) + maps.map(m => opt(m, m, m === histF.map)).join("");
  $("#histWho").innerHTML = opt("", "All characters", !histF.player) + people.map(p => opt(p, p, p === histF.player)).join("");
  $("#histWho").hidden = people.length < 2 && !histF.player;
  $("#histBar").hidden = histList.length < 2;
}
for (const [id, k] of [["#histQ", "q"], ["#histMap", "map"], ["#histWho", "player"], ["#histKind", "kind"], ["#histSort", "sort"]])
  $(id).addEventListener(id === "#histQ" ? "input" : "change", e => { histF[k] = e.target.value; histShown = 30; histDraw() });
// Maps: one line per map (KPQ as one), most farmed first; the name filters the list, Compare ticks its newest runs
function histMaps(){
  const rows = H.byMap(histList).filter(m => m.name !== "?");
  $("#mapsBox").hidden = !rows.length;
  $("#maps").innerHTML = rows.length ? `<table class="mapsT"><tr class="dim"><td>Map</td><td class="n">Runs</td><td class="n">Farming</td><td class="n" title="Every run's EXP/hr weighted by its farming time">EXP/hr</td><td class="n">Best</td><td class="n">Mesos/hr</td><td></td></tr>`
    + rows.map(m => `<tr><td><button class="link mapPick" data-map="${esc(m.name)}" title="Show only these runs">${esc(m.name)}</button></td><td class="n">${m.runs}</td><td class="n">${esc(hm(m.min / 60))}</td>`
      + `<td class="n">${m.expHr == null ? "-" : fmt(m.expHr)}</td><td class="n">${m.bestExpHr == null ? "-" : fmt(m.bestExpHr)}</td><td class="n">${m.mesosHr == null ? "-" : mz(m.mesosHr)}</td>`
      + `<td class="n">${m.runs > 1 ? `<button class="alt mapCmp" data-map="${esc(m.name)}" title="Compare the newest ${Math.min(m.runs, H.MAX_CMP)} runs here">Compare</button>` : ""}</td></tr>`).join("") + "</table>" : "";
}
$("#maps").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.classList.contains("mapPick")){ histF.map = b.dataset.map; histShown = 30; histFilters(); histDraw() }
  if (b.classList.contains("mapCmp")){ const m = H.byMap(histList).find(r => r.name === b.dataset.map); if (m){ cmpSel = m.ids.slice(0, H.MAX_CMP).map(String); cmpBase = null; cmpDraw(); histDraw(); $("#cmp").scrollIntoView?.({block: "nearest"}) } }
});
// the list: filtered and sorted, 30 at a time
function histDraw(){
  const list = H.filterRuns(histList, histF), pb = H.bests(histList);
  const shown = list.slice(0, histShown);
  $("#histCount").textContent = histList.length > 1 ? `${list.length === histList.length ? list.length : list.length + " of " + histList.length} sessions` : "";
  $("#histRows").innerHTML = shown.length ? shown.map(x => histRow(x, pb)).join("")
    : `<tr><td>${histList.length ? "No sessions match. " + `<button class="link" id="histReset">Show all</button>` : "No sessions yet: they're saved when you press Stop."}</td></tr>`;
  $("#histMore").innerHTML = list.length > histShown ? `<button class="alt" id="histMoreBtn">Show ${Math.min(30, list.length - histShown)} more</button>` : "";
  $("#cmpShown").hidden = list.length < 2;
  $("#cmpShown").textContent = `Compare the top ${Math.min(list.length, H.MAX_CMP)}`;
  trendDraw(list);
}
function histRow(x, pb){
  const m = H.metrics(x, hctx), sn = x.snap && x.snap.minutes > 0 ? x.snap : null, kq = H.isKpq(x), id = String(+x.saved), on = cmpSel.indexOf(id);
  const badges = Object.entries(pb).filter(([, s]) => String(+s) === id).map(([k]) => `<span class="pb" title="Your best ${PB_NAMES[k]} (runs with ${H.PB_MIN}+ min farming)">Best ${PB_NAMES[k]}</span>`).join("");
  const open = histOpen.has(id);
  return `<tr data-saved="${id}" class="${on >= 0 ? "pick cl" + cmpOrder().indexOf(id) : ""}"><td><button class="link det" aria-expanded="${open}" title="Details">${open ? "▾" : "▸"}</button> ${esc(when(x))} · ${x.name ? `<b>${esc(x.name)}</b> · ` : ""}${esc(whatOf(x))}${badges}<div class="hsub">${esc(who(x))}</div>`
    + `<div class="hsub"><b>${sg(m.exp)} EXP</b>${m.apm != null ? ` · ${fmt(m.apm)} EXP/min active` : ""} · ${mz(m.mesosHr || 0)}/hr`
    + (x.lootValue != null ? ` · net ${sgm(m.netHr || 0)}/hr` : "") + (x.items || x.bestDrop !== undefined ? ` · best drop: ${dropText(bestDrop(x))}` : "") + `</div>`
    + `${x.note ? `<div class="hnote">${esc(x.note)}</div>` : ""}</td><td class="n">${Math.round(sn && !kq ? sn.minutes : x.activeMin || 0)} min</td><td class="n" title="${sn ? `Lv ${+sn.startLevel} ${+sn.startPct}% to Lv ${+sn.endLevel} ${+sn.endPct}%` : "live count"}">${m.expHr == null ? "-" : fmt(m.expHr)} EXP/hr</td>`
    + `<td class="n"><input type="checkbox" class="cmp" data-saved="${id}"${on >= 0 ? " checked" : ""} title="Compare: tick 2 to ${H.MAX_CMP} sessions"> <button class="alt del" data-saved="${id}" title="Delete this session">×</button></td></tr>`
    + (open ? `<tr class="hdet" data-saved="${id}"><td colspan="4">${histDetail(x)}</td></tr>` : "");
}
// details: what the session recorded, per hour of farming where it's a count
function histDetail(x){
  const h = (x.activeMin || 0) / 60, per = n => h ? ` <span class="dim">${fmt(n / h)}/hr</span>` : "";
  const mobs = (Array.isArray(x.mobs) ? x.mobs : []).filter(m => m && m.kills > 0).sort((a, b) => b.kills - a.kills);
  const items = Object.entries(x.items || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]), used = Object.entries(x.used || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const ups = (Array.isArray(x.levelUps) ? x.levelUps : []).filter(l => l && l.level);
  const list = (title, rows) => rows.length ? `<div class="hcol"><div class="k">${title}</div>${rows.join("")}</div>` : "";
  const same = histList.filter(y => H.placeOf(y) === H.placeOf(x) && y.saved < x.saved).sort((a, b) => b.saved - a.saved)[0];
  return `<div class="hcols">` + list("Monsters", mobs.slice(0, 12).map(m => `<div>${esc(G.mobs[m.id]?.[0] || "Monster " + m.id)} ×${fmt(m.kills)}${per(m.kills)}</div>`))
    + list("Loot", items.slice(0, 12).map(([id, n]) => `<div>${ico(id)}${esc(G.items[id]?.n || "Item " + id)} ×${fmt(n)}${per(n)}</div>`))
    + list("Used", used.slice(0, 8).map(([id, n]) => `<div>${ico(id)}${esc(G.items[id]?.n || "Item " + id)} ×${fmt(n)}</div>`))
    + list("Level-ups", ups.map(l => `<div>Lv ${+l.level - 1} → ${+l.level}${l.activeMin != null ? ` <span class="dim">${esc(hm(l.activeMin / 60))}</span>` : ""}</div>`)) + `</div>`
    + (!mobs.length && !items.length && !used.length && !ups.length ? `<div class="note">No monster, loot or level-up detail saved with this session.</div>` : "")
    + (x.readShare != null ? `<div class="note">${Math.round(x.readShare * 100)}% of the EXP bar's gain showed up as readable lines${x.readShare < 0.7 ? ": kills, mesos and drops are undercounted" : ""}.</div>` : "")
    + `<div class="row">${same ? `<button class="alt cmpPrev" data-a="${+same.saved}" data-b="${+x.saved}">Compare with the run before it here (${esc(when(same))})</button>` : ""}</div>`
    + (Array.isArray(x.maps) && x.maps.length > 1 ? `<div class="note">EXP by map: ${x.maps.filter(m => m && (m.exp > 0 || m.kills > 0)).map(m => `${esc(m.name || "Unknown map")} ${fmt(m.exp)} EXP${m.min ? ` <span class="dim">${esc(hm(m.min / 60))}</span>` : ""}`).join(" · ") || "none"}.</div>` : "")
    + (x.edited ? `<div class="note">Edited by hand${editWas(x)}.</div>` : "")
    + (host.updateSession ? editForm(x) : "");
}
// History > Edit run: fix what a misread got wrong (core/history.js applyEdit; first values kept in x.orig)
const EDIT_LABEL = {mapName: "map", activeMin: "farming minutes", exp: "EXP", mesos: "mesos", kills: "kills", deaths: "deaths"};
function editWas(x){
  const o = x.orig && typeof x.orig === "object" ? Object.entries(x.orig).filter(([k]) => EDIT_LABEL[k]) : [];
  return o.length ? ": was " + o.map(([k, v]) => `${EDIT_LABEL[k]} ${esc(v == null ? "none" : typeof v === "number" ? fmt(v) : String(v))}`).join(", ") : "";
}
function editForm(x){
  const num = (k, label, v, step = 1) => `<label class="eF"><span>${label}</span><input class="eN" data-k="${k}" type="number" min="0" step="${step}" value="${v == null ? "" : +v}"></label>`;
  if (!$("#eMaps")){ const d = document.createElement("datalist"); d.id = "eMaps"; d.innerHTML = [...new Set(Object.values(G.mapnames || {}))].sort().map(n => `<option value="${esc(n)}">`).join(""); document.body.append(d) }   // one list of map names for every form
  return `<details class="hedit"${histEdit.has(String(+x.saved)) ? " open" : ""} data-saved="${+x.saved}"><summary>Edit run</summary>
    <div class="row"><input class="eName" maxlength="60" placeholder="Name (optional)" value="${esc(x.name || "")}" style="flex:1;min-width:0"></div>
    <div class="eGrid">${H.isKpq(x) ? "" : `<label class="eF eMap"><span>Map</span><input class="eMapIn" list="eMaps" maxlength="60" value="${esc(x.mapName || "")}"></label>`}
      ${num("activeMin", "Farming minutes", x.activeMin != null ? Math.round(x.activeMin * 10) / 10 : null, 0.1)}${num("exp", "EXP gained", H.expOf(x))}${num("mesos", "Mesos", x.mesos ?? 0)}${num("kills", "Kills", x.kills ?? 0)}${num("deaths", "Deaths", x.deaths ?? 0)}</div>
    <textarea class="eNote" maxlength="1000" rows="2" placeholder="Note (optional)" style="width:100%;box-sizing:border-box">${esc(x.note || "")}</textarea>
    <div class="row"><button class="alt eSave" data-saved="${+x.saved}">Save changes</button><span class="dim">Changed numbers keep their first value, shown under the run.</span></div></details>`;
}
// the patch the form asks for: only what changed (a number left as it was isn't sent)
function editPatch(box, x){
  const p = {name: box.querySelector(".eName").value.trim(), note: box.querySelector(".eNote").value.trim()};
  const mi = box.querySelector(".eMapIn"), mn = mi ? mi.value.trim() : "";
  if (mi && mn && mn !== (x.mapName || "")){ p.mapName = mn; const id = Object.entries(G.mapnames || {}).find(([, n]) => n === mn)?.[0] ?? (Array.isArray(x.maps) ? x.maps.find(m => m && m.name === mn)?.map : null); if (id) p.map = id }
  for (const i of box.querySelectorAll(".eN")){ if (i.value === "") continue; const v = +i.value, k = i.dataset.k, was = k === "exp" ? H.expOf(x) : k === "activeMin" ? Math.round((x.activeMin || 0) * 10) / 10 : (x[k] ?? 0);
    if (Number.isFinite(v) && v !== was) p[k] = v }
  return p;
}
// EXP/hr run by run, oldest to newest, for one map (3+ runs with a rate)
function trendDraw(list){
  const pts = histF.map ? list.map(x => ({x, v: H.metrics(x).expHr})).filter(p => p.v != null).sort((a, b) => a.x.saved - b.x.saved) : [];
  if (pts.length < 3){ $("#trend").innerHTML = ""; return }
  const W = 300, Ht = 44, lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v)), span = hi - lo || 1;
  const xy = pts.map((p, i) => [Math.round(i / (pts.length - 1) * (W - 8) + 4), Math.round(Ht - 4 - (p.v - lo) / span * (Ht - 8))]);
  $("#trend").innerHTML = `<div class="k">EXP/hr on ${esc(histF.map)}, run by run (${pts.length} runs)</div><svg class="trend" viewBox="0 0 ${W} ${Ht}" preserveAspectRatio="none" role="img" aria-label="EXP per hour per run">`
    + `<polyline fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke" points="${xy.map(p => p.join(",")).join(" ")}"/>`
    + xy.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="var(--accent)"><title>${esc(when(pts[i].x))}: ${fmt(pts[i].v)} EXP/hr</title></circle>`).join("") + `</svg>`
    + `<div class="note">Lowest ${fmt(lo)} · highest ${fmt(hi)} · latest ${fmt(pts[pts.length - 1].v)} EXP/hr</div>`;
}
$("#histMore").addEventListener("click", e => { if (e.target.id === "histMoreBtn"){ histShown += 30; histDraw() } });
$("#cmpShown").onclick = () => { cmpSel = H.filterRuns(histList, histF).slice(0, H.MAX_CMP).map(x => String(+x.saved)); cmpBase = null; cmpDraw(); histDraw() };
// compare: the ticked runs oldest first (A, B, C...), each against the baseline (the oldest unless another is picked), per hour
// of farming time (loot at the prices saved with each session). Green = better than the baseline (less spent, fewer deaths, a
// faster KPQ round count as better), ★ = the best of them
const cmpOrder = () => cmpSel.map(byId).filter(Boolean).sort((a, b) => a.saved - b.saved).map(x => String(+x.saved));
const L = i => String.fromCharCode(65 + i);
function compare(runs, base){
  const r = H.compareRuns(runs, base, hctx), n = runs.length;
  const show = (k, v) => v == null ? "-" : k === "meso" ? mz(v) : k === "min" ? Math.round(v) + " min" : k === "mss" ? mss(v) : k === "pct" ? Math.round(v * 100) + "%" : fmt(v);
  const head = (x, i) => `<div class="cmpWho cl${i}"><b>${L(i)}</b> ${esc(when(x))}${x.name ? ` · ${esc(x.name)}` : ""}<button class="link cmpX" data-saved="${+x.saved}" title="Take out of the compare">×</button>`
    + `<div class="note">${esc(whatOf(x) || "?")} · ${Math.round(x.activeMin || 0)} min farming</div><div class="note">${esc(who(x))}</div>`
    + (x.items || x.bestDrop !== undefined ? `<div class="note">Best drop: ${dropText(bestDrop(x))}</div>` : "") + `${x.note ? `<div class="hnote">${esc(x.note)}</div>` : ""}`
    + (n > 2 ? i === base ? `<div class="note"><b>Baseline</b></div>` : `<button class="link cmpBase" data-saved="${+x.saved}">Compare the others to this one</button>` : "") + `</div>`;
  const cell = (row, v, i, max) => { const d = row.delta[i];
    const ch = d ? `<span class="${d.better == null ? "dim" : d.better ? "pos" : "neg"}">${d.up ? "▲" : "▼"} ${d.pct == null ? show(row.show, Math.abs(d.diff)) : d.pct >= 900 ? "×" + fmt(d.pct / 100 + 1) : Math.abs(d.pct) + "%"}</span>` : "";
    return `<td><div class="cbar cl${i}${row.best === i ? " top" : ""}"><i style="width:${v == null ? 0 : Math.round(Math.abs(v) / max * 100)}%"></i><span>${row.best === i ? "★ " : ""}${show(row.show, v)}</span></div>${ch ? `<div class="cd">${ch}</div>` : ""}</td>` };
  const body = r.groups.map(g => `<tr class="grp"><td colspan="${n + 1}">${g.name}</td></tr>` + g.rows.map(row => { const max = Math.max(...row.vals.map(v => Math.abs(v || 0))) || 1;
    return `<tr><td>${row.label}</td>${row.vals.map((v, i) => cell(row, v, i, max)).join("")}</tr>` }).join("")).join("");
  // monsters and loot per hour: the ids that matter most across the runs
  const per = (title, rows, name) => rows.length ? `<tr class="grp"><td colspan="${n + 1}">${title}</td></tr>` + rows.map(p => { const max = Math.max(...p.vals.map(v => v || 0)) || 1;
    return `<tr><td>${name(p.id)}</td>${p.vals.map((v, i) => `<td><div class="cbar cl${i}"><i style="width:${v == null ? 0 : Math.round(v / max * 100)}%"></i><span>${v == null ? "-" : fmt(v)}</span></div></td>`).join("")}</tr>` }).join("") : "";
  const extra = per("Kills per hour", H.perHour(runs, "mobs"), id => esc(G.mobs[id]?.[0] || "Monster " + id)) + per("Pickups per hour", H.perHour(runs, "items"), id => ico(id) + esc(G.items[id]?.n || "Item " + id));
  const wins = r.wins.map((w, i) => `<b class="cl${i}t">${L(i)}</b> ${w}`).join(" · ");
  return `<div class="cmpBox"><div class="row" style="margin-top:0"><h3 style="flex:1;margin:0">Compare ${n} runs</h3><button class="alt" id="cmpClear">Clear</button></div>
    <div class="note">Best on (★): ${wins}. ▲▼ = change from <b>${L(base)}</b>, green when better.</div>
    <div class="cmpScroll"><table class="cmpT n${n}"><tr class="cmpHead"><td></td>${runs.map((x, i) => `<td>${head(x, i)}</td>`).join("")}</tr>${body}${extra}</table></div></div>`;
}
$("#histRows").addEventListener("change", e => { if (e.target.classList.contains("cmp")) cmpTick(e.target.dataset.saved, e.target.checked) });
function cmpTick(id, on){
  cmpSel = cmpSel.filter(s => s !== id); if (on) cmpSel.push(id);
  if (cmpSel.length > H.MAX_CMP){ cmpSel.shift(); $("#status").textContent = `Compare holds ${H.MAX_CMP} runs: the first one ticked was taken out.` }
  if (cmpBase === id && !on) cmpBase = null;
  cmpDraw(); histDraw();
}
function cmpDraw(){
  const ids = cmpOrder(), runs = ids.map(byId), base = Math.max(0, ids.indexOf(String(cmpBase)));
  $("#cmp").innerHTML = runs.length >= 2 ? compare(runs, base) : runs.length === 1 ? `<div class="note cmpBox">Tick one more session to compare (up to ${H.MAX_CMP}).</div>`
    : histList.length > 1 ? `<div class="note" style="margin:8px 0">Tick 2 to ${H.MAX_CMP} sessions below to compare them.</div>` : "";
}
$("#cmp").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return;
  if (b.id === "cmpClear"){ cmpSel = []; cmpBase = null }
  else if (b.classList.contains("cmpX")) cmpSel = cmpSel.filter(s => s !== b.dataset.saved);
  else if (b.classList.contains("cmpBase")) cmpBase = b.dataset.saved;
  else return;
  cmpDraw(); histDraw() });
// rows: details, compare with the run before, save name/note, delete (× asks "Delete?" first: a second click within 4 s deletes)
$("#histRows").onclick = async e => {
  if (e.target.id === "histReset"){ histF = {q: "", map: "", player: "", kind: "", sort: histF.sort}; $("#histQ").value = ""; $("#histKind").value = ""; histFilters(); histDraw(); return }
  const det = e.target.closest("button.det");
  if (det){ const id = det.closest("tr").dataset.saved; histOpen.has(id) ? histOpen.delete(id) : histOpen.add(id); histDraw(); return }
  const prev = e.target.closest("button.cmpPrev");
  if (prev){ cmpSel = [prev.dataset.a, prev.dataset.b]; cmpBase = null; cmpDraw(); histDraw(); $("#cmp").scrollIntoView?.({block: "nearest"}); return }
  const sv = e.target.closest("button.eSave");
  if (sv){ const box = sv.closest(".hedit"), x = histList.find(y => String(+y.saved) === sv.dataset.saved); if (!x) return;
    sv.disabled = true;
    if (await host.updateSession(sv.dataset.saved, editPatch(box, x))){ $("#status").textContent = "Run updated."; histEdit.delete(sv.dataset.saved); loadHist() }
    else { sv.disabled = false; $("#status").textContent = "Couldn't update that session." }
    return }
  const b = e.target.closest("button.del"); if (!b) return;
  if (!b.classList.contains("sure")){ b.classList.add("sure"); b.textContent = "Delete?"; setTimeout(() => { if (b.isConnected){ b.classList.remove("sure"); b.textContent = "×" } }, 4000); return }
  b.disabled = true;
  if (await host.deleteSession?.(b.dataset.saved)){ $("#status").textContent = "Session deleted."; cmpSel = cmpSel.filter(s => s !== b.dataset.saved); histOpen.delete(b.dataset.saved); loadHist() }
  else { b.disabled = false; $("#status").textContent = "Couldn't delete that session." }
};
// Past sessions is a pop-up (F2, File > Past sessions), not a module any more (Danny 2026-10-23); it reloads on every open
function openHist(){ loadHist(); $("#histPop").scrollTop = 0; modalOpen($("#histPop"), $("#histClose")) }
$("#histPop")._close = el => modalClose(el, $("#go"));
$("#histClose").onclick = () => modalClose($("#histPop"), $("#go"));
document.addEventListener("keydown", e => { if (e.key === "F2" && !keyWait){ e.preventDefault(); modalIsOpen($("#histPop")) ? modalClose($("#histPop"), $("#go")) : openHist() } });
// an open Edit run form stays open when the list redraws
$("#histRows").addEventListener("toggle", e => { const d = e.target; if (d.classList?.contains("hedit")) d.open ? histEdit.add(d.dataset.saved) : histEdit.delete(d.dataset.saved) }, true);
// level-up log: how long each level took (farming time in one session), newest first
// Today: farming time, EXP and mesos over the runs saved today (local day, core/history.js today())
function todayDraw(){
  const d = H.today(histList);
  $("#today").innerHTML = d.runs ? `<div class="todayCard"><b>Today:</b> ${esc(hm(d.min / 60))} farming · ${fmt(d.exp)} EXP · ${mz(d.mesos)} <span class="dim">(${d.runs} run${d.runs > 1 ? "s" : ""})</span></div>` : "";
}
// goal ETA per map: "Lv 30 in 6 h of farming at your Pig Beach rate, about Thursday" (core/history.js goalEta; the EXP
// table is the session's G.exp from data.json, the rates are your own History)
const dayName = t => { const d = new Date(t), n = new Date(), days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(n).setHours(0, 0, 0, 0)) / 864e5);
  return days <= 0 ? "today" : days === 1 ? "tomorrow" : days < 7 ? d.toLocaleDateString([], {weekday: "long"}) : d.toLocaleDateString([], {month: "short", day: "numeric"}) };
function etaDraw(){
  const e = H.goalEta(histList, {exp: G.exp, goal: goalOf()});
  if (!e.maps?.length){ $("#eta").innerHTML = e.why === "no table" ? `<div class="note">Lv ${e.goal}: past the EXP table, no estimate.</div>` : ""; return }
  const from = e.pct == null ? `from the start of Lv ${e.level}` : `from Lv ${e.level} ${e.pct.toFixed(1)}%`;
  $("#eta").innerHTML = `<div class="k">Goal: Lv ${e.goal} (${fmt(e.need)} EXP ${esc(from)}, your last run)</div><table class="etaT">` + e.maps.slice(0, 3).map(m =>
    `<tr><td>${esc(m.name)}</td><td class="n">${esc(hm(m.hours))} farming</td><td class="note">${m.at ? "about " + esc(dayName(m.at)) : ""}</td></tr>`).join("") + "</table>"
    + `<div class="note">At your EXP/hr on each map (15+ min there)${e.perDay ? `, ${esc(hm(e.perDay))} a day (your days played this week)` : ""}. An estimate: rates change as you level.</div>`;
}
function levelLog(list){
  const ups = list.flatMap(x => (Array.isArray(x.levelUps) ? x.levelUps : []).filter(l => l && l.activeMin != null).map(l => ({...l, date: x.date}))).slice(0, 10);
  return ups.length ? `<div class="k">Level-ups (farming time the level took)</div><table>` + ups.map(l => `<tr><td>Lv ${+l.level - 1} → ${+l.level}</td><td class="n">${esc(hm(l.activeMin / 60))}</td><td class="note">${esc(l.mapName || "")} ${esc(l.date)}</td></tr>`).join("") + "</table>" : "";
}
// last 7 days from the saved sessions: time played, EXP, mesos, levels gained, deaths, the fastest map (15+ minutes there)
function recap(list){
  const week = list.filter(x => x.saved > Date.now() - 7 * 864e5);
  if (!week.length) return "";
  const sum = k => week.reduce((a, x) => a + (+x[k] || 0), 0), lv = week.map(x => x.level).filter(Boolean);
  const byMap = {}; for (const x of week){ const m = x.mapName || "?"; (byMap[m] = byMap[m] || {min: 0, exp: 0}); byMap[m].min += x.activeMin || 0; byMap[m].exp += x.exp || 0 }
  const best = Object.entries(byMap).filter(([m, v]) => m !== "?" && v.min >= 15).sort((a, b) => b[1].exp / b[1].min - a[1].exp / a[1].min)[0];
  return `<div class="note"><b>Last 7 days:</b> ${week.length} session${week.length > 1 ? "s" : ""}, ${(sum("activeMin") / 60).toFixed(1)} h farming, ${fmt(sum("exp"))} EXP, ${mz(sum("mesos"))}`
    + (lv.length ? `, level ${Math.min(...lv)} → ${Math.max(...lv)}` : "") + `, ${sum("deaths")} death${sum("deaths") === 1 ? "" : "s"}`
    + (best ? `. Fastest map: ${esc(best[0])} (${fmt(best[1].exp / best[1].min * 60)} EXP/hr)` : "") + `</div>`;
}
$("#csv").onclick = async () => { const r = await host.exportCsv(); $("#status").textContent = r?.error || "Saved to Documents: " + (r?.file || "").split(/[\\/]/).pop() };
const bagSave = () => host.settings({bag: {main: $("#bagMain").checked, every: GrindBag.every($("#bagEvery").value)}}).then(s => { settings = s; if (session) render() });
$("#bagMain").onchange = $("#bagEvery").onchange = bagSave;
$("#autoPause").onchange = e => host.settings({autoPause: e.target.checked}).then(s => settings = s);
$("#ontop").onchange = e => host.settings({onTop: e.target.checked}).then(s => settings = s);
$("#share").onchange = e => host.settings({share: e.target.checked}).then(s => settings = s);
$("#kpqName").onchange = e => host.settings({kpqName: e.target.checked}).then(s => settings = s);
$("#job").onchange = e => host.settings({job: e.target.value}).then(s => {
  settings = s; jobNow = jobSeen = null; lastJob = 0;   // back on Auto: read it again soon
  if (session){ const ev = {t: Date.now(), type: "job", name: s.job || null}; session.add(ev); slicer?.add(ev) }   // Dummy data has no slicer
});
