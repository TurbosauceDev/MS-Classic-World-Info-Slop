// Tracker window, History: goal, totals, compare, delete, level-up log, last 7 days (renderer.js is split in load order; all share one global scope, see renderer.js)
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
const setGoal = v => host.settings({goal: v}).then(s => { settings = s; session?.setGoal(goalOf()); goalUi(); if (session) render() });
$("#goal").onchange = e => { const v = Math.round(+e.target.value || 0); setGoal(v >= 2 ? Math.min(200, v) : "next") };
$("#goalNext").onclick = () => setGoal("next"); $("#goalOff").onclick = () => setGoal("off");
$("#alertItems").onchange = e => host.settings({alertItems: e.target.value.slice(0, 500)}).then(s => { settings = s; const n = alertSet().size; $("#alertItemsNote").textContent = n ? n + " item" + (n > 1 ? "s" : "") + " watched" : "" });
$("#alert").onchange = e => host.settings({alertWorth: Math.max(0, +e.target.value || 0)}).then(s => settings = s);
$("#miniBtn").onclick = () => { document.body.classList.add("mini"); miniH = 0; if (session) renderMini(session.stats()); else miniFit(true) };
$("#miniFull").onclick = () => { document.body.classList.remove("mini"); if (document.body.classList.contains("compact")) requestAnimationFrame(() => compactFit(true)); else host.mini(false) };
$("#histBtn").onclick = () => { showTab("hist"); loadHist() };
let histList = [];
// total EXP of a run (the start/end readings when it has both, else the live count) and EXP per minute of farming
const expOf = x => x.expTotal ?? (x.snap?.exp ?? x.exp ?? 0), apm = x => x.expPerActiveMin ?? (x.activeMin >= 1 ? expOf(x) / x.activeMin : null);
// a run's who and how: character, job, levels, party, kills, deaths, the monster killed most, clock time
const who = x => [x.player, x.job, x.startLevel != null && x.endLevel != null && x.endLevel !== x.startLevel ? `Lv ${x.startLevel} → ${x.endLevel}` : x.level ? "Lv " + (x.endLevel ?? x.level) : null,
  x.party > 1 ? "party of " + x.party : "solo", x.kills != null && fmt(x.kills) + (x.kills === 1 ? " kill" : " kills"), (x.deaths || 0) + (x.deaths === 1 ? " death" : " deaths"),
  x.topMob && `mostly ${x.topMob.name}`, x.clockMin != null && `${Math.round(x.clockMin)} min on the clock`].filter(Boolean).join(" · ");
async function loadHist(){
  const list = histList = await host.sessions(); $("#cmp").innerHTML = list.length > 1 ? `<div class="note" style="margin:8px 0">Tick two sessions below to compare them.</div>` : "";
  $("#recap").innerHTML = recap(list) + levelLog(list);
  $("#histRows").innerHTML = list.length ? list.slice(0, 30).map(x => { const h = (x.activeMin || 0) / 60;
    // EXP/hr from the start/end readings when the session has them (clock time), else the live count (farming time)
    // KPQ: over time in the stages only (the readings' clock time includes the waits in Kerning)
    const sn = x.snap && x.snap.minutes > 0 ? x.snap : null, kq = x.kpq && typeof x.kpq === "object" ? x.kpq : null;
    const rate = kq ? h ? fmt((sn ? sn.exp : x.exp) / h) : "-" : sn ? fmt(sn.exp / (sn.minutes / 60)) : h ? fmt(x.exp / h) : "-";
    const what = kq ? `KPQ (${kq.mode === "Rush" ? "Rush" : "Bonus"}) · ${+kq.rounds || 0} round${+kq.rounds === 1 ? "" : "s"}` : x.mapName || "";
    return `<tr><td>${esc(when(x))} · ${x.name ? `<b>${esc(x.name)}</b> · ` : ""}${esc(what)}<div class="hsub">${esc(who(x))}</div>`
      + `<div class="hsub"><b>${sg(expOf(x))} EXP</b>${apm(x) != null ? ` · ${fmt(apm(x))} EXP/min active` : ""} · ${mz(h ? (x.mesos || 0) / h : 0)}/hr`
      + (x.lootValue != null ? ` · net ${sgm(h ? ((x.mesos || 0) + x.lootValue - (x.usedCost || 0)) / h : 0)}/hr` : "") + (x.items || x.bestDrop !== undefined ? ` · best drop: ${dropText(bestDrop(x))}` : "") + `</div>`
      + `${x.note ? `<div class="hnote">${esc(x.note)}</div>` : ""}</td><td class="n">${Math.round(sn && !kq ? sn.minutes : x.activeMin || 0)} min</td><td class="n" title="${sn ? `Lv ${+sn.startLevel} ${+sn.startPct}% to Lv ${+sn.endLevel} ${+sn.endPct}%` : "live count"}">${rate} EXP/hr</td>`
      + `<td class="n"><input type="checkbox" class="cmp" data-saved="${+x.saved}" title="Compare: tick two sessions"> <button class="alt del" data-saved="${+x.saved}" title="Delete this session">×</button></td></tr>` }).join("")
    : `<tr><td>No sessions yet: they're saved when you press Stop.</td></tr>`;
}
// compare: two ticked sessions side by side, A the older and B the newer, per hour of farming time (loot at the prices
// saved with each session). Grouped, with a bar per value and the change in green when B did better (less spent, fewer
// deaths, a faster KPQ round count as better)
const when = x => x.saved ? new Date(+x.saved).toLocaleString([], {month: "short", day: "numeric", hour: "numeric", minute: "2-digit"}) : x.date;
function compare(a, b){
  const h = x => (x.activeMin || 0) / 60, hr = (x, v) => h(x) && v != null ? v / h(x) : null;
  const what = x => x.kpq && typeof x.kpq === "object" ? `KPQ ${x.kpq.mode === "Rush" ? "Rush" : "Bonus"} · ${+x.kpq.rounds || 0} round${+x.kpq.rounds === 1 ? "" : "s"}` : x.mapName || "?";
  // [label, value, lower is better, shown as]
  const groups = [["Speed", [["EXP/hr", x => hr(x, x.snap && x.snap.minutes > 0 && !x.kpq ? x.snap.exp * h(x) / (x.snap.minutes / 60) : x.exp)], ["EXP gained (total)", x => expOf(x)], ["Active EXP/min", x => apm(x)], ["Kills/hr", x => hr(x, x.kills)]]],
    ["Money per hour", [["Mesos picked up", x => hr(x, x.mesos), false, mz], ["Items looted (worth)", x => hr(x, x.lootValue), false, mz], ["Potions and arrows used", x => hr(x, x.usedCost), true, mz], ["Mesos per kill", x => x.kills ? (x.mesos || 0) / x.kills : null, false, mz],
      ["Best drop (each)", x => bestDrop(x)?.each ?? null, false, mz],
      ["Net", x => x.lootValue == null ? null : hr(x, (x.mesos || 0) + x.lootValue - (x.usedCost || 0)), false, mz]]],
    ["Run", [["Farming time", x => x.activeMin || 0, null, v => Math.round(v) + " min"], ["Deaths", x => x.deaths || 0, true], ["KPQ best round", x => x.kpq?.best ?? null, true, mss]]]];
  const head = (k, x) => `<div class="cmpWho ${k}"><b>${k.toUpperCase()}</b> ${esc(when(x))}${x.name ? ` · ${esc(x.name)}` : ""}<div class="note">${esc(what(x))} · ${Math.round(x.activeMin || 0)} min farming</div><div class="note">${esc(who(x))}</div>`
    + (x.items || x.bestDrop !== undefined ? `<div class="note">Best drop: ${dropText(bestDrop(x))}</div>` : "") + `${x.note ? `<div class="hnote">${esc(x.note)}</div>` : ""}</div>`;
  let up = 0, down = 0;
  const body = groups.map(([g, rows]) => {
    const tr = rows.map(([k, f, low, show]) => { const va = f(a), vb = f(b); if (va == null && vb == null) return "";
      const txt = v => v == null ? "-" : show ? show(v) : fmt(v), max = Math.max(Math.abs(va || 0), Math.abs(vb || 0)) || 1;
      const bar = (v, c) => `<div class="cbar ${c}"><i style="width:${v == null ? 0 : Math.round(Math.abs(v) / max * 100)}%"></i><span>${txt(v)}</span></div>`;
      let d = "";
      if (typeof va === "number" && typeof vb === "number" && low !== null && va !== vb){
        const better = low ? vb < va : vb > va; better ? up++ : down++;
        const pct = va ? Math.round((vb / va - 1) * 100) : null;
        d = `<span class="${better ? "pos" : "neg"}">${vb > va ? "▲" : "▼"} ${pct == null ? txt(Math.abs(vb - va)) : Math.abs(pct) + "%"}</span>`;
      }
      return `<tr><td>${k}</td><td>${bar(va, "a")}${bar(vb, "b")}</td><td class="n">${d}</td></tr>` }).join("");
    return tr && `<tr class="grp"><td colspan="3">${g}</td></tr>` + tr }).join("");
  return `<div class="cmpBox"><div class="row" style="margin-top:0"><h3 style="flex:1;margin:0">Compare</h3><button class="alt" id="cmpClear">Clear</button></div>
    <div class="cmpHead">${head("a", a)}${head("b", b)}</div>
    <div class="note">B did better on <b class="pos">${up}</b> and worse on <b class="neg">${down}</b> of these. Green = B better than A.</div>
    <table class="cmpT">${body}</table></div>`;
}
$("#histRows").addEventListener("change", e => { if (e.target.classList.contains("cmp")) cmpUpdate(e.target) });
// Clear: untick both (it used to send a change event from the table itself, which the handler above ignored)
$("#cmp").addEventListener("click", e => { if (e.target.id !== "cmpClear") return; for (const c of $("#histRows").querySelectorAll(".cmp:checked")) c.checked = false; cmpUpdate(null) });
function cmpUpdate(changed){
  const on = [...$("#histRows").querySelectorAll(".cmp:checked")];
  if (on.length > 2) on.filter(c => c !== changed).slice(0, on.length - 2).forEach(c => c.checked = false);
  const pick = [...$("#histRows").querySelectorAll(".cmp:checked")].map(c => histList.find(x => String(+x.saved) === c.dataset.saved)).filter(Boolean);
  pick.sort((x, y) => +x.saved - +y.saved);
  $("#cmp").innerHTML = pick.length === 2 ? compare(pick[0], pick[1]) : pick.length === 1 ? `<div class="note cmpBox">Tick one more session to compare.</div>` : `<div class="note" style="margin:8px 0">Tick two sessions below to compare them.</div>`;
  for (const c of $("#histRows").querySelectorAll(".cmp")){ const i = pick.findIndex(x => String(+x.saved) === c.dataset.saved);
    c.closest("tr").classList.toggle("pickA", pick.length === 2 && i === 0); c.closest("tr").classList.toggle("pickB", pick.length === 2 && i === 1) }
}
// delete a session: × asks "Delete?" first (a second click within 4 s deletes), then History is redrawn
$("#histRows").onclick = async e => {
  const b = e.target.closest("button.del"); if (!b) return;
  if (!b.classList.contains("sure")){ b.classList.add("sure"); b.textContent = "Delete?"; setTimeout(() => { if (b.isConnected){ b.classList.remove("sure"); b.textContent = "×" } }, 4000); return }
  b.disabled = true;
  if (await host.deleteSession?.(b.dataset.saved)){ $("#status").textContent = "Session deleted."; loadHist() }
  else { b.disabled = false; $("#status").textContent = "Couldn't delete that session." }
};
// level-up log: how long each level took (farming time in one session), newest first
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
$("#autoPause").onchange = e => host.settings({autoPause: e.target.checked}).then(s => settings = s);
$("#ontop").onchange = e => host.settings({onTop: e.target.checked}).then(s => settings = s);
$("#share").onchange = e => host.settings({share: e.target.checked}).then(s => settings = s);
$("#kpqName").onchange = e => host.settings({kpqName: e.target.checked}).then(s => settings = s);
$("#job").onchange = e => host.settings({job: e.target.value}).then(s => {
  settings = s; jobNow = jobSeen = null; lastJob = 0;   // back on Auto: read it again soon
  if (session){ const ev = {t: Date.now(), type: "job", name: s.job || null}; session.add(ev); slicer.add(ev) }
});
