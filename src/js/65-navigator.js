/* ---------------- map navigator ---------------- */
let navTo;   // (mapId): open the navigator with that map as the destination
(() => {
// pick a start and a destination; shows the quickest route (same travel model as the Path Planner: walk 30 s a map,
// cab 45 s between cab towns, both estimates) map by map, with the exit to take on each minimap. The World Map
// card's "Route here" opens it (navTo). Maple Island -> Victoria goes through Shanks (one way).
const {travel, DIST, ISLAND, SHIP_LV, WALK_SEC, TAXI_SEC} = TRAVEL, SOUTHPERRY = "60", LITH = "10000000";
const mapName = id => D.maps[id]?.[0] || D.mapnames[id] || "map " + id;
const IDS = Object.keys(D.nav);
// one unique label per walkable map, for the search boxes
const LABEL = {}, BYLABEL = {}, seen = {};
for (const id of IDS.slice().sort((a, b) => mapName(a).localeCompare(mapName(b)) || a - b)){
  let l = mapName(id) + (ISLAND(id) ? " (Maple Island)" : "");
  seen[l] = (seen[l] || 0) + 1; if (seen[l] > 1) l += ` #${seen[l]}`;
  LABEL[id] = l; BYLABEL[l.toLowerCase()] = id;
}
$("#navmaps").innerHTML = Object.values(LABEL).map(l => `<option value="${esc(l)}">`).join("");
$("#navtowns").innerHTML = [SOUTHPERRY, ...D.cabs].map(id => `<button type="button" data-id="${id}" aria-checked="false">${esc(mapName(id))}</button>`).join("");

let S = {from: LITH, to: null, nocab: false};
try { Object.assign(S, JSON.parse(localStorage.getItem("navi") || "{}")) } catch(e) {}
const save = () => { try { localStorage.setItem("navi", JSON.stringify(S)) } catch(e) {} };

// map-by-map hops of the planner's shortest trip: [[from, to, byCab], ...]; null when there's no walking/cab route
function hops(a, b){
  if (a === b) return [];
  if (S.nocab) return walkHops(a, b);
  if (!travel(a, b)) return null;
  const out = [], P = DIST[a];
  for (let v = b; v !== a; v = P.get(v).prev) out.unshift([P.get(v).prev, v, P.get(v).cab]);
  return out;
}
// "No taxi": fewest maps on foot (every map costs the same, so a breadth-first search)
function walkHops(a, b){
  const prev = {[a]: null}, q = [a];
  for (let i = 0; i < q.length && !(b in prev); i++) for (const v of D.nav[q[i]] || []) if (!(v in prev)){ prev[v] = q[i]; q.push(v) }
  if (!(b in prev)) return null;
  const out = []; for (let v = b; v !== a; v = prev[v]) out.unshift([prev[v], v, false]);
  return out;
}
function route(a, b){
  if (!D.nav[a] || !D.nav[b]) return null;
  if (ISLAND(a) && !ISLAND(b)){   // Shanks' ship, then on to the destination
    const h1 = hops(a, SOUTHPERRY), h2 = hops(LITH, b);
    return h1 && h2 ? [...h1, [SOUTHPERRY, LITH, false, true], ...h2] : null;
  }
  if (!ISLAND(a) && ISLAND(b)) return "oneway";
  return hops(a, b);
}
const exitNo = (u, v) => { const ds = []; for (const p of (D.portals[u] || []).slice().sort((x, y) => x[0] - y[0])) if (!ds.includes(String(p[2]))) ds.push(String(p[2]));
  const i = ds.indexOf(String(v)); return i < 0 ? null : i + 1 };

function render(){
  $("#navfrom").value = LABEL[S.from] || ""; $("#navto").value = S.to ? LABEL[S.to] || mapName(S.to) : "";
  document.querySelectorAll("#navtowns button").forEach(b => b.setAttribute("aria-checked", b.dataset.id === S.from));
  const out = $("#navout");
  if (!S.to){ out.innerHTML = `<p class="sub">Pick where you're going, or click any map name on the site.</p>`; return }
  if (!S.from){ out.innerHTML = `<p class="sub">Pick where you're starting from.</p>`; return }
  if (!D.nav[S.to]){ out.innerHTML = `<p class="sub"><b>${esc(mapName(S.to))}</b> isn't joined to the launch maps by portals in the game files: you get there through an NPC (a jump quest, party quest or job test entrance), or it isn't open at launch.</p>`; return }
  const r = route(S.from, S.to);
  if (r === "oneway"){ out.innerHTML = `<p class="sub">You can't get back to Maple Island: Shanks' ship from Southperry to Lith Harbor is one way.</p>`; return }
  if (!r){ out.innerHTML = `<p class="sub">No walking or cab route between these maps in the game files: one of them is only reached through an NPC.</p>`; return }
  if (!r.length){ out.innerHTML = `<p class="sub">You're already there.</p>`; return }
  const walk = r.filter(h => !h[2] && !h[3]).length, cabs = r.filter(h => h[2]).length, ship = r.some(h => h[3]);
  const sec = walk * WALK_SEC + cabs * TAXI_SEC;
  const steps = r.map(([u, v, cab, boat], i) => {
    const n = !cab && !boat ? exitNo(u, v) : null, [mm, exits] = n ? minimap(u, null, v) : ["", ""];
    const what = boat ? `Take Shanks' ship from ${mapLink(u, mapName(u))} to ${mapLink(v, mapName(v))} <span class="sub">(level ${SHIP_LV}+, 300 mesos, one way)</span>`
      : cab ? `Take the cab from ${mapLink(u, mapName(u))} to ${mapLink(v, mapName(v))}`
      : `${mapLink(u, mapName(u))}: ${n ? `take exit <b class="ptn on">${n}</b>` : "go"} to ${mapLink(v, mapName(v))}`;
    return `<li><span class="navno">${i + 1}</span><div>${what}${mm ? `<details class="navmm"><summary>Minimap</summary><div class="mfmap">${mm}${exits}</div></details>` : ""}</div></li>`;
  }).join("");
  out.innerHTML = `<p class="navsum"><b>${esc(mapName(S.from))}</b> to <b>${esc(mapName(S.to))}</b>: ${[walk ? `${walk} map${walk === 1 ? "" : "s"} on foot` : "", cabs ? `${cabs} cab ride${cabs === 1 ? "" : "s"}` : "", ship ? "Shanks' ship" : ""].filter(Boolean).join(", ")}
      · about ${dur(sec)}${ship ? " plus the boat ride" : ""} <span class="sub">(estimate)</span></p>
    <ol class="navsteps">${steps}</ol>`;
}
const pick = (k, v) => { const id = BYLABEL[String(v).trim().toLowerCase()]; if (id && id !== S[k]){ S[k] = id; save(); render() } };
$("#navfrom").addEventListener("change", e => pick("from", e.target.value));
$("#navto").addEventListener("change", e => pick("to", e.target.value));
$("#navtowns").addEventListener("click", e => { const b = e.target.closest("button"); if (b){ S.from = b.dataset.id; save(); render() } });
$("#navnocab").checked = !!S.nocab;
$("#navnocab").addEventListener("change", e => { S.nocab = e.target.checked; save(); render() });
$("#navswap").addEventListener("click", () => { if (S.to && D.nav[S.to]){ [S.from, S.to] = [S.to, S.from]; save(); render() } });
// open the navigator with a map as the destination (World Map's "Route here")
navTo = id => { hideQtip(); S.to = String(id); save(); $("#t-navi").click(); render(); $("#navi").scrollIntoView({block: "start"}) };
render();
})();
