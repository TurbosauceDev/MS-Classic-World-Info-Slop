/* ---------------- Grind Tracker page: the Windows app + what its players shared ---------------- */
// Data: the tracker server's /api/summary. The copy embedded at build (D.shared, scripts/fetch_shared.py) shows first; on
// opening the page we also ask the server for the latest (it allows any site; blocked in some previews, then the copy stays).
const TRK_API = "https://ms-classic-tracker.maplestoryclassic.workers.dev/api/summary";
// rows -> one shape: embedded rows are [map, party 0/1, level, EXP/hr, group, deaths/hr, pots/hr]; the server's are objects
// the live summary is outside data: every number is forced to a finite number (or null) and every text to a string before
// it reaches the page, so a bad or hostile reply can't inject markup or print NaN (bug hunt 2026-10-19)
const tN = v => v == null || v === "" || !isFinite(v) ? null : +v, tI = v => tN(v) ?? 0, tS = v => v == null ? "" : String(v);
const trkRows = (rows, live) => (Array.isArray(rows) ? rows : []).map(r => live ? {map: tS(r.map), name: tS(r.mapName), party: r.party > 1 ? 1 : 0, level: tN(r.level), job: tS(r.job),
  expHr: tN(r.expHr), mesosHr: tN(r.mesosHr), killsHr: tN(r.killsHr), deathsHr: tN(r.deathsHr), usedHr: tN(r.usedHr), group: tS(r.group), runs: tI(r.runs)}
  : {map: r[0], party: r[1], level: r[2], expHr: r[3], group: r[4], deathsHr: r[5], usedHr: r[6]}).filter(r => r.map && r.level > 0);
function trkClean(d){
  d = d && typeof d === "object" ? d : {};
  const obj = v => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const mobs = {}; for (const [id, c0] of Object.entries(obj(d.mobs))){ const c = obj(c0), items = {};
    for (const [i, n] of Object.entries(obj(c.items))) items[i] = tI(n);
    mobs[id] = {kills: tI(c.kills), players: tI(c.players), mesos: tI(c.mesos), mesoDrops: tI(c.mesoDrops), items} }
  const times = {}; for (const [map, t] of Object.entries(obj(d.times))){ const a = (Array.isArray(t) ? t : []).filter(x => Array.isArray(x) && isFinite(x[0]) && isFinite(x[1])).map(x => [+x[0], +x[1]]); if (a.length) times[map] = a }
  const k = obj(d.kpq), board = {};
  for (const m of ["Rush", "Bonus"]) if (Array.isArray(obj(k.board)[m])) board[m] = k.board[m].map(e0 => { const e = obj(e0);
    return {best: tI(e.best), median: tI(e.median), rounds: tI(e.rounds), party: tI(e.party), level: tN(e.level), exp: tI(e.exp), mesos: tI(e.mesos), bonus: tN(e.bonus), clear: tI(e.clear),
      clock: !!e.clock, names: (Array.isArray(e.names) ? e.names : []).map(tS), job: tS(e.job), date: tS(e.date)} });
  const up = new Date(d.updated);
  return {runs: tI(d.runs), players: tI(d.players), hours: tI(d.hours), updated: isNaN(up) ? null : up, rows: trkRows(d.rows, true), mobs, times,
    kpq: {rounds: tI(k.rounds), groups: tI(k.groups), board}, live: true};
}
const trkMapName = r => D.mapnames[r.map] ?? D.maps[r.map]?.[0] ?? r.name ?? r.map;
const trkMed = a => { const v = a.filter(x => x != null); return v.length ? median(v) : null };
let TRK = null, TRK_ASKED = false;
function trkRender(){
  const s = TRK || {...(D.shared || {}), rows: trkRows(D.shared?.rows, false), live: false};
  const src = s.live ? `Live from the tracker server${s.updated ? `, updated ${esc(s.updated.toLocaleString())}` : ""}.`
    : `Snapshot from the tracker server${s.read ? `, read ${esc(s.read)}` : ""}.${TRK_ASKED ? " The live server couldn't be reached from here." : ""}`;
  document.querySelectorAll(".trksrc").forEach(e => e.innerHTML = src);
  $("#trkkpqdata").innerHTML = trkKpq(s.kpq);
  if (!s.runs){
    $("#trkdata").innerHTML = `<div class="card trkempty"><h3>No shared runs yet</h3><p>Every 15 minutes of non-stop farming on one map that a tracker player shares lands here: EXP/hr and mesos/hr by map, confirmed drops by monster, and the best time of day to farm. Be the first: <a href="#" data-go="trk">download the tracker</a> and say yes to sharing.</p></div>`;
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
  const times = Object.entries(s.times || {}).filter(([, t]) => t?.length).map(([map, t]) => { const b = t.reduce((a, x) => x[1] > a[1] ? x : a); const w = t.reduce((a, x) => x[1] < a[1] ? x : a);
    return `<tr><td>${known(map) ? mapLink(map, D.mapnames[map] ?? D.maps[map][0]) : esc(map)}</td><td>${localHour(b[0])}-${localHour((b[0] + 3) % 24)} <span class="sub">${b[1] >= 1 ? "+" : ""}${Math.round((b[1] - 1) * 100)}%</span></td>
      <td>${localHour(w[0])}-${localHour((w[0] + 3) % 24)} <span class="sub">${Math.round((w[1] - 1) * 100)}%</span></td></tr>` }).join("");
  $("#trkdata").innerHTML = `<div class="trkstats">
      <div class="fact"><b>${fmt(s.runs)}</b><p>15-minute runs</p></div>
      <div class="fact"><b>${fmt(s.players)}</b><p>trackers sharing</p></div>
      <div class="fact"><b>${(+s.hours || 0).toLocaleString()}</b><p>hours of grinding</p></div>
      <div class="fact"><b>${fmt(maps.length)}</b><p>map + party combos</p></div>
      <div class="fact"><b>${fmt(mobs.length)}</b><p>monsters with drops</p></div>
    </div>
    <h4 class="trkh4">EXP and mesos by map</h4>
    <p class="note">Median of each player's typical run (players on one home network count once). Mesos/hr is meso drops picked up, before potions. Pots/ammo = mesos/hr spent on potions, food and arrows.</p>
    <div class="tblwrap"><table><thead><tr><th>Map</th><th>Solo/party</th><th class="num">Players</th><th class="num">Levels</th><th class="num">EXP/hr</th><th class="num">Mesos/hr</th><th class="num">Deaths/hr</th><th class="num">Pots/ammo</th></tr></thead><tbody>${mapRows || '<tr><td colspan="8" class="sub">No map runs yet.</td></tr>'}</tbody></table></div>
    <h4 class="trkh4">Confirmed drops by monster</h4>
    <p class="note">Items players picked up after killing it, as "1 in N kills". Real drop rates are at least this (not every drop gets picked up). Also shown on each monster's and item's page.</p>
    <div class="tblwrap"><table><thead><tr><th>Monster</th><th class="num">Kills</th><th class="num">Players</th><th class="num">Mesos/drop</th><th>Items</th></tr></thead><tbody>${mobRows || '<tr><td colspan="5" class="sub">No kills with drops yet.</td></tr>'}</tbody></table></div>
    <h4 class="trkh4">Best time of day to farm</h4>
    <p class="note">Each run against the same player's usual speed on that map, in 3-hour blocks with 3+ players. Your time zone.</p>
    ${times ? `<div class="tblwrap"><table><thead><tr><th>Map</th><th>Fastest</th><th>Slowest</th></tr></thead><tbody>${times}</tbody></table></div>` : '<p class="sub">Not enough players at different times yet (needs 3+ players in at least two time blocks on a map).</p>'}`;
}
// KPQ leaderboards (server summary .kpq, Danny 2026-10-18), one line per party (party code) or player:
// Rush = fastest clear (1st stage to leaving the Last stage, after King Slime); Bonus = rounds that reached the Bonus stage,
// most EXP + mesos gained that round. Names: the character names the party's trackers sent
const TRK_KMODE = {v: "Rush"};
function trkKpq(k){
  const head = `<p class="note">Kerning PQ boards from tracker players. <b>Rush</b>: fastest clear, 1st stage to beating King Slime and leaving the Last stage (Bonus stage not counted). <b>Bonus</b>: rounds that went into the Bonus stage, ranked by EXP + mesos gained that round (1 meso = 1 point, our own weighting); a faster Rush leaves more Bonus time, which shows up as more EXP and mesos. One line per party (same party code) or player. Rounds joined part-way aren't counted.</p>`;
  const modes = ["Rush", "Bonus"].filter(m => k?.board?.[m]?.length);
  if (!k?.rounds || !modes.length) return head + `<div class="card trkempty"><h3>No KPQ rounds yet</h3><p>With sharing on, every KPQ round the tracker sees from the 1st stage to the end lands here. Use the same party code as your party so you show up as one team.</p></div>`;
  if (!modes.includes(TRK_KMODE.v)) TRK_KMODE.v = modes[0];
  const rush = TRK_KMODE.v === "Rush";
  const seg = `<div class="seg" role="radiogroup" id="trkkm">${["Rush", "Bonus"].map(m => `<button role="radio" aria-checked="${m === TRK_KMODE.v}" data-m="${m}"${modes.includes(m) ? "" : " disabled"}>${m}</button>`).join("")}</div>`;
  const who = e => (e.names?.length ? `<b>${e.names.map(esc).join(", ")}</b> <span class="sub">` : "<span>") + (e.party > 1 ? "party of " + e.party : "solo") + "</span>";
  const rank = i => i < 3 ? `<span class="pill ${i ? "p-hot" : "p-good"}">#${i + 1}</span>` : "#" + (i + 1);
  const clockMark = e => e.clock ? "" : ' <span class="sub" title="Timed with the PC clock: the KPQ clock wasn\'t read">~</span>';
  const lj = e => `<td>${e.level ? "Lv " + e.level : "–"}${e.job ? ` <span class="sub">${esc(e.job)}</span>` : ""}</td>`;
  const rows = k.board[TRK_KMODE.v].map((e, i) => rush
    ? `<tr><td class="num">${rank(i)}</td><td class="num"><b>${mss(e.best)}</b>${clockMark(e)}</td><td class="num">${mss(e.median)}</td><td class="num">${e.rounds}</td><td>${who(e)}</td>${lj(e)}<td class="sub">${esc(e.date || "")}</td></tr>`
    : `<tr><td class="num">${rank(i)}</td><td class="num"><b>${fmt(e.best)}</b></td><td class="num">${fmt(e.exp)}</td><td class="num">${fmt(e.mesos)}</td><td class="num">${e.bonus ? mss(e.bonus) : "–"}</td><td class="num">${mss(e.clear)}${clockMark(e)}</td><td class="num">${e.rounds}</td><td>${who(e)}</td>${lj(e)}<td class="sub">${esc(e.date || "")}</td></tr>`).join("");
  const th = rush ? `<th class="num">Rank</th><th class="num">Best clear</th><th class="num">Typical</th><th class="num">Rounds</th><th>Who</th><th>Level and job</th><th>Date</th>`
    : `<th class="num">Rank</th><th class="num">EXP + mesos</th><th class="num">EXP</th><th class="num">Mesos</th><th class="num">Bonus time</th><th class="num">Rush clear</th><th class="num">Rounds</th><th>Who</th><th>Level and job</th><th>Date</th>`;
  return head + `<p class="sub">${fmt(k.rounds)} round${k.rounds === 1 ? "" : "s"} from ${fmt(k.groups)} ${k.groups === 1 ? "party or player" : "parties and players"}.</p>${seg}
    <div class="tblwrap"><table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="sub">${rush ? "" : "EXP and mesos are what the tracker player who sent the best round gained in it. "}Level and job are that tracker player's. "~" = timed with the PC clock.</p>`;
}
const mss = sec => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0") };
$("#trkkpqdata").addEventListener("click", e => { const b = e.target.closest("#trkkm button"); if (b){ TRK_KMODE.v = b.dataset.m; trkRender() } });
// in-page links between the tracker pages (data-go = page id)
for (const id of ["trk", "trkhow", "trkruns", "trkkpq"]) $("#" + id).addEventListener("click", e => { const a = e.target.closest("a[data-go]"); if (!a) return;
  e.preventDefault(); $("#t-" + a.dataset.go).click(); window.scrollTo({top: $("nav").offsetTop - 8}) });
function trkOpen(){
  trkRender();
  if (TRK_ASKED) return; TRK_ASKED = true;
  const ctl = new AbortController(); setTimeout(() => ctl.abort(), 8000);
  fetch(TRK_API, {signal: ctl.signal}).then(r => r.ok ? r.json() : Promise.reject()).then(d => {
    TRK = trkClean(d); trkRender();
  }).catch(() => trkRender());
}
// the data pages ask the server once, on first open
for (const id of ["trkruns", "trkkpq"]){ $("#t-" + id).addEventListener("click", trkOpen); if (!$("#" + id).hidden) trkOpen() }
