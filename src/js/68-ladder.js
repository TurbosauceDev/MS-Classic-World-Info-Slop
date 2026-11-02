/* ---------------- Weekly grind ladder (#ladder, P1-5) + community map rates (P1-9), 2026-11-02 ----------------
   Reads GET /api/ladder (the Worker; server/src/index.js ladderBody): this week and last week, boards ranked by
   the week's best run (overall EXP, overall mesos, per map), community map rates, and how many lines the two
   watchdogs (the map's physics ceiling, too-far-above-a-busy-board) are holding back. Names are the display
   names players chose to send — the same opt-in nick the party view uses. The KPQ leaderboard page
   (68-trkkpq.js) is the shape this page follows. */
const LADDER_API = "https://ms-classic-tracker.maplestoryclassic.workers.dev/api/ladder";
const LAD = (() => {
const $l = id => document.getElementById(id);
const fmt = n => n == null ? "–" : Number(n).toLocaleString("en-US");
const hm = min => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? h + " h " + (m ? m + " min" : "") : m + " min" };
const when = iso => { try { return new Date(iso).toLocaleDateString(undefined, {month: "short", day: "numeric"}) } catch { return "" } };
let data = null, week = "this", view = "overall", map = "", busy = false;

function meta(w){
  const wk = w === "last" ? "Last week" : "This week";
  const upd = data?.updated ? new Date(data.updated).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"}) : "";
  const d = data?.[w] || {};
  return `${wk} · ${d.players || 0} player${d.players === 1 ? "" : "s"} · ${fmt(d.runs)} run${d.runs === 1 ? "" : "s"} shared` + (upd ? ` · updated ${upd}` : "");
}
function board(tbl){
  const rows = tbl?.rows || [], hid = tbl?.hidden || 0;
  if (!rows.length) return `<p class="note">Nothing on this board yet — it fills as players share runs this week.</p>`;
  const body = rows.map((r, i) => `<tr>
    <td class="num">${i + 1}</td>
    <td>${r.names.length ? r.names.map(esc).join(", ") : `<span class="sub">unnamed grinder</span>`}${r.party > 1 ? `<span class="party">party</span>` : ""}</td>
    <td>${esc(r.mapName || (r.map ? "Map " + r.map : "Unknown map"))}${r.level ? ` <span class="sub">Lv ${r.level}${r.job ? " " + esc(r.job) : ""}</span>` : ""}</td>
    <td class="num">${fmt(r.expHr)}</td>
    <td class="num">${fmt(r.mesosHr)}</td>
    <td class="num">${hm(r.minutes)}</td>
    <td class="num sub">${when(r.at)}</td>
  </tr>`).join("");
  return `<table><thead><tr><th></th><th>Player${rows.some(r => r.party > 1) ? " / party" : ""}</th><th>Best run on</th><th class="num">EXP / h</th><th class="num">Mesos / h</th><th class="num">Farmed</th><th class="num">Best</th></tr></thead><tbody>${body}</tbody></table>`
    + (hid ? `<p class="note">${hid} line${hid === 1 ? " is" : "s are"} held back by the watchdogs (never deleted).</p>` : "");
}
function rates(){
  const list = (data?.[week]?.rates || []).slice().sort((a, b) => b.expHr - a.expHr);
  if (!list.length) return `<p class="note">No map has 2+ players this week yet — rates appear as friends farm the same maps.</p>`;
  return `<table><thead><tr><th>Map</th><th class="num">Players</th><th class="num">EXP / h (community)</th><th class="num">Mesos / h</th></tr></thead><tbody>`
    + list.map(r => `<tr><td>${esc(r.mapName || "Map " + r.map)}</td><td class="num">${r.players}</td><td class="num">${fmt(r.expHr)}</td><td class="num">${fmt(r.mesosHr)}</td></tr>`).join("")
    + `</tbody></table>`;
}
function render(){
  const d = data?.[week];
  if (!d){ $l("ladderdata").innerHTML = `<p class="note">The ladder didn't answer (offline?). Try again in a minute.</p>`; $l("laddermeta").textContent = ""; return }
  $l("laddermeta").textContent = meta(week);
  const maps = Object.keys(d.boards?.maps || {});
  const tabs = [["overall", "Overall EXP"], ["mesos", "Mesos"], ["rates", "Map rates"],
    ...(maps.length ? ["|"] : [])].flat();
  let html = `<div class="lad-tabs">${tabs.map(t => t === "|" ? `<select id="laddmap" aria-label="Which map's board"><option value="">A single map…</option>${maps.map(m => `<option value="${esc(m)}"${map === m ? " selected" : ""}>${esc(d.boards.maps[m].rows[0]?.mapName || "Map " + m)}</option>`).join("")}</select>`
    : `<button type="button" data-v="${t}" class="${view === t ? "on" : ""}">${{overall: "Overall EXP", mesos: "Mesos", rates: "Map rates"}[t]}</button>`).join("")}</div>`;
  html += view === "rates" ? rates() : view === "mesos" ? board(d.boards?.mesos)
    : map && d.boards?.maps?.[map] ? board(d.boards.maps[map]) : board(d.boards?.overall);
  if (view !== "rates" && !map) html += `<p class="note sub">Ranked by the week's best run per player or party. Pick "A single map" for per-map boards.</p>`;
  $l("ladderdata").innerHTML = html;
}
async function open(){
  if (data || busy) return render();
  busy = true;
  try { const r = await fetch(LADDER_API, {signal: AbortSignal.timeout(15e3)}); data = r.ok ? await r.json() : null } catch {}
  busy = false;
  render();
}
document.addEventListener("click", e => {
  const b = e.target.closest("#ladderdata .lad-tabs button");
  if (b){ view = b.dataset.v; if (view !== "overall" && view !== "mesos") map = ""; else map = ""; render() }
});
$l("ladderdata").addEventListener("change", e => { if (e.target.id === "laddmap"){ map = e.target.value; if (map) view = "map"; else view = "overall"; render() } });
for (const b of $l("ladderweek").querySelectorAll("button")) b.addEventListener("click", () => {
  week = b.dataset.w;
  for (const x of $l("ladderweek").querySelectorAll("button")) x.classList.toggle("on", x === b);
  if (view === "map" && !(data?.[week]?.boards?.maps || {})[map]) view = "overall";
  render();
});
const t = document.getElementById("t-ladder");
t?.addEventListener("click", open);
if (t && !t.hidden) queueMicrotask(open);   // opened by a deep link: the tab is already visible
return {open, render};
})();
