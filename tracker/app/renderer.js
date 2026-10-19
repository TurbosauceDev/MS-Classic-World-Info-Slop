// Tracker window: grabs 2 frames a second from the game window, runs the readers, shows the session.
// Split by area into renderer-layout.js, -live.js, -run.js, -history.js, -settings.js (loaded in that order by index.html).
const G = GAMEDATA, $ = s => document.querySelector(s), fmt = n => Math.round(n).toLocaleString();
// the game's meso coin (cut from the inventory window, 12x12) in front of meso amounts, and item pictures in the loot lists
const COIN = `<img class="coin" alt="mesos" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAABfUlEQVR42m2SP09TYRTGf+/bWxu4xV5A00H+DiwO1BAGNjdMnE1c+B5+AhONsvAVjLCwuZimxIRQIgkofwaDTUVJwBS1ty2xCbT3fRhKbzXhmU5Onifn5PyO4X8JIGHBM52GE7QcpmuIC2tQ5MpAFfgI9Q+gJM5NkrrzgrZ6XqxBUlEKn6i85ut7ISWVfLlyVoeFe9Lv1+q7nm4BRW4fakt828kznBY+/ZT2m4Ahm2mj4xXevBoFkLUWYJfyToFGtcXleZpb6QxHR6Lxx4A8vvz4xFRupLsNQIMETSYnAvY+n/F17xTjoLRbobh5wv2Hs731PQOEG/TbNkbwIDdIWL8EIDx3PHqchciLAx4ClOZvK8nB+k+CTO98wW1Ye1dhfOIC6093AnJQOR4jsgPkZpo0wk6gWoexKcv0yDBJM8fyarVHyzNI4XPVtnxF2xn9ygfKL6J26a50Nq+t90/VhRrD6AO9fTnOYJD6B3uC09oQC8+Ksdfc9Bo3KPZdAcyooNdmNWPbAAAAAElFTkSuQmCC">`;
const ico = id => { const b = G.iicons?.[id] || G.icons?.[id]; return b ? `<img class="ico" alt="" src="data:image/png;base64,${b}">` : `<span class="ico"></span>` };
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]);
let FPS = 2;   // drops to 1 a second when reading a frame takes long (big screens, slow PCs)
let session = null, slicer = null, engine = null, video = null, timer = null, settings = {};
const canvas = document.createElement("canvas"), g = canvas.getContext("2d", {willReadFrequently: true});

async function openStream(){
  video?.srcObject?.getTracks().forEach(tr => tr.stop());
  const stream = await navigator.mediaDevices.getDisplayMedia({video: {frameRate: FPS}, audio: false});
  video = document.createElement("video"); video.srcObject = stream; video.muted = true;
  // a capture that never sends a frame (a minimized game window) left play() waiting for good and Start dead (2026-10-19)
  const play = video.play(); play.catch(() => {});
  if (!await Promise.race([play.then(() => true), new Promise(r => setTimeout(r, 5000, false))])){
    stream.getTracks().forEach(tr => tr.stop()); throw new Error("no picture from the game window. Is it minimized? Restore it and press Start again") }
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
  try { return grab() } finally { if (timer == null){ video?.srcObject?.getTracks().forEach(tr => tr.stop()); if (/^Reading the MapleStory/.test($("#status").textContent) && st !== $("#status").textContent){ statusUndo = true; $("#status").textContent = st } } }
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
function makeEngine(icons, area, invHint, glyphs, invLast){
  const inline = () => { GrindReaders.addGlyphs(glyphs); const rd = GrindReaders.createReaders(G, icons); rd.setArea(area); rd.setInvHint(invHint); rd.setInvLast(invLast);
    (ALL_ICONS ||= GrindReaders.loadIcons(G, G.iicons).catch(() => null)).then(l => l && rd.setInvIcons(l));
    return {kind: "window", setArea: a => rd.setArea(area = a), invNow: () => rd.invNow(), setInvHint: a => rd.setInvHint(invHint = a), read: async m => GrindReaders.work(rd, m), close(){}} };
  let w = null;
  try { w = new Worker("reader-worker.js") } catch { return inline() }
  let id = 0, waiting = null, eng;
  const fallBack = why => { log("engine", {kind: "window", why}); w.terminate(); waiting?.(null); waiting = null; Object.assign(eng, inline()) };
  w.onmessage = ({data}) => { if (data.id !== id || !waiting) return; const r = waiting; waiting = null; r(data.error ? null : data) };
  w.onerror = e => { e.preventDefault?.(); fallBack(e.message || "worker failed to load") };
  w.postMessage({type: "reset", icons, area, invHint, glyphs, invLast});
  return eng = {kind: "worker", close(){ w.terminate(); const r = waiting; waiting = null; r?.(null) },
    setArea(a){ area = a; w.postMessage({type: "area", area: a}) },
    invNow(){ w.postMessage({type: "invnow"}) }, setInvHint(a){ invHint = a; w.postMessage({type: "invhint", area: a}) },
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
let lastPix = null, sameRun = 0, ALL_ICONS = null;   // every item picture, decoded once when the worker can't run
function sameAsLast(f){
  const p = new Uint32Array(f.d.buffer);
  let same = !!lastPix && lastPix.length === p.length && f.k === lastPix.k;
  for (let i = p.length - 1; same && i >= 0; i--) same = p[i] === lastPix[i];   // bottom up: the status bar changes first
  if (!same){ lastPix = p.slice(); lastPix.k = f.k; sameRun = 0; return false }
  return ++sameRun <= 4 || (sameRun = 0, false);
}

// bug reports: the last 300 log lines and the last 8 frames (one every 3 s, so about 25 s back), saved by "Report a bug"
const LOG = [], RECENT = [];
let wrap = null, runT0 = 0, held = false;   // held: paused by hand (Pause); wrap: {t} after Stop, until End run (the end inventory look); runT0: when Start was pressed
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
  $("#mesosHr").innerHTML = mz(s.mesosHr);
  renderRespawns();
  $("#miniExp").textContent = fmt(s.expHr); $("#miniTtl").textContent = $("#ttl").textContent; $("#miniMeso").innerHTML = mz(s.mesosHr);
  $("#miniNote").textContent = s.expHr5 == null ? "" : "last 5 min: " + fmt(s.expHr5) + " EXP/hr";
  $("#lootHr").innerHTML = mz(s.lootHr);
  const anyUsed = s.used.some(u => u.n);
  $("#usedHr").innerHTML = anyUsed ? sgm(-s.usedCostHr) : "-";
  $("#netHr").innerHTML = anyUsed ? "net " + sgm(s.netHr) + "/hr (mesos + loot - used)" : "from the quick-slot counts";
  // "Left": how many there are now (quick slots, or every stack on the Use tab the last time it showed)
  $("#used").innerHTML = s.used.length ? `<tr class="th"><td>Item</td><td class="n">Used</td><td class="n">Left</td><td class="n">Each</td><td class="n">Cost</td></tr>`
    + s.used.map(u => `<tr><td>${ico(u.id)}${esc(u.name)}</td><td class="n">×${fmt(u.n)}</td><td class="n" title="How many you have now (quick slot, or all stacks on the Use tab when it was last open)">${u.have == null ? "<span class=dim>?</span>" : fmt(u.have)}</td><td class="n dim">${u.free ? "free (drop)" : u.each == null ? "?" : mz(u.each)}</td><td class="n">${u.total == null ? "price unknown" : sgm(-u.total)}</td></tr>`).join("")
    + `<tr class="tot"><td>Total</td><td class="n">×${fmt(s.used.reduce((a, u) => a + u.n, 0))}</td><td></td><td></td><td class="n">${sgm(-s.usedCost)}</td></tr>` : "";
  $("#usedEmpty").classList.toggle("hidden", !!s.used.length);
  $("#mesosNet").innerHTML = anyUsed ? "net " + sgm(s.netHr) + "/hr after potions" : "";
  renderMesos(s);
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
  $("#goalAt").textContent = s.toGoalHrs != null && s.toGoalHrs < 48 ? "about " + new Date(Date.now() + s.toGoalHrs * 3.6e6).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"}) + " at this rate" : s.goalLevel ? "" : "set one in Alerts and goal";
  $("#miniGoal").textContent = s.goalLevel && s.toGoalHrs != null ? `Lv ${s.goalLevel} in ${hm(s.toGoalHrs)}` : "";
  stopCheck(s);
  $("#active").textContent = Math.round(s.activeMin) + " min";
  $("#expTotal").textContent = fmt(s.exp); $("#expPerMin").textContent = s.activeMin >= 1 ? fmt(s.exp / s.activeMin) + " EXP/min active" : "";
  $("#kpqNote").textContent = kpqText(s);
  $("#where").innerHTML = [kpq?.on && "KPQ (" + esc(settings.kpqMode || "Bonus") + ")", s.mapName && esc(s.mapName), s.job && esc(s.job), s.party > 1 ? "party of " + s.party : "solo",
    kills(s.kills), mz(s.mesoPerKill) + "/kill",
    s.readShare != null && Math.round(s.readShare * 100) + "% of EXP seen as messages",
    settings.share && esc(runInfo())].filter(Boolean).join(" · ");
  $("#mobsEmpty").classList.toggle("hidden", !!s.mobs.length); $("#itemsEmpty").classList.toggle("hidden", !!(s.items.length || s.unreadItems));
  $("#mobs").innerHTML = s.mobs.map(m => `<tr><td>${esc(m.name)}</td><td class="n">${kills(m.kills)}</td><td class="n">${mz(m.mesoPerKill)}/kill</td></tr>`).join("");   // party kills whose EXP share fits several monsters aren't listed (Danny, 2026-10-19)
  $("#items").innerHTML = (s.items.length ? `<tr class="th"><td>Item</td><td class="n">Got</td><td class="n">Each</td><td class="n">Worth</td></tr>` : "")
    + s.items.map(i => `<tr><td>${ico(i.id)}${esc(i.name)}${i.inv ? ` <span class="note">(${i.inv} from the inventory)</span>` : ""}</td><td class="n">×${fmt(i.n)}</td><td class="n dim">${mz(i.each)}${i.rough ? `<span class="note" title="Few player-shop sales seen (meso.watch): rough price">?</span>` : ""}</td><td class="n">${sgm(i.total)}</td></tr>`).join("")
    + (s.items.length ? `<tr class="tot"><td>Total</td><td class="n">×${fmt(s.items.reduce((a, i) => a + i.n, 0))}</td><td></td><td class="n">${sgm(s.lootValue)}</td></tr>`
      + (s.lootHi > s.lootLo ? `<tr><td colspan="4" class="note">Likely worth ${mz(s.lootLo)} to ${mz(s.lootHi)} (middle half of player-shop sales, meso.watch)${s.lootRough ? `; ${mz(s.lootRough)} of it is priced from few sales (?)` : ""}</td></tr>` : "") : "")
    + (s.unreadItems ? `<tr><td colspan="3">${s.unreadItems} pickup(s) with names not read yet: ${(s.invTabs?.etc?.last || 0) > (s.invTabs?.etc?.first || 0)
      ? "the Etc tab doesn't show more than the pickup lines already counted, so they're probably Use items (potions) or a misread line. Report a bug right after one shows up so it can be fixed"
      : "open your Etc tab for a second to count them from the inventory"}</td></tr>` : "");
  renderInv(s); renderWrap(s); renderMini(s);
  $("#priceNote").textContent = G.pwRead ? `Worth = player-shop median from meso.watch (${G.pwRead}), else NPC price. Mesos/kill on maps with several monsters is a best guess.` : "";
  return s.exp;   // for renderSnaps
}

