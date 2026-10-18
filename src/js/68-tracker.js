/* ---------------- Grind Tracker page: the Windows app + what its players shared ---------------- */
// Data: the tracker server's /api/summary. The copy embedded at build (D.shared, scripts/fetch_shared.py) shows first; on
// opening the page we also ask the server for the latest (it allows any site; blocked in some previews, then the copy stays).
const TRK_API = "https://ms-classic-tracker.maplestoryclassic.workers.dev/api/summary";
// rows -> one shape: embedded rows are [map, party 0/1, level, EXP/hr, group, deaths/hr, pots/hr]; the server's are objects
const trkRows = (rows, live) => (rows || []).map(r => live ? {map: String(r.map ?? ""), name: r.mapName, party: r.party > 1 ? 1 : 0, level: r.level, job: r.job,
  expHr: r.expHr, mesosHr: r.mesosHr, killsHr: r.killsHr, deathsHr: r.deathsHr, usedHr: r.usedHr, group: r.group, runs: r.runs}
  : {map: r[0], party: r[1], level: r[2], expHr: r[3], group: r[4], deathsHr: r[5], usedHr: r[6]}).filter(r => r.map && r.level);
const trkMapName = r => D.mapnames[r.map] ?? D.maps[r.map]?.[0] ?? r.name ?? r.map;
const trkMed = a => { const v = a.filter(x => x != null); return v.length ? median(v) : null };
let TRK = null, TRK_ASKED = false;
function trkRender(){
  const s = TRK || {...(D.shared || {}), rows: trkRows(D.shared?.rows, false), live: false};
  $("#trksrc").innerHTML = s.live ? `Live from the tracker server, updated ${esc(new Date(s.updated).toLocaleString())}.`
    : `Snapshot from the tracker server${s.read ? `, read ${esc(s.read)}` : ""}.${TRK_ASKED ? " The live server couldn't be reached from here." : ""}`;
  if (!s.runs){
    $("#trkdata").innerHTML = `<div class="card trkempty"><h3>No shared runs yet</h3><p>Every 15 minutes of non-stop farming on one map that a tracker player shares lands here: EXP/hr and mesos/hr by map, confirmed drops by monster, and the best time of day to farm. Be the first: download the tracker above and say yes to sharing.</p></div>`;
    return;
  }
  // maps: one line per map and solo/party; each player (or party) counts once (their typical run)
  const by = new Map();
  for (const r of s.rows){ const k = r.map + "|" + r.party; if (!by.has(k)) by.set(k, []); by.get(k).push(r) }
  const maps = [...by.values()].map(a => ({r: a[0], groups: new Set(a.map(x => x.group)).size, lo: Math.min(...a.map(x => x.level)), hi: Math.max(...a.map(x => x.level)),
    exp: trkMed(a.map(x => x.expHr)), mesos: trkMed(a.map(x => x.mesosHr)), deaths: trkMed(a.map(x => x.deathsHr)), used: trkMed(a.map(x => x.usedHr)),
    runs: a.reduce((t, x) => t + (x.runs || 0), 0)})).sort((a, b) => b.groups - a.groups || b.exp - a.exp);
  const known = id => D.mapnames[id] != null || D.maps[id];
  const mapRows = maps.map(m => `<tr><td>${known(m.r.map) ? mapLink(m.r.map, trkMapName(m.r)) : esc(trkMapName(m.r))}${m.groups < 3 ? ' <span class="pill p-warn">early</span>' : ""}</td>
    <td>${m.r.party ? "party" : "solo"}</td><td class="num">${m.groups}</td><td class="num">${m.lo === m.hi ? m.lo : m.lo + "-" + m.hi}</td>
    <td class="num">${fmt(m.exp)}</td><td class="num">${fmt(m.mesos)}</td><td class="num">${m.deaths == null ? "–" : +m.deaths.toFixed(1)}</td><td class="num">${fmt(m.used)}</td></tr>`).join("");
  // monsters: what players picked up after kills (Confirmed Drops)
  const mobs = Object.entries(s.mobs || {}).filter(([, c]) => c.kills > 0).sort((a, b) => b[1].kills - a[1].kills);
  const mobRows = mobs.map(([id, c]) => {
    const items = Object.entries(c.items || {}).filter(([i, n]) => n > 0 && D.items[i]).sort((a, b) => b[1] - a[1]);
    const shown = items.slice(0, 6).map(([i, n]) => `${itemIcon(i, 1, true)} <span class="sub">1 in ${fmt(c.kills / n)}</span>`).join(" ");
    return `<tr><td>${D.mobs[id] || D.mobdb[id] ? mobLink(id) : esc(id)}</td><td class="num">${fmt(c.kills)}</td><td class="num">${c.players}</td>
      <td class="num">${c.mesoDrops ? fmt(c.mesos / c.mesoDrops) : "–"}</td><td>${shown || '<span class="sub">none yet</span>'}${items.length > 6 ? ` <span class="sub">+${items.length - 6} more</span>` : ""}</td></tr>`;
  }).join("");
  // best time of day per map (3-hour blocks with 3+ players, each run against the player's own usual speed there)
  const times = Object.entries(s.times || {}).map(([map, t]) => { const b = t.reduce((a, x) => x[1] > a[1] ? x : a); const w = t.reduce((a, x) => x[1] < a[1] ? x : a);
    return `<tr><td>${known(map) ? mapLink(map, D.mapnames[map] ?? D.maps[map][0]) : esc(map)}</td><td>${localHour(b[0])}-${localHour((b[0] + 3) % 24)} <span class="sub">${b[1] >= 1 ? "+" : ""}${Math.round((b[1] - 1) * 100)}%</span></td>
      <td>${localHour(w[0])}-${localHour((w[0] + 3) % 24)} <span class="sub">${Math.round((w[1] - 1) * 100)}%</span></td></tr>` }).join("");
  $("#trkdata").innerHTML = `<div class="trkstats">
      <div class="fact"><b>${fmt(s.runs)}</b><p>15-minute runs</p></div>
      <div class="fact"><b>${fmt(s.players)}</b><p>trackers sharing</p></div>
      <div class="fact"><b>${(+s.hours || 0).toLocaleString()}</b><p>hours of grinding</p></div>
      <div class="fact"><b>${fmt(maps.length)}</b><p>map + party combos</p></div>
      <div class="fact"><b>${fmt(mobs.length)}</b><p>monsters with drops</p></div>
    </div>
    <h3 class="trkh" style="font-size:17px">EXP and mesos by map</h3>
    <p class="note">Median of each player's typical run (players on one home network count once). Mesos/hr is meso drops picked up, before potions. Pots/ammo = mesos/hr spent on potions, food and arrows.</p>
    <div class="tblwrap"><table><thead><tr><th>Map</th><th>Solo/party</th><th class="num">Players</th><th class="num">Levels</th><th class="num">EXP/hr</th><th class="num">Mesos/hr</th><th class="num">Deaths/hr</th><th class="num">Pots/ammo</th></tr></thead><tbody>${mapRows || '<tr><td colspan="8" class="sub">No map runs yet.</td></tr>'}</tbody></table></div>
    <h3 class="trkh" style="font-size:17px">Confirmed drops by monster</h3>
    <p class="note">Items players picked up after killing it, as "1 in N kills". Real drop rates are at least this (not every drop gets picked up). Also shown on each monster's and item's page.</p>
    <div class="tblwrap"><table><thead><tr><th>Monster</th><th class="num">Kills</th><th class="num">Players</th><th class="num">Mesos/drop</th><th>Items</th></tr></thead><tbody>${mobRows || '<tr><td colspan="5" class="sub">No kills with drops yet.</td></tr>'}</tbody></table></div>
    <h3 class="trkh" style="font-size:17px">Best time of day to farm</h3>
    <p class="note">Each run against the same player's usual speed on that map, in 3-hour blocks with 3+ players. Your time zone.</p>
    ${times ? `<div class="tblwrap"><table><thead><tr><th>Map</th><th>Fastest</th><th>Slowest</th></tr></thead><tbody>${times}</tbody></table></div>` : '<p class="sub">Not enough players at different times yet (needs 3+ players in at least two time blocks on a map).</p>'}`;
}
function trkOpen(){
  trkRender();
  if (TRK_ASKED) return; TRK_ASKED = true;
  const ctl = new AbortController(); setTimeout(() => ctl.abort(), 8000);
  fetch(TRK_API, {signal: ctl.signal}).then(r => r.ok ? r.json() : Promise.reject()).then(d => {
    TRK = {...d, rows: trkRows(d.rows, true), live: true}; trkRender();
  }).catch(() => trkRender());
}
$("#t-trk").addEventListener("click", trkOpen);
if (!$("#trk").hidden) trkOpen();
