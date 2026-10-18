// Tracker window: grabs 2 frames a second from the game window, runs the readers, shows the session.
const G = GAMEDATA, $ = s => document.querySelector(s), fmt = n => Math.round(n).toLocaleString();
let FPS = 2;   // drops to 1 a second when reading a frame takes long (big screens, slow PCs)
let session = null, slicer = null, engine = null, video = null, timer = null, settings = {};
const canvas = document.createElement("canvas"), g = canvas.getContext("2d", {willReadFrequently: true});

async function openStream(){
  video?.srcObject?.getTracks().forEach(tr => tr.stop());
  const stream = await navigator.mediaDevices.getDisplayMedia({video: {frameRate: FPS}, audio: false});
  video = document.createElement("video"); video.srcObject = stream; video.muted = true; await video.play();
  await new Promise(r => setTimeout(r, 700));   // first frames can be blank while capture starts
}
// a frame that is (almost) all black: the game window couldn't be captured
function isBlack(){
  const f = grab(), step = Math.max(4, (f.w * f.h / 5000 | 0) * 4);
  for (let i = 0; i < f.d.length; i += step) if (f.d[i] + f.d[i + 1] + f.d[i + 2] > 24) return false;
  return true;
}
async function startCapture(){
  await host.wholeScreen(false); await openStream();
  if (!video.videoWidth) throw new Error("no picture from the game window. Is it minimized? Restore it and press Start again");
  if (isBlack()){
    await host.wholeScreen(true); await openStream();
    $("#status").textContent = isBlack() ? "Capture is black even for the whole screen. Try windowed mode in the game's settings."
      : "Game window came back black, so this is reading the whole screen instead. That only works with the game in full screen.";
  } else $("#status").textContent = "Reading the MapleStory window.";
}
// one full frame now: from the running capture, or a capture opened just for it and closed again (when not tracking,
// a picture for a snapshot or the potion box shouldn't leave the game being captured)
async function oneFrame(){
  if (timer != null && video?.srcObject?.active && video.videoWidth) return grab();
  const st = $("#status").textContent;
  await startCapture();
  try { return grab() } finally { if (timer == null){ video?.srcObject?.getTracks().forEach(tr => tr.stop()); if (/^Reading the MapleStory/.test($("#status").textContent)) $("#status").textContent = st } }
}
function grab(){
  // resize only when the window size changed: setting it every frame reallocates the canvas twice a second
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight){ canvas.width = video.videoWidth; canvas.height = video.videoHeight }
  g.drawImage(video, 0, 0);
  const id = g.getImageData(0, 0, canvas.width, canvas.height);
  return {w: id.width, h: id.height, d: id.data};
}
/* the frame at the game's own size: once the readers found the scale (the game drawn 2x on a 2560 screen), the video is
   drawn shrunk by that much with no smoothing, one pixel per game pixel. 4x fewer pixels to copy and read than the full
   frame (60 ms to 4 ms on Danny's 2560x1440). A full frame every 20 (10 s) checks the scale again. */
let scale = null, fastLeft = 0;
function grabFrame(){
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!scale || scale.w !== vw || scale.h !== vh || fastLeft <= 0) return grab();
  fastLeft--;
  const {k, ox, oy} = scale, W = Math.floor((vw - ox) / k), H = Math.floor((vh - oy) / k);
  if (canvas.width !== W || canvas.height !== H){ canvas.width = W; canvas.height = H }
  g.imageSmoothingEnabled = false;
  g.drawImage(video, ox, oy, W * k, H * k, 0, 0, W, H);
  const id = g.getImageData(0, 0, W, H);
  return {w: W, h: H, d: id.data, k};
}
/* the readers run in a worker so the window never stutters while a frame is read; in the window itself when the worker
   can't start or stops answering. read() resolves to GrindReaders.work's result, or null for a frame that was lost. */
function makeEngine(icons, area){
  const inline = () => { const rd = GrindReaders.createReaders(G, icons); rd.setArea(area);
    return {kind: "window", setArea: a => rd.setArea(area = a), read: async m => GrindReaders.work(rd, m), close(){}} };
  let w = null;
  try { w = new Worker("reader-worker.js") } catch { return inline() }
  let id = 0, waiting = null, eng;
  const fallBack = why => { log("engine", {kind: "window", why}); w.terminate(); waiting?.(null); waiting = null; Object.assign(eng, inline()) };
  w.onmessage = ({data}) => { if (data.id !== id || !waiting) return; const r = waiting; waiting = null; r(data.error ? null : data) };
  w.onerror = e => { e.preventDefault?.(); fallBack(e.message || "worker failed to load") };
  w.postMessage({type: "reset", icons, area});
  return eng = {kind: "worker", close(){ w.terminate(); const r = waiting; waiting = null; r?.(null) },
    setArea(a){ area = a; w.postMessage({type: "area", area: a}) },
    read(m){
      return new Promise(res => {
        waiting = res; id++;
        w.postMessage({...m, type: "frame", id}, [m.frame.d.buffer]);
        const mine = id; setTimeout(() => { if (waiting === res && id === mine) fallBack("no answer in 5 s") }, 5000);
      });
    }};
}
// skip a frame that is exactly the last one (game idle, menus, a frozen capture): up to 4 in a row (2 s), so the
// readers' "read the same twice" checks still come round
let lastPix = null, sameRun = 0;
function sameAsLast(f){
  const p = new Uint32Array(f.d.buffer);
  let same = !!lastPix && lastPix.length === p.length && f.k === lastPix.k;
  for (let i = p.length - 1; same && i >= 0; i--) same = p[i] === lastPix[i];   // bottom up: the status bar changes first
  if (!same){ lastPix = p.slice(); lastPix.k = f.k; sameRun = 0; return false }
  return ++sameRun <= 4 || (sameRun = 0, false);
}

// bug reports: the last 300 log lines and the last 8 frames (one every 3 s, so about 25 s back), saved by "Report a bug"
const LOG = [], RECENT = [];
function log(kind, data){ LOG.push({t: Date.now(), kind, ...data}); if (LOG.length > 300) LOG.shift() }
new MutationObserver(() => { const text = $("#status").textContent; if (LOG.findLast(l => l.kind === "status")?.text !== text) log("status", {text}) }).observe($("#status"), {childList: true, characterData: true, subtree: true});
let lastKeep = 0;
function keepFrame(t){
  if (t - lastKeep < 3000) return;
  lastKeep = t;
  canvas.toBlob(async b => { if (!b) return; RECENT.push({t, bytes: new Uint8Array(await b.arrayBuffer())}); if (RECENT.length > 8) RECENT.shift() }, "image/png");
}

// self-check: for the first 8 s after Start, which readers work right now (8, not 5: the first map read loads the OCR)
let check = null;
const CHECK_MS = 8000;
const allOk = c => c.bar && c.lines && c.map && (c.job || settings.job) && c.use && (c.party || !settings.partyCode);
function renderCheck(){
  const c = check, box = $("#selfcheck");
  if (!c) return box.classList.add("hidden");
  const done = Date.now() - c.t0 > CHECK_MS;
  const rows = [["EXP bar", c.bar, "Not found. Keep the status bar at the bottom of the game on screen; a very small game window can't be read."],
    ["Pickup / EXP lines", c.lines, "None yet. Kill something; if this stays empty, the chat box may be covered or scrolled."],
    ["Map name", c.map, c.mapWhy || "Not read yet."],
    ["Job", settings.job ? "picked by hand" : c.job, c.jobWhy || "Not read yet."],
    ["Potions / arrows", c.use, "No potion, food or arrow counts found. Put your potions on the quick slots (or open the Use tab), or press <b>Show me where my potions are</b> (Settings) and drag a box around them."]];
  if (settings.partyCode || c.party) rows.push(["Party window", c.party && "party of " + c.party, "Not found. Open the party window so the party size is read; without it a party is only guessed from bonus EXP lines."]);
  box.classList.remove("hidden");
  // while checking: one line of ✓ / … per reader; after: what works on one line, a row with the fix for each that doesn't
  const ok = rows.filter(r => r[1]), bad = rows.filter(r => !r[1]);
  box.innerHTML = `<h3>Self-check${done ? "" : " (a few seconds)"}</h3>`
    + (!done ? `<div class="note">${rows.map(([n, v]) => `<span class="${v ? "good" : ""}">${v ? "✓" : "…"} ${n}</span>`).join(" · ")}</div>`
      : (ok.length ? `<div class="note good">✓ ${ok.map(([n, v]) => n + (v === true ? "" : " (" + esc(v) + ")")).join(" · ")}</div>` : "")
        + (bad.length ? `<table>` + bad.map(([n, , why]) => `<tr><td>${n}</td><td class="n slow">✗</td><td class="note">${why}</td></tr>`).join("") + `</table>` : "")
        + `<div class="note">${allOk(c) ? "All readers work." : "✗ = that number isn't tracked until it's fixed; it turns ✓ by itself once it works."}</div>`);
  if (done && !c.ended){
    c.ended = true; log("selfcheck", {bar: !!c.bar, lines: !!c.lines, map: c.map || c.mapWhy, job: c.job || c.jobWhy, use: c.use || null, party: c.party || null});
  }
  if (done && allOk(c) && !c.hiding){ c.hiding = true; setTimeout(() => { if (check === c) box.classList.add("hidden") }, 6000) }   // all fine: out of the way
}

// sharing progress: minutes into the current 15-minute run, and runs sent this session
let runsSent = 0;
function runInfo(){
  const S = slicer?.current?.state, min = S && S.last !== null ? Math.floor((S.last - S.start) / 6e4) : 0;
  return `shared run ${min}/15 min` + (runsSent ? `, ${runsSent} sent` : "");
}
// respawn timers for bosses and slow spawns on this map (respawn times from the game data; players say Mushmom takes longer)
function renderRespawns(){
  const list = session.respawns(Date.now()), box = $("#respawn");
  box.classList.toggle("hidden", !list.length);
  if (!list.length) return;
  const mm = ms => { const m = Math.ceil(ms / 6e4); return m > 60 ? Math.floor(m / 60) + " h " + (m % 60) + " min" : m + " min" };
  box.innerHTML = `<div class="k">Respawns on this map (game data)</div><table>` + list.map(r => `<tr><td>${esc(r.name)}${r.boss ? " (boss)" : ""}</td>
    <td class="n">${r.killed ? r.dueIn > 0 ? "back in ~" + mm(r.dueIn) : "due now" : "every " + mm(r.sec * 1000)}</td></tr>`).join("") + "</table>";
}
function render(){
  const s = session.stats();
  $("#killsHr").textContent = fmt(s.killsHr);
  $("#expHr").textContent = fmt(s.expHr);
  $("#expHr5").textContent = s.expHr5 == null ? "" : "last 5 min: " + fmt(s.expHr5);
  $("#killsEst").textContent = s.killsEstHr == null ? "" : "~" + fmt(s.killsEstHr) + " with missed lines (est.)";
  $("#ttl").textContent = s.toLevelHrs == null ? "-" : s.toLevelHrs < 1 ? Math.round(s.toLevelHrs * 60) + " min" : s.toLevelHrs.toFixed(1) + " h";
  $("#mesosHr").textContent = fmt(s.mesosHr);
  renderRespawns();
  $("#miniExp").textContent = fmt(s.expHr); $("#miniTtl").textContent = $("#ttl").textContent;
  $("#miniNote").textContent = s.expHr5 == null ? "" : "last 5 min: " + fmt(s.expHr5) + " EXP/hr";
  $("#lootHr").textContent = fmt(s.lootHr);
  $("#usedHr").textContent = s.used.length ? fmt(s.usedCostHr) : "-";
  $("#netHr").textContent = (s.used.length ? "net " + fmt(s.netHr) + " mesos/hr (mesos + loot - used)" : "from the quick-slot counts")
    + (s.walletNet != null ? ` · inventory mesos ${s.walletNet >= 0 ? "+" : ""}${fmt(s.walletNet)} (${fmt(s.walletNetHr)}/hr, spending included)` : "");
  $("#used").innerHTML = s.used.map(u => `<tr><td>${esc(u.name)}</td><td class="n">×${u.n}</td><td class="n">${u.total == null ? "price unknown" : fmt(u.total)}</td></tr>`).join("");
  $("#usedEmpty").classList.toggle("hidden", !!s.used.length);
  $("#mesosNet").textContent = s.used.length ? "net " + fmt(s.netHr) + " after potions" : "";
  const bar = session.state.bar;
  $("#lvNow").textContent = s.level ? "Lv " + s.level + (bar ? " · " + bar.pct.toFixed(2) + "%" : "") : "";
  renderState(s);
  $("#deaths").textContent = s.deaths;
  $("#deathNote").textContent = deaths.confirmed || deaths.unseen ? [deaths.confirmed && `${deaths.confirmed} confirmed by the chat line (lost ${fmt(deaths.lost)} EXP)`,
    deaths.unseen && `${deaths.unseen} not seen in chat (chat box hidden, or a misread)`].filter(Boolean).join(" · ") : "EXP bar drops without a level-up";
  // goal level: time left at the current rate and the clock time it lands on
  levelNote(s);
  $("#goalK").textContent = s.goalLevel ? "Level " + s.goalLevel + " in" : "Goal";
  $("#goalV").textContent = s.goalLevel ? s.level >= s.goalLevel ? "reached" : s.toGoalHrs == null ? "-" : hm(s.toGoalHrs) : "-";
  $("#goalAt").textContent = s.toGoalHrs != null && s.toGoalHrs < 48 ? "about " + new Date(Date.now() + s.toGoalHrs * 3.6e6).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"}) + " at this rate" : s.goalLevel ? "" : "set one in Settings";
  $("#miniGoal").textContent = s.goalLevel && s.toGoalHrs != null ? `Lv ${s.goalLevel} in ${hm(s.toGoalHrs)}` : "";
  stopCheck(s);
  $("#active").textContent = Math.round(s.activeMin) + " min";
  $("#where").textContent = [s.mapName, s.job, s.party > 1 ? "party of " + s.party : "solo",
    s.kills + " kills", fmt(s.mesoPerKill) + " mesos/kill",
    s.readShare != null && Math.round(s.readShare * 100) + "% of EXP seen as messages",
    settings.share && runInfo()].filter(Boolean).join(" · ");
  $("#mobsEmpty").classList.toggle("hidden", !!s.mobs.length); $("#itemsEmpty").classList.toggle("hidden", !!(s.items.length || s.unreadItems));
  $("#mobs").innerHTML = s.mobs.map(m => `<tr><td>${esc(m.name)}</td><td class="n">${m.kills} kills</td><td class="n">${fmt(m.mesoPerKill)} mesos/kill</td></tr>`).join("");
  $("#items").innerHTML = s.items.map(i => `<tr><td>${esc(i.name)}</td><td class="n">×${i.n}</td><td class="n">${fmt(i.total)}</td></tr>`).join("")
    + (s.unreadItems ? `<tr><td colspan="3">${s.unreadItems} pickup(s) with names not read yet</td></tr>` : "");
  $("#priceNote").textContent = G.pwRead ? `Worth = player-shop median from meso.watch (${G.pwRead}), else NPC price. Mesos/kill on maps with several monsters is a best guess.` : "";
  return s.exp;   // for renderSnaps
}

// the line next to Start/Stop: tracking or not, paused, for how long
function renderState(s){
  const on = timer != null, paused = on && s?.paused;
  $("#state").className = paused ? "paused" : on ? "on" : "";
  $("#stateText").textContent = paused ? "Paused" : on ? "Tracking" + (s ? " · " + hm(s.activeMin / 60) + " farmed" : "") : s && s.activeMin ? "Stopped · " + hm(s.activeMin / 60) + " farmed" : "Not tracking";
  $("#go").textContent = on ? "Stop" : "Start"; $("#go").classList.toggle("on", on);
}
// tabs under the numbers; the last one open is remembered
function showTab(name){
  for (const b of document.querySelectorAll(".tabs button")) b.classList.toggle("sel", b.dataset.tab === name);
  for (const sec of document.querySelectorAll("section[data-tab]")) sec.classList.toggle("hidden", sec.dataset.tab !== name);
  try { localStorage.setItem("tab", name) } catch {}
}
for (const b of document.querySelectorAll(".tabs button")) if (b.id !== "histBtn") b.onclick = () => showTab(b.dataset.tab);
try { const t = localStorage.getItem("tab"); if (t && t !== "hist" && t !== "help" && document.querySelector(`section[data-tab="${t}"]`)) showTab(t) } catch {}

// a crop (black-on-white RGBA) -> PNG bytes for the OCR in the main process
async function toPng(c){
  const cv = document.createElement("canvas"); cv.width = c.w; cv.height = c.h;
  cv.getContext("2d").putImageData(new ImageData(c.d, c.w, c.h), 0, 0);
  return new Uint8Array(await (await new Promise(r => cv.toBlob(r, "image/png"))).arrayBuffer());
}
// job from the status bar every 30 s, when the player left the job on "Auto": taken once the same job is read twice running
let lastJob = 0, jobSeen = null, jobNow = null;
async function readJob(c, t){   // c: the status bar text crop (GrindReaders.jobTextCrop), or null
  const sess = session, sl = slicer;
  if (!c){ if (check && !check.job) check.jobWhy = "The level and job text on the status bar wasn't found."; return }
  const text = await host.ocr(await toPng(c)), job = GrindReaders.jobFromText(text);
  log("job", {job});   // not the OCR text: the character name sits in the same box
  if (check && sess === session){ if (!job) check.jobWhy = "The status bar text was found but the job didn't read. Pick it by hand."; else if (!check.job){ check.job = job; check.late = check.ended } }
  if (job && job === jobSeen && job !== jobNow && sess === session && !settings.job){ jobNow = job; const e = {t, type: "job", name: job}; sess.add(e); sl.add(e) }
  jobSeen = job;
}

// map name every 5 s: cut the minimap title out, OCR it in the main process, take it once the same map is read twice in a row
let ocrBusy = false, lastOcr = 0, mapSeen = null, mapNow = null, mapMissing = 0;
async function readMap(c, t){   // c: the minimap title crop (GrindReaders.mapTextCrop), or null
  const sess = session, sl = slicer;   // an OCR that finishes after Stop/Start belongs to the old session
  // no map name for 30 s (minimap closed, moved, covered): the map is unknown from here, not the last one seen
  if (!c){ if (check && !check.map) check.mapWhy = "Minimap not found: it's closed, minimized or covered."; if (++mapMissing === 6 && mapNow && sess){ mapNow = mapSeen = null; const e = {t, type: "map", id: null, name: null}; sess.add(e); sl.add(e) } return }
  mapMissing = 0;
  const text = await host.ocr(await toPng(c)), m = GrindReaders.mapFromText(text, G), key = m && (m.id || m.name);
  log("map", {text, id: m?.id ?? null, name: m?.name ?? null});
  if (check && sess === session){ if (!m) check.mapWhy = "Minimap found, but its name didn't read. Is something over the minimap title?"; else if (!check.map){ check.map = m.name || "map " + m.id; check.late = check.ended } }
  // a map we don't have keeps its name as read, which can differ by a letter between reads: that's still the same map
  const same = (a, b) => a === b || a && b && !G.maps[a] && !G.maps[b] && GrindReaders.similar(a, b) >= 0.75;
  if (key && same(key, mapSeen) && !same(key, mapNow) && sess === session){ mapNow = key; const e = {t, type: "map", id: m.id, name: m.name}; sess.add(e); sl.add(e) }
  mapSeen = key;
}

// after each 15-minute run: how it compares with other players around your level (shared data)
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]);
async function showSpeed(run){
  const sum = await host.summary(), sc = GrindSession.speedCheck(run, sum, G), box = $("#lastRun");
  // best time to farm this map: the 3 hours (your time) when players beat their own usual speed here the most
  const tb = sum?.times?.[String(run.map)], best = Array.isArray(tb) && tb.length ? tb.reduce((a, b) => b[1] > a[1] ? b : a) : null;
  const lh = h => new Date(Date.UTC(2026, 0, 1, h)).toLocaleTimeString([], {hour: "numeric"});
  const bt = best && best[1] >= 1.05 ? `<div class="note">Best time here: ${lh(best[0])}-${lh((best[0] + 3) % 24)}, players farm it ${Math.round((best[1] - 1) * 100)}% faster than usual then (${best[2]} players).</div>` : "";
  box.classList.remove("hidden");
  const band = run.level ? `Lv ${Math.max(1, run.level - 5)}-${run.level + 5} ${run.party > 1 ? "in a party" : "solo"}` : "";
  box.innerHTML = `<div class="k">Last 15-minute run</div><div class="v">${fmt(sc.expHr)} EXP/hr</div>` + (sc.verdict
    ? `<div class="${/good|fast/.test(sc.verdict) ? "good" : sc.verdict === "slow" ? "slow" : ""}">${esc(sc.verdict)} for ${esc(band)} (typical ${fmt(sc.ref)}, ${sc.peers} players)</div>`
      + (sc.faster.length ? `<div class="note">Faster for players like you: ${sc.faster.map(m => `${esc(m.name)} (${fmt(m.expHr)})`).join(", ")}</div>` : "")
    : `<div class="note">${sc.noBar ? "The EXP bar wasn't read during this run, so it isn't compared." : `Not enough shared runs around your level yet to compare (${esc(band) || "level not read"}).`}</div>`) + bt;
}
function beep(hz, sec){
  try {
    audio = audio || new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = hz; g.gain.value = 0.15; o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + sec);
  } catch {}
}
// a beep when something worth at least the set amount is picked up
let audio = null;
function dropAlert(id){
  const min = +settings.alertWorth || 0, worth = G.pw?.[id]?.[0] ?? G.items[id]?.p ?? 0;
  if (!min || worth < min) return;
  beep(880, 0.25);
  $("#status").textContent = `Valuable drop: ${G.items[id]?.n || "item " + id} (worth ~${fmt(worth)})`;
}

// party view: every minute, our numbers go up with the party code and everyone's come back
let lastParty = 0, partyBusy = false;
async function sendParty(){
  const s = session.stats(), box = $("#partyBox");
  const r = await host.party({job: s.job, level: s.level, mapName: s.mapName, expHr: s.expHr, expHr5: s.expHr5, killsHr: s.killsHr, mesosHr: s.mesosHr,
    active: Math.round(s.activeMin)}).catch(() => null);
  if (!r || timer == null) return;   // stopped while the answer was on its way: don't bring the card back
  box.classList.remove("hidden"); $("#miniParty").textContent = "";
  if (r.error){ box.innerHTML = `<div class="k">Party</div><div class="note">${r.why === "party full" ? "Party full: 6 trackers already use this code." : r.why === "too often" ? "Waiting a moment before updating." : "Party view didn't answer (" + esc(r.why || r.error) + ")."}</div>`; return }
  $("#miniParty").textContent = `party: ${fmt(r.expHr)} EXP/hr together (${r.members.length})`;
  box.innerHTML = `<div class="k">Party "${esc(settings.partyCode)}": ${fmt(r.expHr)} EXP/hr together</div><table>` + r.members.map(m =>
    `<tr><td>${m.you ? "<b>you</b>" : esc(m.nick || m.job || "member")}${m.nick && !m.you && m.job ? ` <span class="note">${esc(m.job)}</span>` : ""}${m.level ? " Lv " + m.level : ""}</td>
    <td class="n">${fmt(m.expHr || 0)}/hr</td><td class="n note">${m.expHr5 != null ? "5 min: " + fmt(m.expHr5) : ""}</td></tr>`).join("")
    + `</table><div class="note">Each member's own EXP/hr, updated every minute. Members who stopped drop off after 3 minutes.</div>`;
}

// EXP stopped: one low beep when no EXP for 2 minutes after some came in; again only after EXP comes back and stops again
let stopWarned = false;
function stopCheck(s){
  if (settings.stopBeep === false || !s.lastExpT) return;
  const quiet = Date.now() - s.lastExpT > 120e3;
  if (quiet && !stopWarned){ stopWarned = true; beep(330, 0.6); $("#status").textContent = "No EXP for 2 minutes. Died, disconnected, or someone took the map?" }
  if (!quiet) stopWarned = false;
}

// auto-pause: the EXP bar and the minimap both gone for 3 s (Cash Shop, changing channel, loading) = not farming. Only
// after the bar was read once this session, so a game window the bar reader can't handle never pauses
let barSeen = false, goneSince = null, lastGoneCheck = 0;
function autoPause(minimap, info, t){   // minimap: the minimap is on screen (looked for when the bar isn't)
  if (info.bar) barSeen = true;
  if (settings.autoPause === false || !barSeen) return;
  const paused = session.state.pausedAt !== null;
  if (info.bar){ goneSince = null; if (paused){ const e = {t, type: "resume"}; session.add(e); slicer.add(e); log("event", e); $("#status").textContent = "Back in the game: tracking again." } return }
  if (paused || t - lastGoneCheck < 1000) return;
  lastGoneCheck = t;
  if (minimap){ goneSince = null; return }   // minimap still there: just the bar covered
  goneSince ??= t;
  if (t - goneSince >= 3000){
    const e = {t: Math.max(goneSince, session.state.last || 0), type: "pause"}; session.add(e); slicer.add(e); log("event", e);
    $("#status").textContent = "Paused: the game screen is gone (Cash Shop, changing channel or loading). Resumes by itself.";
  }
}
// a level-up: how long the last level took
let levelsShown = 0;
function levelNote(s){
  if (s.levelUps.length <= levelsShown) return;
  const l = s.levelUps.at(-1); levelsShown = s.levelUps.length;
  $("#status").textContent = `Level ${l.level}!` + (l.activeMin != null ? ` Level ${l.level - 1} took ${hm(l.activeMin / 60)} of farming.` : "");
}
const hm = h => h < 1 ? Math.round(h * 60) + " min" : h.toFixed(1) + " h";

let slowTicks = 0, skipped = 0;
async function tick(){
  if (timer == null) return;   // stopped
  const t = Date.now(), eng = engine, sess = session;
  try {
    // game closed: the capture ends and the last frame would be read forever; minimized: no picture until it's back
    if (!video.srcObject?.active){ $("#status").textContent = "The game window closed. Press Stop, then Start once it's back."; throw null }
    if (!video.videoWidth){ $("#status").textContent = "No picture from the game (minimized?). Waiting..."; throw null }   // skip this tick
    const f = grabFrame();
    keepFrame(t);
    if (sameAsLast(f)){ skipped++; throw null }
    // one OCR at a time (the first can take seconds): a death check first, the map every 5 s, the job every 30 s in between
    const want = {};
    if (!ocrBusy){
      if (deathPending && t - deathPending.last >= 1000){ deathPending.last = t; want.chat = true }
      else if (t - lastOcr > 5000){ lastOcr = t; want.map = true }
      else if (!settings.job && t - lastJob > 30e3){ lastJob = t; want.job = true }
    }
    const r = await eng.read({frame: f, t, want});
    if (timer == null || sess !== session || !r) throw null;   // stopped (or restarted) while reading, or the frame was lost
    if (r.scale){ scale = r.scale; fastLeft = 19 }   // also at 1x: finding the scale is the slow part, so it's checked every 20 frames only
    for (const e of r.ev){
      session.add(e); slicer.add(e); log("event", e);
      if (e.type === "item") dropAlert(e.id);
      if (e.type === "bar"){
        if (!snaps.start) snap("start", null, false).catch(() => {});
        else if (!snaps.end?.hand) snaps.end = {t, level: e.level || session.state.level, pct: e.pct, exp: e.exp, hand: false};
      }
      if (check && e.type === "bar" && !check.bar){ check.bar = e.level ? "Lv " + e.level + ", " + e.pct + "%" : e.pct + "%"; check.late = check.ended }
      if (check && /^(exp|bonus|meso|item|itemraw)$/.test(e.type) && !check.lines){ check.lines = true; check.late = check.ended }
    }
    const info = r.info;
    if (check && info.useSpots && !check.use){ check.use = info.useSpots + " item count" + (info.useSpots > 1 ? "s" : ""); check.late = check.ended }
    if (check && info.partyWindow > 1 && !check.party){ check.party = info.partyWindow; check.late = check.ended }
    autoPause(r.minimap, info, t);
    if (check && (!check.ended || check.late)){ check.late = false; renderCheck() }   // a ✗ turns ✓ when it starts working
    if (session.state.deaths > deathSeen){ deathSeen = session.state.deaths; deathPending = {t, tries: 0, last: 0} }
    const ocr = fn => { ocrBusy = true; fn.catch(() => {}).finally(() => ocrBusy = false) };
    if (want.chat) ocr(checkDeath(r.crops.chat, t));
    else if (want.map) ocr(readMap(r.crops.map, t));
    else if (want.job) ocr(readJob(r.crops.job, t));
    if (t - lastParty > 60e3 && settings.partyCode && !partyBusy){ lastParty = t; partyBusy = true; sendParty().catch(() => {}).finally(() => partyBusy = false) }
  } catch (err){ if (err) $("#status").textContent = "Reading a frame failed (" + err.message + "); still going." }   // one bad frame never stops tracking
  if (timer == null || sess !== session) return;
  try { renderSnaps(render()) } catch {}
  // over 250 ms a frame, 10 times running: read once a second instead of twice
  const ms = Date.now() - t;
  slowTicks = ms > 250 ? slowTicks + 1 : 0;
  if (slowTicks >= 10 && FPS === 2){ FPS = 1; $("#status").textContent = "Reading once a second to keep your PC smooth (big screen)." }
  timer = setTimeout(tick, Math.max(50, 1000 / FPS - ms));
}

// start/end snapshots: {t, level, pct, exp?, file?, hand?}; a hand-fixed or button snapshot isn't replaced by the automatic ones
const snaps = {start: null, end: null};
const clock = t => new Date(t).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});
function renderSnaps(live = session?.stats().exp){   // live: EXP the live count added up over (about) the same stretch
  for (const [i, k] of [[0, "start"], [1, "end"]]){
    const sn = snaps[k], lv = $("#s" + i + "lv"), pc = $("#s" + i + "pct");
    if (document.activeElement !== lv) lv.value = sn?.level ?? "";
    if (document.activeElement !== pc) pc.value = sn?.pct ?? "";
    $("#s" + i + "t").textContent = sn ? clock(sn.t) + (sn.file ? " · saved" : "") : "";
  }
  const a = snaps.start, b = snaps.end, d = a && b && b.t > a.t ? GrindSession.expBetween(G, a, b) : null, hrs = a && b ? (b.t - a.t) / 3.6e6 : 0;
  $("#snapRate").textContent = d != null && hrs > 0 ? fmt(d / hrs) + " EXP/hr" : "-";
  // mini bar: the snapshot rate too, so the small view isn't only the live count (render() rewrites the note each tick first)
  if (d != null && hrs > 0.05 && timer != null) $("#miniNote").textContent += ($("#miniNote").textContent ? " · " : "") + "start to now: " + fmt(d / hrs) + " EXP/hr";
  $("#snapNote").textContent = d == null ? (a && b ? "Can't work it out: check the levels (a level or % is missing, or the end is before the start)." : "")
    : `${fmt(d)} EXP in ${Math.round(hrs * 60)} min (clock time, breaks included)`
      + (live && d > 0 && !a.hand && !b.hand && Math.abs(live - d) > 0.25 * d ? ` · the live count added up ${fmt(live)} EXP; the snapshots are the safer number` : "");
}
// take a snapshot from the game picture now: the EXP bar's level and %, the time, and the frame saved as a picture
async function snap(which, f = null, hand = true){
  f ||= await oneFrame();
  const img = GrindReaders.native(f), bar = GrindReaders.readBar(img) || GrindReaders.readBarAny(f);
  const level = bar && (GrindSession.levelOf(G, bar.exp, bar.pct) || session?.state.level) || null;
  // an automatic snapshot whose bar didn't read keeps the last good reading (only the picture is new)
  const sn = !bar && !hand && snaps[which]?.level ? {...snaps[which]} : {t: Date.now(), level, pct: bar ? bar.pct : null, exp: bar && level ? bar.exp : undefined, hand};
  snaps[which] = sn;
  try {
    const c = document.createElement("canvas"); c.width = f.w; c.height = f.h; c.getContext("2d").putImageData(new ImageData(f.d, f.w, f.h), 0, 0);
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    await host.saveFrame(`snap-${which}-${new Date(sn.t).toISOString().slice(0, 19).replace(/:/g, "-")}.png`, new Uint8Array(await blob.arrayBuffer()));
    sn.file = true;
  } catch {}
  if (hand) $("#status").textContent = bar ? `Snapshot (${which}): Lv ${level ?? "?"}, ${bar.pct}%.` : `Snapshot (${which}) taken, but the EXP bar didn't read: type the level and % in by hand.`;
  renderSnaps();
}
for (const [i, k] of [[0, "start"], [1, "end"]]){
  $("#snap" + (i ? "End" : "Start")).onclick = () => snap(k).catch(e => { $("#status").textContent = "Couldn't take the snapshot: " + e.message });
  // typed by hand: the level and % win over what was read; the EXP number goes (it was for the old reading)
  for (const f of ["lv", "pct"]) $("#s" + i + f).onchange = () => {
    const lv = +$("#s" + i + "lv").value || null, pc = $("#s" + i + "pct").value === "" ? null : +$("#s" + i + "pct").value;
    snaps[k] = {t: snaps[k]?.t || Date.now(), level: lv, pct: pc, hand: true, file: snaps[k]?.file};
    renderSnaps();
  };
}

// deaths: each EXP bar drop is checked against the chat box's "You have lost N EXP for dying" line (OCR, up to 3 tries a
// second apart). Confirmed ones carry the exact EXP lost. The OCR text isn't logged: chat lines hold player names.
let deathSeen = 0, deathPending = null;
const deaths = {confirmed: 0, lost: 0, unseen: 0};
async function checkDeath(c, t){   // c: the chat box crop (GrindReaders.chatCrop)
  const sess = session, text = await host.ocr(await toPng(c)), lost = GrindReaders.deathFromText(text);
  if (sess !== session || !deathPending) return;
  if (lost){ deaths.confirmed++; deaths.lost += lost; deathPending = null; log("death", {lost}) }
  else if (++deathPending.tries >= 3){ deaths.unseen++; deathPending = null; log("death", {lost: null}) }
}

// "Show me where my potions are": freeze the game picture, drag a box (snip window), then counts are only read in there.
// Saved in the settings, so it holds for the next sessions too.
async function pickArea(){
  const f = await oneFrame();
  ICONS ||= await GrindReaders.loadIcons(G).catch(() => []);
  const c = document.createElement("canvas"); c.width = f.w; c.height = f.h; c.getContext("2d").putImageData(new ImageData(f.d, f.w, f.h), 0, 0);
  const rect = await host.snip(c.toDataURL("image/jpeg", 0.9));
  if (!rect) return;
  settings = await host.settings({countArea: rect}); engine?.setArea(rect);
  // read it right away so the player knows whether it worked
  const rd = GrindReaders.createReaders(G, ICONS); rd.setArea(rect);
  const img = GrindReaders.native(f), n = GrindReaders.readCounts(img, rd.areaPx(img)), known = n.filter(x => GrindReaders.iconAt(img, x, ICONS));
  $("#status").textContent = !n.length ? "No item counts found in that box. Try a bigger box around the slots, with the numbers inside."
    : `Found ${n.length} count${n.length > 1 ? "s" : ""} there (${known.length} potion, food or arrow). Only that part of the screen is read for them now.`;
  if (check && known.length && !check.use){ check.use = known.length + " item count" + (known.length > 1 ? "s" : "") + " (your box)"; check.late = check.ended; renderCheck() }
  showArea();
}
function showArea(){
  const a = settings.countArea;
  $("#areaClear").classList.toggle("hidden", !a);
  $("#areaNote").textContent = a ? "Reading counts only in your box." : "";
}
$("#snipBtn").onclick = () => pickArea().catch(e => { $("#status").textContent = "Couldn't take the picture: " + e.message });
$("#areaClear").onclick = async () => { settings = await host.settings({countArea: null}); engine?.setArea(null); showArea() };

let starting = false, ICONS = null;
async function start(){
  if (starting) return;   // a double click starts one capture, not two
  starting = true; $("#status").className = "";
  FPS = 2; slowTicks = 0;   // before the capture opens: it runs at FPS frames a second
  try { await startCapture(); ICONS ||= await GrindReaders.loadIcons(G).catch(() => []) }   // once: potion/arrow pictures for the counts
  finally { starting = false }
  timer = 0;   // running (the first tick sets the real timeout)
  session = GrindSession.createSession(G, {idleMs: (settings.idleSec || 60) * 1000, goalLevel: settings.goal || 0}); stopWarned = false;
  // every 15 minutes of non-stop farming on one map with the same party is one shared run (when sharing is on)
  slicer = GrindSession.createRunSlicer(G, {idleMs: 60e3, onRun: run => { if (settings.share){ runsSent++; host.shareRun({...run, partyCode: settings.partyCode || null}) } showSpeed(run) }});
  check = {t0: Date.now()}; lastKeep = 0; RECENT.length = 0; log("start", {fps: FPS, w: video.videoWidth, h: video.videoHeight});
  barSeen = false; goneSince = null; levelsShown = 0; deathSeen = 0; deathPending = null; Object.assign(deaths, {confirmed: 0, lost: 0, unseen: 0});
  snaps.start = snaps.start?.hand && Date.now() - snaps.start.t < 60e3 ? snaps.start : null; snaps.end = null;   // a start snapped just before Start is kept
  engine = makeEngine(ICONS, settings.countArea || null); scale = null; fastLeft = 0; lastPix = null; skipped = 0; log("engine", {kind: engine.kind});
  mapNow = mapSeen = null; mapMissing = 0; jobNow = jobSeen = null; lastJob = 0; lastParty = 0; runsSent = 0; FPS = 2; slowTicks = 0;
  // a job picked by hand wins; "Auto" reads it from the status bar
  if (settings.job){ const e = {t: Date.now(), type: "job", name: settings.job}; session.add(e); slicer.add(e) }
  tick();
  renderState(null);
}
let stopping = false;
async function stop(){
  if (stopping) return;   // a double click saves one session, not two (the end picture takes a moment)
  stopping = true;
  try { await stopNow() } finally { stopping = false }
}
async function stopNow(){
  log("stop", {engine: engine?.kind, skipped});
  if (video?.srcObject?.active && video.videoWidth && !snaps.end?.hand) await snap("end", grab(), false).catch(() => {}); if (check && !check.ended){ check = null; renderCheck() }
  clearTimeout(timer); timer = null; engine?.close(); $("#partyBox").classList.add("hidden"); $("#miniParty").textContent = "";
  video?.srcObject?.getTracks().forEach(tr => tr.stop());
  // a failed save (disk full, folder locked) must not leave the button saying Stop
  if (session && session.state.events) await host.saveSession({shared: !!settings.share, ...session.shareable(), levelUps: session.state.levelUps.map(({t, ...l}) => l)}).catch(e => { $("#status").textContent = "Couldn't save this session: " + e.message });
  renderState(session?.stats());
}
$("#go").onclick = () => timer != null ? stop() : start().catch(e => { $("#status").textContent = "Couldn't capture the game: " + e.message; $("#status").className = "bad" });

// one full frame every 3 s for 3 minutes, saved as PNG: material for building and testing the readers
$("#frames").onclick = async () => {
  $("#frames").disabled = true;   // one batch at a time
  try { if (!video?.srcObject?.active) await startCapture() }   // stopped tracks only give the last frame
  catch (err){ $("#frames").disabled = false; $("#status").textContent = "Couldn't capture the game: " + err.message; return }
  let n = 0, dir = null;
  // done: the capture closes again unless tracking runs on it
  const done = () => { clearInterval(iv); $("#frames").disabled = false; if (timer == null) video?.srcObject?.getTracks().forEach(tr => tr.stop()) };
  const iv = setInterval(async () => {
    try {
      if (!video.videoWidth || !video.srcObject?.active) throw new Error("capture stopped (Stop pressed or game closed)");
      canvas.width = video.videoWidth; canvas.height = video.videoHeight; g.drawImage(video, 0, 0);
      const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
      dir = await host.saveFrame(`frame-${String(n).padStart(3, "0")}.png`, new Uint8Array(await blob.arrayBuffer()));
      $("#status").textContent = `Saving sample frames: ${n + 1}/60`;
      if (++n >= 60){ done(); $("#status").textContent = "Frames saved."; host.openFolder(dir) }
    } catch (err){ done(); $("#status").textContent = `Stopped saving frames after ${n}: ${err.message}` }
  }, 3000);
};

// "Report a bug": the last frames and log lines into one folder, opened for sending
$("#report").onclick = async () => {
  const s = session?.stats(), note = $("#reportNote").value.trim().slice(0, 2000);
  try {
    const dir = await host.saveReport(RECENT.map((f, i) => ({name: `frame-${i}-${new Date(f.t).toISOString().slice(11, 19).replace(/:/g, "")}.png`, bytes: f.bytes})),
      {note, running: timer != null, fps: FPS, check, stats: s && {...s, mobs: s.mobs.length, items: s.items.length}, log: LOG});
    $("#status").textContent = `Bug report saved (${RECENT.length} frames + log). Send that folder to Danny.`; $("#reportNote").value = "";
    host.openFolder(dir);
  } catch (e){ $("#status").textContent = "Couldn't save the bug report: " + e.message }
};

$("#pcode").onchange = e => host.settings({partyCode: e.target.value.trim().slice(0, 20)}).then(s => { settings = s; lastParty = 0; if (!s.partyCode){ $("#partyBox").classList.add("hidden"); $("#miniParty").textContent = "" } });
$("#nick").onchange = e => host.settings({nick: e.target.value.trim().slice(0, 12)}).then(s => settings = s);
const guideDone = share => host.settings({share, guideDone: true}).then(s => { settings = s; $("#share").checked = share; $("#guide").classList.add("hidden") });
$("#guideShare").onclick = () => guideDone(true);
$("#guideNo").onclick = () => guideDone(false);
$("#stopBeep").onchange = e => host.settings({stopBeep: e.target.checked}).then(s => settings = s);
$("#goal").onchange = e => { const v = Math.max(0, Math.min(200, Math.round(+e.target.value || 0))); host.settings({goal: v}).then(s => { settings = s; session?.setGoal(v) }) };
$("#alert").onchange = e => host.settings({alertWorth: Math.max(0, +e.target.value || 0)}).then(s => settings = s);
$("#miniBtn").onclick = () => { document.body.classList.add("mini"); host.mini(true) };
$("#mini").onclick = () => { document.body.classList.remove("mini"); host.mini(false) };
$("#histBtn").onclick = () => { showTab("hist"); loadHist() };
async function loadHist(){
  const list = await host.sessions();
  $("#recap").innerHTML = recap(list) + levelLog(list);
  $("#histRows").innerHTML = list.length ? list.slice(0, 30).map(x => { const h = (x.activeMin || 0) / 60;
    return `<tr><td>${esc(x.date)} ${esc(x.mapName || "")}</td><td class="n">${Math.round(x.activeMin || 0)} min</td><td class="n">${h ? fmt(x.exp / h) : "-"} EXP/hr</td>`
      + `<td class="n"><button class="alt del" data-saved="${+x.saved}" title="Delete this session">×</button></td></tr>` }).join("")
    : `<tr><td>No sessions yet: they're saved when you press Stop.</td></tr>`;
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
  return `<div class="note"><b>Last 7 days:</b> ${week.length} session${week.length > 1 ? "s" : ""}, ${(sum("activeMin") / 60).toFixed(1)} h farming, ${fmt(sum("exp"))} EXP, ${fmt(sum("mesos"))} mesos`
    + (lv.length ? `, level ${Math.min(...lv)} → ${Math.max(...lv)}` : "") + `, ${sum("deaths")} death${sum("deaths") === 1 ? "" : "s"}`
    + (best ? `. Fastest map: ${esc(best[0])} (${fmt(best[1].exp / best[1].min * 60)} EXP/hr)` : "") + `</div>`;
}
$("#csv").onclick = async () => { const r = await host.exportCsv(); $("#status").textContent = r?.error || "Saved to Documents: " + (r?.file || "").split(/[\\/]/).pop() };
$("#autoPause").onchange = e => host.settings({autoPause: e.target.checked}).then(s => settings = s);
$("#ontop").onchange = e => host.settings({onTop: e.target.checked}).then(s => settings = s);
$("#share").onchange = e => host.settings({share: e.target.checked}).then(s => settings = s);
$("#job").onchange = e => host.settings({job: e.target.value}).then(s => {
  settings = s; jobNow = jobSeen = null; lastJob = 0;   // back on Auto: read it again soon
  if (session){ const ev = {t: Date.now(), type: "job", name: s.job || null}; session.add(ev); slicer.add(ev) }
});
// updates: "Check for updates" in Settings; a banner on top once one is downloaded. Restarting saves a running session first.
function showUpdate(u){
  if (!u) return;
  const note = {checking: "Checking...", latest: "You have the latest version.", downloading: `Downloading ${u.version ? "version " + u.version : "the update"}${u.pct ? " (" + u.pct + "%)" : ""}...`,
    ready: `Version ${u.version} is ready.`, dev: "Running from source: no updates here.", error: "Couldn't check: " + (u.why || "no connection") + "."}[u.state];
  if (note) $("#updNote").textContent = note;
  $("#updCheck").disabled = u.state === "checking" || u.state === "downloading";
  $("#updBanner").classList.toggle("hidden", u.state !== "ready");
  $("#updInstall").classList.toggle("hidden", u.state !== "ready");
  $("#updText").textContent = `Update ${u.version || ""} is ready.`;
}
host.onUpdate?.(showUpdate);
// Help: the ? button, F1 or Help in the menu; Close goes back to the tab that was open
let beforeHelp = "session";
function openHelp(){
  const cur = document.querySelector(".tabs button.sel")?.dataset.tab;
  if (cur && cur !== "help") beforeHelp = cur;
  document.body.classList.remove("mini"); host.mini?.(false);
  showTab("help"); $("#help").scrollIntoView();
}
$("#helpBtn").onclick = openHelp;
$("#helpClose").onclick = () => showTab(beforeHelp);
document.addEventListener("keydown", e => { if (e.key === "F1"){ e.preventDefault(); openHelp() } });
host.onMenu?.(what => {
  if (what === "help") openHelp();
  else if (what === "mini") $("#miniBtn").click();
  else if (what === "update" || what === "report"){ showTab("settings"); (what === "update" ? $("#updCheck") : $("#reportNote")).scrollIntoView(); if (what === "update") $("#updCheck").click(); else $("#reportNote").focus() }
});
$("#updCheck").onclick = async () => { $("#updNote").textContent = "Checking..."; showUpdate(await host.updateCheck?.()) };
// Install (Settings) and Restart and update (the banner, which stays on top while scrolling) do the same
$("#updInstall").onclick = () => $("#updGo").click();
$("#updGo").onclick = async () => {
  $("#updGo").disabled = true; $("#updInstall").disabled = true; $("#updNote").textContent = "Installing... the tracker closes and opens again by itself.";
  if (timer != null){ $("#status").textContent = "Saving this session before the update..."; await stop() }
  if (!await host.updateInstall?.()){ $("#updGo").disabled = $("#updInstall").disabled = false; $("#status").textContent = "The update isn't ready yet." }
};
(async () => {
  host.version?.().then(v => { if (!v) return; $("#appVer").textContent = v; $("#helpVer").textContent = "MS Classic Grind Tracker " + v }).catch(() => {});
  host.updateState?.().then(u => u.state !== "idle" && showUpdate(u)).catch(() => {});
  settings = await host.settings();
  $("#share").checked = !!settings.share;
  $("#job").value = settings.job || "";
  $("#ontop").checked = settings.onTop !== false; showArea();
  $("#alert").value = settings.alertWorth || 0;
  $("#stopBeep").checked = settings.stopBeep !== false;
  $("#autoPause").checked = settings.autoPause !== false;   // on unless turned off   // on unless turned off
  $("#goal").value = settings.goal || "";
  $("#pcode").value = settings.partyCode || "";
  $("#nick").value = settings.nick || "";
  $("#guide").classList.toggle("hidden", !!settings.guideDone);
  const found = await host.gameFound();
  $("#status").textContent = found ? "MapleStory window found." : "Start MapleStory, then press Start.";
})();
