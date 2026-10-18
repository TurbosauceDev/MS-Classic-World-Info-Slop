// Tracker window: grabs 2 frames a second from the game window, runs the readers, shows the session.
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
  $("#miniExp").textContent = fmt(s.expHr); $("#miniTtl").textContent = $("#ttl").textContent;
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
  $("#mobs").innerHTML = s.mobs.map(m => `<tr><td>${esc(m.name)}</td><td class="n">${kills(m.kills)}</td><td class="n">${mz(m.mesoPerKill)}/kill</td></tr>`).join("");
  $("#items").innerHTML = (s.items.length ? `<tr class="th"><td>Item</td><td class="n">Got</td><td class="n">Each</td><td class="n">Worth</td></tr>` : "")
    + s.items.map(i => `<tr><td>${ico(i.id)}${esc(i.name)}${i.inv ? ` <span class="note">(${i.inv} from the inventory)</span>` : ""}</td><td class="n">×${fmt(i.n)}</td><td class="n dim">${mz(i.each)}</td><td class="n">${sgm(i.total)}</td></tr>`).join("")
    + (s.items.length ? `<tr class="tot"><td>Total</td><td class="n">×${fmt(s.items.reduce((a, i) => a + i.n, 0))}</td><td></td><td class="n">${sgm(s.lootValue)}</td></tr>` : "")
    + (s.unreadItems ? `<tr><td colspan="3">${s.unreadItems} pickup(s) with names not read yet: ${(s.invTabs?.etc?.last || 0) > (s.invTabs?.etc?.first || 0)
      ? "the Etc tab doesn't show more than the pickup lines already counted, so they're probably Use items (potions) or a misread line. Report a bug right after one shows up so it can be fixed"
      : "open your Etc tab for a second to count them from the inventory"}</td></tr>` : "");
  renderInv(s); renderWrap(s);
  $("#priceNote").textContent = G.pwRead ? `Worth = player-shop median from meso.watch (${G.pwRead}), else NPC price. Mesos/kill on maps with several monsters is a best guess.` : "";
  return s.exp;   // for renderSnaps
}

// inventory: which tabs were read and when (Session tab), and what changed since the first look (Loot tab)
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
// Loot tab: where the mesos came from and went
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
  if (!wrap) return;
  const tabs = (s || session?.stats())?.invTabs || {}, n = INV_TABS.filter(([k]) => tabs[k]?.last >= wrap.t).length;
  $("#wrapTabs").innerHTML = INV_TABS.map(([k, name]) => { const done = tabs[k]?.last >= wrap.t, seeing = !done && lastInvTab === k && Date.now() - (tabs[k]?.last || 0) < 10e3;
    return `<button class="chip ${done ? "ok" : seeing ? "half" : "need"}" data-tab="${k}" title="${done ? "Read after Stop" : "Not read since Stop. Click to read it now (have the " + name + " tab open in the game)"}">${done ? "✓" : seeing ? "…" : "○"} ${name}</button>` }).join(" ");
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
// tabs under the numbers; the last one open is remembered
function showTab(name){
  for (const b of document.querySelectorAll(".tabs button")){ b.classList.toggle("sel", b.dataset.tab === name); b.setAttribute("aria-selected", String(b.dataset.tab === name)); b.tabIndex = b.dataset.tab === name ? 0 : -1 }
  for (const sec of document.querySelectorAll("section[data-tab]")) sec.classList.toggle("hidden", sec.dataset.tab !== name);
  try { localStorage.setItem("tab", name) } catch {}
}
for (const b of document.querySelectorAll(".tabs button")){ b.setAttribute("role", "tab"); if (b.id !== "histBtn") b.onclick = () => showTab(b.dataset.tab) }
for (const sec of document.querySelectorAll("section[data-tab]")) sec.setAttribute("role", "tabpanel");
// left/right arrows move between the tabs (the usual tab-strip keys)
$(".tabs").addEventListener("keydown", e => { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const bs = [...document.querySelectorAll(".tabs button")], i = bs.indexOf(document.activeElement); if (i < 0) return;
  const n = bs[(i + (e.key === "ArrowRight" ? 1 : bs.length - 1)) % bs.length]; n.click(); n.focus(); e.preventDefault() });
// boxes, like OBS sources: dragged by the ⠿ grip or the title onto another box (above or below it), onto a tab (to the end of it), or onto
// the strip above the tabs (pinned: shows on every tab); – folds one to its title. Saved in settings.layout (Danny, 2026-10-18).
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
// saved as order[tab] = [box id | {row: [box id | [box ids (a column)]], w: [widths]}]; older saves (just ids) still load
function layoutSave(){
  tidy(); const order = {};
  const ser = e => isRow(e) ? {row: parts(e).map(p => isCol(p) ? [...p.children].map(b => b.dataset.box) : p.dataset.box), w: parts(e).map(p => Math.round(grow(p)) || 1)} : e.dataset.box;
  for (const h of [$("#dock"), ...document.querySelectorAll("section[data-tab]")]) order[h.id || h.dataset.tab] = [...h.querySelectorAll(":scope > [data-box], :scope > .boxrow")].map(ser);
  host.settings({layout: {order, folded: BOXES.filter(b => b.classList.contains("folded")).map(b => b.dataset.box)}}).then(x => settings = x);
}
function layoutLoad(l){
  if (!l?.order) return;
  const box = id => BOXES.find(x => x.dataset.box === id);
  for (const [k, items] of Object.entries(l.order)){
    const h = k === "dock" ? $("#dock") : document.querySelector(`section[data-tab="${k}"]`); if (!h || !Array.isArray(items)) continue;
    for (const it of items){
      if (typeof it === "string"){ const b = box(it); if (b) h.appendChild(b); continue }
      if (!Array.isArray(it?.row)) continue;
      const r = mk("boxrow"); h.appendChild(r);
      it.row.forEach((p, i) => { let e;
        if (Array.isArray(p)){ e = mk("boxcol"); for (const id of p){ const b = box(id); if (b) e.appendChild(b) } if (!e.children.length) return }
        else if (!(e = box(p))) return;
        r.appendChild(e); const w = +it.w?.[i]; if (w > 0) e.style.flex = `${w} 1 0px`;
      });
    }
  }
  for (const b of BOXES) b.classList.toggle("folded", (l.folded || []).includes(b.dataset.box));
  tidy();
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
  c.innerHTML = `<span class="btitle">${esc(b.dataset.title)}</span><span class="grip" tabindex="0" role="button" aria-label="Move ${esc(b.dataset.title)} (arrow keys)" title="Drag to move: onto another box (its left or right edge puts them side by side), a tab, or the strip above the tabs. Or focus it and use the arrow keys">⠿</span><button class="fold" aria-label="Fold ${esc(b.dataset.title)}" aria-expanded="true" title="Fold or unfold">–</button>`;
  b.prepend(c);
  c.querySelector(".fold").onclick = () => { b.classList.toggle("folded"); foldMark(b); layoutSave() };
  // keyboard: arrow up/down on the grip moves the box past its neighbour (out of its row at a row's or column's end); left/right
  // moves it along its row
  c.querySelector(".grip").onkeydown = e => { const k = e.key, up = k === "ArrowUp" || k === "ArrowLeft"; if (!/^Arrow(Up|Down|Left|Right)$/.test(k)) return; e.preventDefault();
    const p = b.parentElement, side = x => { do x = up ? x.previousElementSibling : x.nextElementSibling; while (isSplit(x)); return x };
    if (k === "ArrowLeft" || k === "ArrowRight"){ const u = isCol(p) ? p : b; if (!isRow(u.parentElement)) return; const s = side(u); if (!s) return; up ? s.before(u) : s.after(u) }
    else if (isRow(p)) up ? p.before(b) : p.after(b);
    else { const s = side(b); if (s?.matches("[data-box], .boxrow")) up ? s.before(b) : s.after(b); else if (isCol(p) && !s) up ? p.parentElement.before(b) : p.parentElement.after(b); else return }
    c.querySelector(".grip").focus(); layoutSave() };
}
// mouse dragging (pointer events: the browser's own drag and drop didn't start in the app, Danny 2026-10-18). Held on the
// grip or the box's title, moved 5 px: the box follows as a label under the pointer until it's let go
let drag = null;
document.addEventListener("pointerdown", e => {
  const h = e.button === 0 && e.target.closest(".grip, .box h3"), b = h?.closest("[data-box]");
  if (!b) return;
  e.preventDefault(); drag = {b, x: e.clientX, y: e.clientY, on: false, el: null};
});
const dropTarget = (x, y) => { const t = document.elementFromPoint(x, y)?.closest("[data-box], .boxrow, #dock, section[data-tab], .tabs button");
  if (!t || t === dragBox || dragBox.contains(t)) return null;
  if (t.matches(".tabs button") && !["session", "loot", "hist"].includes(t.dataset.tab)) return null; return t };
// which side of a box the pointer is on: its left or right quarter (up to 90 px) = beside it, otherwise above or below
function dropZone(t, x, y){ const r = t.getBoundingClientRect(), ex = Math.min(r.width / 4, 90);
  if (t.matches("[data-box]")){ if (x < r.left + ex) return "left"; if (x > r.right - ex) return "right" }
  return y > r.top + r.height / 2 ? "bottom" : "top" }
function dropMark(t, z){
  for (const x of document.querySelectorAll(".over-top, .over-bottom, .over-left, .over-right, .over-drop")) x.classList.remove("over-top", "over-bottom", "over-left", "over-right", "over-drop");
  if (t) t.classList.add(t.matches("[data-box], .boxrow") ? "over-" + z : "over-drop");
}
document.addEventListener("pointermove", e => {
  if (!drag) return;
  if (!drag.on){
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 5) return;
    drag.on = true; dragBox = drag.b; dragBox.classList.add("moving"); document.body.classList.add("dragging");
    drag.el = Object.assign(document.createElement("div"), {className: "dragLabel", textContent: dragBox.dataset.title}); document.body.appendChild(drag.el);
    // near the window's top or bottom edge: the page scrolls, to reach boxes out of sight
    drag.iv = setInterval(() => { if (drag?.cy < 72) scrollBy(0, -15); else if (drag?.cy > innerHeight - 40) scrollBy(0, 15) }, 30);
  }
  drag.cy = e.clientY;
  drag.el.style.left = e.clientX + 12 + "px"; drag.el.style.top = e.clientY + 8 + "px";
  const t = dropTarget(e.clientX, e.clientY);
  dropMark(t, t && dropZone(t, e.clientX, e.clientY));
  // held over a tab for half a second: that tab opens, so the box can go between its boxes
  if (t?.matches(".tabs button")){ if (drag.tab !== t){ drag.tab = t; drag.tabT = Date.now() } else if (Date.now() - drag.tabT > 500 && !t.classList.contains("sel")) showTab(t.dataset.tab) } else drag.tab = null;
});
const endDrag = (e, cancel) => {
  if (!drag) return; const d = drag; drag = null;
  if (!d.on) return;
  // the target is found while the page still looks as it did under the pointer: the pin strip shrinks away once dragging ends
  d.el.remove(); const t = !cancel && dropTarget(e.clientX, e.clientY), z = t && dropZone(t, e.clientX, e.clientY);
  clearInterval(d.iv); d.b.classList.remove("moving"); document.body.classList.remove("dragging"); dropMark(null); dragBox = null;
  if (!t) return;
  if (t.matches("[data-box], .boxrow")) place(d.b, t, z);
  else if (t.matches(".tabs button")){ document.querySelector(`section[data-tab="${t.dataset.tab}"]`).appendChild(d.b); showTab(t.dataset.tab) }
  else t.appendChild(d.b);
  layoutSave();
};
document.addEventListener("pointerup", e => endDrag(e, false));
document.addEventListener("pointercancel", e => endDrag(e, true));
document.addEventListener("keydown", e => { if (e.key === "Escape" && drag) endDrag(e, true) });
// the splitter between two boxes in a row: dragged (or arrow keys) to share the row's width between them, each at least 110 px
let rs = null;
function resize(s, dx){
  for (const p of parts(s.parentElement)) p.style.flex = `${Math.round(p.getBoundingClientRect().width)} 1 0px`;
  const a = s.previousElementSibling, b = s.nextElementSibling, wa = grow(a), sum = wa + grow(b), na = Math.max(110, Math.min(sum - 110, wa + dx));
  if (sum < 220) return; a.style.flex = `${Math.round(na)} 1 0px`; b.style.flex = `${Math.round(sum - na)} 1 0px`;
}
document.addEventListener("pointerdown", e => { const s = e.button === 0 && e.target.closest?.(".split"); if (!s) return;
  e.preventDefault(); rs = {s, x: e.clientX}; s.classList.add("on"); document.body.classList.add("resizing") });
document.addEventListener("pointermove", e => { if (!rs) return; resize(rs.s, e.clientX - rs.x); rs.x = e.clientX });
const endResize = () => { if (!rs) return; rs.s.classList.remove("on"); document.body.classList.remove("resizing"); rs = null; layoutSave() };
document.addEventListener("pointerup", endResize); document.addEventListener("pointercancel", endResize);
document.addEventListener("keydown", e => { if (!isSplit(e.target) || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
  e.preventDefault(); resize(e.target, e.key === "ArrowLeft" ? -24 : 24); layoutSave() });
$("#layoutReset").onclick = () => { for (const [b, p, next, f] of [...BOX_HOME].reverse()){ p.insertBefore(b, next); b.classList.toggle("folded", f); foldMark(b) } layoutSave() };
try { const t = localStorage.getItem("tab"); if (t && t !== "hist" && t !== "help" && document.querySelector(`section[data-tab="${t}"]`)) showTab(t) } catch {}

// a crop (black-on-white RGBA) -> PNG bytes for the OCR in the main process
async function toPng(c){
  const cv = document.createElement("canvas"); cv.width = c.w; cv.height = c.h;
  cv.getContext("2d").putImageData(new ImageData(c.d, c.w, c.h), 0, 0);
  return new Uint8Array(await (await new Promise(r => cv.toBlob(r, "image/png"))).arrayBuffer());
}
// job from the status bar every 30 s, when the player left the job on "Auto": taken once the same job is read twice running
let lastJob = 0, jobSeen = null, jobNow = null, charName = null, charSeen = null;   // charName: kept on this PC only (History)
async function readJob(c, t, nc){   // c: the status bar text crop (GrindReaders.jobTextCrop), or null; nc: the name crop
  const sess = session, sl = slicer;
  // the character name (for History only): taken once the same name reads twice in a row
  if (nc){ const n = GrindReaders.nameFromText(await host.ocr(await toPng(nc))); if (n && n === charSeen) charName = n; charSeen = n }
  if (settings.job) return;
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
  if (key && same(key, mapSeen) && !same(key, mapNow) && sess === session && !wrap){ mapNow = key; const e = {t, type: "map", id: m.id, name: m.name}; sess.add(e); sl.add(e); kpqMap(m.id, t) }
  mapSeen = key;
}

// after each 15-minute run: how it compares with other players around your level (shared data)
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
// items picked by name in Settings (e.g. "Bronze Ore, Glove scroll"): a name matches every item that contains it
let alertIds = null, alertKey = null;
function alertSet(){
  const key = settings.alertItems || "";
  if (key !== alertKey){ alertKey = key; const parts = key.split(",").map(x => x.trim().toLowerCase()).filter(x => x.length >= 3);
    alertIds = new Set(parts.length ? Object.entries(G.items).filter(([, it]) => parts.some(p => (it.n || "").toLowerCase().includes(p))).map(([id]) => id) : []) }
  return alertIds;
}
function flash(){ $("#top").classList.remove("flash"); void $("#top").offsetWidth; $("#top").classList.add("flash") }
function dropAlert(id){
  const min = +settings.alertWorth || 0, worth = G.pw?.[id]?.[0] ?? G.items[id]?.p ?? 0;
  if (alertSet().has(String(id))){ beep(660, 0.15); setTimeout(() => beep(990, 0.25), 180); flash(); $("#status").textContent = `Drop you're watching for: ${G.items[id]?.n || "item " + id}`; return }
  if (!min || worth < min) return;
  flash();
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
  if (wrap || settings.stopBeep === false || !s.lastExpT) return;
  const quiet = Date.now() - s.lastExpT > 120e3;
  if (quiet && !stopWarned){ stopWarned = true; beep(330, 0.6); $("#status").textContent = "No EXP for 2 minutes. Died, disconnected, or someone took the map?" }
  if (!quiet) stopWarned = false;
}

// auto-pause: the EXP bar and the minimap both gone for 3 s (Cash Shop, changing channel, loading) = not farming. Only
// after the bar was read once this session, so a game window the bar reader can't handle never pauses
let barSeen = false, goneSince = null, lastGoneCheck = 0;
function autoPause(minimap, info, t){   // minimap: the minimap is on screen (looked for when the bar isn't)
  if (info.bar) barSeen = true;
  if (held) return;   // paused by hand: stays paused until Go on
  if (kpq?.hold){ if (session.state.pausedAt === null) pauseAt(t); return }   // between KPQ rounds: stays paused until the next stage
  if (settings.autoPause === false || !barSeen) return;
  const paused = session.state.pausedAt !== null;
  if (info.bar){ goneSince = null; if (paused && !kpq?.hold){ const e = {t, type: "resume"}; session.add(e); slicer.add(e); log("event", e); $("#status").textContent = "Back in the game: tracking again." } return }
  if (paused || t - lastGoneCheck < 1000) return;
  lastGoneCheck = t;
  if (minimap){ goneSince = null; return }   // minimap still there: just the bar covered
  goneSince ??= t;
  if (t - goneSince >= 3000){
    const e = {t: Math.max(goneSince, session.state.last || 0), type: "pause"}; session.add(e); slicer.add(e); log("event", e);
    $("#status").textContent = "Paused: the game screen is gone (Cash Shop, changing channel or loading). Resumes by itself.";
  }
}
// KPQ: picked in the Session tab, or found by itself (Auto) once a KPQ stage is on the minimap. While it's on, any map that
// isn't a KPQ stage (Kerning City between rounds, a shop) pauses the session; the next stage picks it back up.
// A round = coming into a KPQ stage from outside. Maps: G.kpq (80000000-80000600, from the site's KPQ data).
const KPQ_MAPS = new Set((G.kpq || []).map(String));
let kpq = null;
// Pause (button or its shortcut): the timer stops until pressed again (held); the game screen coming back doesn't resume it
function pauseUi(){ const b = $("#pauseBtn"); b.classList.toggle("hidden", timer == null || !!wrap); b.textContent = held ? "Go on" : "Pause"; b.setAttribute("aria-pressed", String(held)) }
$("#pauseBtn").onclick = () => {
  if (timer == null || wrap || !session) return;
  held = !held; const t = Date.now();
  if (held){ const e = {t: Math.max(t, session.state.last || 0), type: "pause", hold: true}; session.add(e); slicer.add(e); log("event", e); $("#status").textContent = "Paused by you. Press Go on (or the Pause shortcut) to carry on." }
  else { const e = {t, type: "resume"}; session.add(e); slicer.add(e); log("event", e); $("#status").textContent = "Tracking again." }
  pauseUi(); render();
};
function pauseAt(t){ const e = {t: Math.max(t, session.state.last || 0), type: "pause"}; session.add(e); slicer.add(e); log("event", e) }
function kpqReset(){ kpq = {on: settings.kpqAct === "kpq", hold: false, inside: false, rounds: 0, left: null, leftT: 0, stage: null, round: null, times: [], stageTimes: {}, stageExp: {}} }
// stage and round times: from the KPQ clock ("Time Left", top middle) when it reads, else the PC clock
const KPQ_STAGE = {"80000000": "1st", "80000100": "2nd", "80000200": "3rd", "80000300": "4th", "80000400": "Last", "80000500": "Bonus"};
const kpqLeftAt = t => kpq.left === null ? null : kpq.left - (t - kpq.leftT) / 1000;
const kpqSince = (p, t) => p.left0 !== null && kpq.left !== null ? p.left0 - kpqLeftAt(t) : (t - p.t0) / 1000;
const mss = sec => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0") };
function kpqTime(left, t){
  kpq.left = left; kpq.leftT = t;
  for (const p of [kpq.stage, kpq.round]) if (p && p.left0 === null) p.left0 = left + (t - p.t0) / 1000;   // clock first seen mid-stage
}
function kpqEnd(t, round){
  if (kpq.stage){ const id = kpq.stage.id; (kpq.stageTimes[id] ||= []).push(kpqSince(kpq.stage, t)); kpq.stageExp[id] = (kpq.stageExp[id] || 0) + Math.max(0, (session?.stats().exp || 0) - kpq.stage.exp0); kpq.stage = null }
  if (round && kpq.round){ kpq.times.push(kpqSince(kpq.round, t)); kpqShare(kpq.round, t); kpq.round = null }
  if (round) kpq.left = null;   // each round's clock starts over
}
function kpqMap(id, t){
  if (!kpq || id == null) return;   // map not read: no change
  const inside = KPQ_MAPS.has(String(id));
  if (inside && !kpq.on && settings.kpqAct !== "grind"){ kpq.on = true; $("#status").textContent = "KPQ run spotted: rounds are counted, and Kerning City between rounds is paused." }
  if (!kpq.on) return;
  if (inside){
    if (!kpq.inside) kpq.rounds++;
    // a new stage: the last one's time is kept; the Exit map ends the round
    if (kpq.stage?.id !== String(id)){
      // cleared: from the Last stage on to Bonus or Exit. Clear time = 1st stage to then (Bonus left out, so Bonus and Rush compare)
      if (kpq.stage?.id === "80000400" && kpq.round) kpq.round.clear = kpqSince(kpq.round, t);
      kpqEnd(t, String(id) === "80000600");
      if (KPQ_STAGE[id]){ const p = {id: String(id), t0: t, left0: kpqLeftAt(t), exp0: session?.stats().exp || 0}; kpq.stage = p; if (!kpq.round){ const st = session?.stats(); kpq.round = {t0: t, left0: p.left0, exp0: st?.exp || 0, mesos0: st?.mesos || 0, startStage: String(id), stages: {}} } }
      if (KPQ_STAGE[id] && kpq.round) kpq.round.stages[String(id)] = 1;
    }
    kpq.inside = true;
    if (kpq.hold && !held){ kpq.hold = false; const e = {t, type: "resume"}; session.add(e); slicer.add(e); log("event", e); $("#status").textContent = "KPQ round " + kpq.rounds + ": tracking again." }
  } else {
    kpqEnd(t, true);
    kpq.inside = false;
    if (!kpq.hold){ kpq.hold = true; if (session.state.pausedAt === null) pauseAt(t); $("#status").textContent = "KPQ: paused between rounds. Picks back up on the next stage." }
  }
}
// KPQ leaderboard: a finished round (1st stage to past the Last stage) goes to the server's /api/kpq when sharing is on.
// Rounds joined mid-way or left before the Last stage was cleared aren't sent.
let kpqSent = 0;
function kpqShare(r, t){
  if (!settings.share || r.clear == null || r.startStage !== "80000000" || !session) return;
  const s = session.stats(), st = {};
  for (const [id, a] of Object.entries(kpq.stageTimes)) if (r.stages[id]) st[id] = Math.round(a.at(-1));
  kpqSent++;
  host.shareRun({kpq: true, v: 1, date: new Date(r.t0).toLocaleDateString("sv"), hour: new Date(r.t0).getUTCHours(), mode: settings.kpqMode === "Rush" ? "Rush" : "Bonus",
    party: s.party, level: s.level, job: s.job, clear: Math.round(r.clear), total: Math.round(kpqSince(r, t)), clock: r.left0 !== null,
    exp: Math.max(0, s.exp - r.exp0), mesos: Math.max(0, s.mesos - r.mesos0), stages: st, partyCode: settings.partyCode || null});
}
function kpqText(s){
  if (!kpq?.on) return settings.kpqAct === "kpq" ? "KPQ picked: the session pauses outside the KPQ stages and counts each round." : "During KPQ the session pauses outside the KPQ stages (Kerning City between rounds) and picks back up on the next 1st stage.";
  const n = kpq.rounds, per = v => n ? fmt(v / n) : "-";
  return `KPQ (${settings.kpqMode || "Bonus"}): ${n} round${n === 1 ? "" : "s"}` + (n ? ` · ${Math.round(s.activeMin / n * 10) / 10} min a round · ${per(s.exp)} EXP a round · ${per(s.mesos)} mesos a round` : "")
    + (kpq.round ? ` · this round ${mss(kpqSince(kpq.round, Date.now()))}` + (kpq.stage ? ` (${KPQ_STAGE[kpq.stage.id]} stage ${mss(kpqSince(kpq.stage, Date.now()))})` : "") : "")
    + (kpq.times.length ? ` · best round ${mss(Math.min(...kpq.times))}, average ${mss(kpq.times.reduce((a, b) => a + b, 0) / kpq.times.length)}` : "")
    + (kpq.left !== null ? ` · KPQ clock ${mss(kpqLeftAt(Date.now()))} left` : "")
    + (kpq.hold ? " · paused between rounds" : "") + (kpqSent ? ` · ${kpqSent} round${kpqSent === 1 ? "" : "s"} sent to the KPQ leaderboard` : "");
}
function kpqSet(){
  if (!session || !kpq) return;
  const t = Date.now();
  if (settings.kpqAct === "kpq" && !kpq.on){ kpq.on = true; kpqMap(session.state.map, t) }
  else if (settings.kpqAct === "grind" && kpq.on && !wrap){ kpq.on = false; if (kpq.hold && !held){ kpq.hold = false; const e = {t, type: "resume"}; session.add(e); slicer.add(e) } }
}
$("#kpqAct").onchange = e => host.settings({kpqAct: e.target.value}).then(s => { settings = s; kpqSet(); if (session) render() });
$("#kpqMode").onchange = e => host.settings({kpqMode: e.target.value}).then(s => { settings = s; if (session) render() });
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
      else if ((!settings.job || !charName) && t - lastJob > 30e3){ lastJob = t; want.job = true }
    }
    const r = await eng.read({frame: f, t, want});
    if (timer == null || sess !== session || !r) throw null;   // stopped (or restarted) while reading, or the frame was lost
    if (r.scale){ scale = r.scale; fastLeft = 19 }   // also at 1x: finding the scale is the slow part, so it's checked every 20 frames only
    for (const e of r.ev){
      if (wrap && e.type !== "inv" && e.type !== "wallet" && e.type !== "glyph") continue;   // after Stop: only the end inventory look counts
      if (held && /^(exp|bonus|meso|item|itemraw)$/.test(e.type)) continue;   // paused by hand: a break, nothing picked up counts
      if (e.type === "kpqtime"){ if (kpq) kpqTime(e.left, e.t); continue }
      // a pickup-line letter learned from an item name: kept for next time (at most 300)
      if (e.type === "glyph"){ const g = [...(settings.glyphs || []), {ch: e.ch, w: e.w, h: e.h, bits: e.bits}].slice(-300); host.settings({glyphs: g}).then(x => settings = x); log("glyph", {ch: e.ch}); continue }
      session.add(e); slicer.add(e); log("event", e);
      if (e.type === "item") dropAlert(e.id);
      if (e.type === "bar"){
        // the start reading: taken at Start; when the bar didn't read then, the first good reading fills it in
        if (!snaps.start || snaps.start.level == null && !snaps.start.hand) snaps.start = {...snaps.start, t: snaps.start?.t || t, level: e.level || session.state.level, pct: e.pct, exp: e.exp, hand: false};
        else if (!snaps.end?.hand) snaps.end = {t, level: e.level || session.state.level, pct: e.pct, exp: e.exp, hand: false};
      }
      if (check && e.type === "bar" && !check.bar){ check.bar = e.level ? "Lv " + e.level + ", " + e.pct + "%" : e.pct + "%"; check.late = check.ended }
      if (check && /^(exp|bonus|meso|item|itemraw)$/.test(e.type) && !check.lines){ check.lines = true; check.late = check.ended }
    }
    const info = r.info; lastInvTab = info.inv || null;
    // the inventory's spot, remembered for next time (saved when it moved, at most every 10 s)
    const ia = info.invAt, il = settings.invLast;
    if (ia && (!il || Math.abs(ia.x - il.x) + Math.abs(ia.y - il.y) > 0.005) && t - invSavedT > 10e3){ invSavedT = t; host.settings({invLast: ia}).then(x => settings = x) }
    if (check && info.useSpots && !check.use){ check.use = info.useSpots + " item count" + (info.useSpots > 1 ? "s" : ""); check.late = check.ended }
    if (check && info.partyWindow > 1 && !check.party){ check.party = info.partyWindow; check.late = check.ended }
    if (!wrap) autoPause(r.minimap, info, t);
    if (check && (!check.ended || check.late)){ check.late = false; renderCheck() }   // a ✗ turns ✓ when it starts working
    if (session.state.deaths > deathSeen){ deathSeen = session.state.deaths; deathPending = {t, tries: 0, last: 0} }
    const ocr = fn => { ocrBusy = true; fn.catch(() => {}).finally(() => ocrBusy = false) };
    if (want.chat) ocr(checkDeath(r.crops.chat, t));
    else if (want.map) ocr(readMap(r.crops.map, t));
    else if (want.job) ocr(readJob(r.crops.job, t, r.crops.name));
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
  // a reading without a level or % gets marked: the session's EXP/hr can't be worked out without it
  for (const [i, sn] of [[0, a], [1, b]]) for (const f of ["lv", "pct"]) $("#s" + i + f).classList.toggle("need", !!(session && (i === 0 || timer == null)) && !(f === "lv" ? sn?.level : sn?.pct != null));
  $("#snapNote").textContent = d == null ? (session && !(a?.level && a?.pct != null) ? "The start reading is missing: type your level and EXP % from when you started."
      : a && b ? "Can't work it out: check the levels (a level or % is missing, or the end is before the start)." : "")
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

// a tab chip clicked: read that tab now. The inventory is looked for anywhere on screen (it can be moved during the
// session); if it isn't found in 4 s, the player drags a box around it (snip window), saved as settings.invArea
let lastInvTab = null, invSavedT = 0;
$("#invTabs").onclick = $("#wrapTabs").onclick = async e => {
  const b = e.target.closest("[data-tab]"); if (!b) return;
  const tab = b.dataset.tab, name = INV_TABS.find(x => x[0] === tab)[1], say = t => $("#status").textContent = t;
  if (timer == null || !engine?.invNow) return say("Press Start first, then click a tab to read it.");
  // read = a new reading of that tab reached the session after the click (a tab counts once two reads agree, ~4 s)
  const wait = async () => { const t0 = Date.now(); lastInvTab = null; engine.invNow();
    for (let i = 0; i < 16; i++){ await new Promise(r => setTimeout(r, 500)); if ((session?.stats().invTabs?.[tab]?.last || 0) >= t0) return true } return false };
  say(`Reading your ${name} tab: have it open in the game...`);
  if (await wait()){ render(); return say(`${name} tab read.`) }
  if (timer == null) return;
  if (lastInvTab === tab) return say(`Your ${name} tab is open but didn't read the same twice in a row: keep the mouse off it for a few seconds and click again.`);
  if (lastInvTab) return say(`That's your ${INV_TABS.find(x => x[0] === lastInvTab)[1]} tab: switch the inventory to ${name} and click again.`);
  say("Couldn't find your inventory: drag a box around it (with the " + name + " tab open).");
  const f = await oneFrame(), c = document.createElement("canvas"); c.width = f.w; c.height = f.h; c.getContext("2d").putImageData(new ImageData(f.d, f.w, f.h), 0, 0);
  const rect = await host.snip(c.toDataURL("image/jpeg", 0.9));
  if (!rect) return say("No box drawn: the inventory is still looked for by itself.");
  settings = await host.settings({invArea: rect}); engine.setInvHint(rect);
  say(await wait() ? `${name} tab read. That spot is remembered; moving the window is fine too.` : `Still can't read the ${name} tab there. Report a bug (Ctrl+Shift+B) with it open so it can be fixed.`);
};

let starting = false, ICONS = null;
async function start(){
  if (starting) return;   // a double click starts one capture, not two
  starting = true; $("#status").className = "";
  FPS = 2; slowTicks = 0;   // before the capture opens: it runs at FPS frames a second
  try { await startCapture(); ICONS ||= await GrindReaders.loadIcons(G).catch(() => []) }   // once: potion/arrow pictures for the counts
  finally { starting = false }
  timer = 0;   // running (the first tick sets the real timeout)
  session = GrindSession.createSession(G, {idleMs: (settings.idleSec || 60) * 1000, goalLevel: goalOf(), freeIds: freeIds()}); stopWarned = false;
  // every 15 minutes of non-stop farming on one map with the same party is one shared run (when sharing is on)
  slicer = GrindSession.createRunSlicer(G, {idleMs: 60e3, onRun: run => { if (settings.share && !kpq?.on){ runsSent++; host.shareRun({...run, partyCode: settings.partyCode || null}) } showSpeed(run) }});
  wrap = null; runT0 = Date.now(); $("#summary").classList.add("hidden"); check = {t0: Date.now()}; lastKeep = 0; RECENT.length = 0; log("start", {fps: FPS, w: video.videoWidth, h: video.videoHeight});
  kpqReset(); held = false; barSeen = false; goneSince = null; levelsShown = 0; deathSeen = 0; deathPending = null; Object.assign(deaths, {confirmed: 0, lost: 0, unseen: 0});
  snaps.start = snaps.start?.hand && Date.now() - snaps.start.t < 60e3 ? snaps.start : null; snaps.end = null;   // a start snapped just before Start is kept
  engine = makeEngine(ICONS, null, settings.invArea || null, settings.glyphs || [], settings.invLast || null); scale = null; fastLeft = 0; lastPix = null; skipped = 0; log("engine", {kind: engine.kind});
  mapNow = mapSeen = null; mapMissing = 0; jobNow = jobSeen = null; lastJob = 0; lastParty = 0; runsSent = 0; kpqSent = 0; FPS = 2; slowTicks = 0;
  // a job picked by hand wins; "Auto" reads it from the status bar
  if (settings.job){ const e = {t: Date.now(), type: "job", name: settings.job}; session.add(e); slicer.add(e) }
  tick();
  renderState(null);
  // the start reading is taken right away (not only once the bar is read): its picture is the proof of where you started
  if (!snaps.start) snap("start", null, false).catch(() => {});
}
let stopping = false;
// Stop: the timer stops (paused from now on) and the end EXP reading is taken; the wrap-up card then asks for one last look
// at each inventory tab, and End run (in that card, away from Start/Stop, so a double click can't end it) saves the session
// and shows the summary. Start/Resume is locked for 2-3 s after either (Danny, 2026-10-18)
const lockGo = ms => { $("#go").disabled = true; setTimeout(() => $("#go").disabled = false, ms) };
async function stop(){
  if (stopping || wrap || timer == null) return;
  stopping = true; lockGo(2000); held = false;
  try {
    const t = Date.now(); wrap = {t};
    if (session.state.pausedAt === null) pauseAt(t);
    if (kpq?.on) kpqEnd(t, true);
    log("wrap", {});
    if (video?.srcObject?.active && video.videoWidth && !snaps.end?.hand) await snap("end", grab(), false).catch(() => {});
    $("#status").textContent = "Stopped. Open your inventory on Equip, Use and Etc for a second each, then add a name or note if you like and press Finalize log.";
    render();
  } finally { stopping = false }
}
function resume(){
  if (!wrap || timer == null) return;
  const e = {t: Date.now(), type: "resume"}; session.add(e); slicer.add(e); log("event", e);
  wrap = null; lockGo(1000); $("#status").textContent = "Tracking again."; render();
}
async function finish(){
  if (stopping || timer == null) return;
  stopping = true; $("#wrapEnd").disabled = true; lockGo(3000);
  const t1 = wrap?.t || Date.now();
  try { await stopNow() } finally { stopping = false; wrap = null; $("#wrapEnd").disabled = false; renderWrap(); renderState(session?.stats()) }
  try { showSummary(t1) } catch (e){ log("summary", {err: e.message}) }
  $("#runName").value = $("#wrapName").value = $("#runNote").value = "";
}
async function stopNow(){
  log("stop", {engine: engine?.kind, skipped});
  if (!wrap && video?.srcObject?.active && video.videoWidth && !snaps.end?.hand) await snap("end", grab(), false).catch(() => {}); if (check && !check.ended){ check = null; renderCheck() }
  clearTimeout(timer); timer = null; engine?.close(); $("#partyBox").classList.add("hidden"); $("#miniParty").textContent = "";
  video?.srcObject?.getTracks().forEach(tr => tr.stop());
  // a failed save (disk full, folder locked) must not leave the button saying Stop
  // the start/end readings go with it: History's EXP/hr comes from them when both are complete
  const a = snaps.start, b = snaps.end, snapExp = a && b && b.t > a.t ? GrindSession.expBetween(G, a, b) : null;
  const snapRec = snapExp != null ? {startLevel: a.level, startPct: a.pct, endLevel: b.level, endPct: b.pct, minutes: Math.round((b.t - a.t) / 6e3) / 10, exp: Math.round(snapExp)} : null;
  if (!snapRec && session?.state.events) $("#status").textContent = "Saved, but the start or end EXP reading is missing: History uses the live count for this one.";
  if (session && session.state.events) await host.saveSession({shared: !!settings.share, ...session.shareable(), snap: snapRec, inv: session.stats().inv.map(({id, n, alike}) => ({id, n, alike})), name: runName() || null, note: $("#runNote").value.trim() || null, ...runExtras(), kpq: kpq?.on ? {mode: settings.kpqMode || "Bonus", rounds: kpq.rounds, best: kpq.times.length ? Math.round(Math.min(...kpq.times)) : null, avg: kpq.times.length ? Math.round(kpq.times.reduce((a, b) => a + b, 0) / kpq.times.length) : null} : null, lootValue: Math.round(session.stats().lootValue), levelUps: session.state.levelUps.map(({t, ...l}) => l)}).catch(e => { $("#status").textContent = "Couldn't save this session: " + e.message });
  renderState(session?.stats());
}
// more about the run for History: who played it, levels, clock time, the best drop, the monster killed most
const worthOf = id => G.pw?.[id]?.[0] ?? G.items[id]?.p ?? 0;
// the best drop: the single item worth the most (older sessions: from their item counts at today's prices)
function bestDrop(x){
  if (x.bestDrop !== undefined) return x.bestDrop;
  const ids = Object.entries(x.items || {}).filter(([, n]) => n > 0); if (!ids.length) return null;
  const [id, n] = ids.sort((a, b) => worthOf(b[0]) - worthOf(a[0]) || b[1] - a[1])[0];
  return {id, name: G.items[id]?.n || "Item " + id, each: worthOf(id), n};
}
function runExtras(){
  const s = session.stats(), a = snaps.start, b = snaps.end, top = [...s.mobs].sort((p, q) => q.kills - p.kills)[0];
  const best = [...s.items].sort((p, q) => (q.each || 0) - (p.each || 0) || q.n - p.n)[0];
  const sx = a && b && b.t > a.t && a.level != null && b.level != null ? GrindSession.expBetween(G, a, b) : null, exp = Math.round(sx ?? s.exp);
  return {expTotal: exp, expPerActiveMin: s.activeMin >= 1 ? Math.round(exp / s.activeMin) : null, player: charName, startLevel: a?.level ?? (s.levelUps?.length ? s.levelUps[0].level - 1 : s.level) ?? null, endLevel: b?.level ?? s.level ?? null,
    clockMin: Math.round((Date.now() - runT0) / 6e3) / 10, itemsN: s.items.reduce((t, i) => t + i.n, 0), usedN: s.used.reduce((t, u) => t + u.n, 0),
    bestDrop: best ? {id: best.id, name: best.name, each: Math.round(best.each || 0), n: best.n} : null, topMob: top ? {name: top.name, kills: top.kills} : null};
}
const dropText = d => d ? `${ico(d.id)}${esc(d.name)}${d.n > 1 ? " ×" + fmt(d.n) : ""}${d.each ? ` <span class="dim">(${mz(d.each)} each)</span>` : ""}` : "none";
// the summary after End run: clock time vs farming, EXP per clock hour and per active minute (KPQ Bonus: the bonus stage
// only, stages 1st-Last left out), mesos in and out, what the loot is worth, and the inventory before and after
function showSummary(t1){
  const sumName = runName(), sumNote = $("#runNote").value.trim(), best = [...session.stats().items].sort((p, q) => (q.each || 0) - (p.each || 0) || q.n - p.n)[0];
  const s = session.stats(), a = snaps.start, b = snaps.end;
  const snapExp = a && b && b.t > a.t && a.level != null && b.level != null ? GrindSession.expBetween(G, a, b) : null, exp = snapExp ?? s.exp;
  const clockH = Math.max(1 / 60, (t1 - runT0) / 3.6e6), act = s.activeMin;
  const bonus = kpq?.on && (settings.kpqMode || "Bonus") === "Bonus" ? {min: (kpq.stageTimes["80000500"] || []).reduce((x, y) => x + y, 0) / 60, exp: kpq.stageExp["80000500"] || 0} : null;
  const perMin = bonus?.min > 0 ? bonus.exp / bonus.min : act > 0 ? exp / act : 0, net = s.mesos + s.lootValue - s.usedCost;
  const inv = s.inv.filter(x => x.alike === 1).slice(0, 40), tabName = k => INV_TABS.find(x => x[0] === k)?.[1] || k;
  $("#sumBody").innerHTML = (sumName ? `<div style="font-weight:600">${esc(sumName)}</div>` : "") + (sumNote ? `<div class="hnote">${esc(sumNote)}</div>` : "") + `<div class="note">${clock(runT0)} → ${clock(t1)} · ${hm(clockH)} on the clock, ${hm(act / 60)} farming`
      + (a?.level && b?.level ? ` · Lv ${a.level} ${a.pct?.toFixed(2)}% → Lv ${b.level} ${b.pct?.toFixed(2)}%` : "") + (s.mapName ? " · " + esc(s.mapName) : "") + (charName ? " · " + esc(charName) : "") + (s.job ? " · " + esc(s.job) : "") + "</div>"
    + `<div class="sgrid">`
    + cell("EXP gained", sg(exp), snapExp != null ? "from the start and end EXP bar" : "from the live count")
    + cell("EXP/hr", fmt(exp / clockH), "over the whole run (" + hm(clockH) + ")")
    + cell("EXP per active minute", fmt(perMin), bonus?.min > 0 ? `Bonus stage only: ${fmt(bonus.exp)} EXP in ${mss(bonus.min * 60)}` : "time spent farming only")
    + cell("Kills · deaths", `${fmt(s.kills)} · <span class="${s.deaths ? "neg" : ""}">${s.deaths}</span>`, kpq?.on ? `KPQ ${settings.kpqMode || "Bonus"}: ${kpq.rounds} round${kpq.rounds === 1 ? "" : "s"}` : "")
    + cell("Mesos looted", sgm(s.mesos), mz(s.mesos / clockH) + "/hr over the run")
    + cell("Mesos used", s.used.some(u => u.n) ? sgm(-s.usedCost) : "-", s.used.some(u => u.n) ? "potions, food, arrows" : "nothing counted")
    + cell("Items looted are worth", `<span class="pos">~${mz(s.lootValue)}</span>`, "approx., player-shop or NPC price")
    + cell("Net", sgm(net), sgm(net / clockH) + "/hr · mesos + items - used")
    + (s.walletNet != null ? cell("Inventory mesos", sgm(s.walletNet), "first look vs. last look") : "")
    + cell("Best drop", best ? `${ico(best.id)}${esc(best.name)}` : "-", best ? `${best.n > 1 ? "×" + fmt(best.n) + ", " : ""}${mz(best.each || 0)} each` : "nothing worth selling picked up")
    + `</div>`
    + (inv.length ? `<h3 style="margin-top:8px">Inventory: start → end</h3><table><tr class="th"><td>Item</td><td class="n">Start</td><td class="n">End</td><td class="n">Change</td></tr>`
      + inv.map(x => `<tr><td>${ico(x.id)}${esc(x.name)} <span class="note">${tabName(x.tab)}</span></td><td class="n dim">${fmt(x.was)}</td><td class="n">${fmt(x.now)}</td><td class="n">${sg(x.n)}</td></tr>`).join("") + "</table>"
      : `<div class="note">No inventory before/after: a tab has to be read at the start and again at the end.</div>`);
  $("#summary").classList.remove("hidden"); $("#summary").scrollIntoView({block: "nearest"});
}
$("#wrapEnd").onclick = () => finish();
// the run's name (top card, before or during the run; again in the wrap-up card) and the note written at wrap-up
const runName = () => $("#runName").value.trim();
$("#runName").oninput = () => { $("#wrapName").value = $("#runName").value };
$("#wrapName").oninput = () => { $("#runName").value = $("#wrapName").value };
$("#sumClose").onclick = () => $("#summary").classList.add("hidden");
// a picture of an element: its look copied onto a clone, drawn through an SVG at 2x (no screen capture, so any height works)
async function elPng(el, scale = 2){
  const W = Math.ceil(el.offsetWidth), H = Math.ceil(el.offsetHeight), clone = el.cloneNode(true);
  const from = [el, ...el.querySelectorAll("*")], to = [clone, ...clone.querySelectorAll("*")];
  from.forEach((n, i) => { const cs = getComputedStyle(n); let t = ""; for (const p of cs) t += `${p}:${cs.getPropertyValue(p)};`; to[i].setAttribute("style", t) });
  clone.style.margin = "0"; for (const b of clone.querySelectorAll("button")) b.style.visibility = "hidden";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * scale}" height="${H * scale}" viewBox="0 0 ${W} ${H}"><foreignObject width="${W}" height="${H}">${new XMLSerializer().serializeToString(clone)}</foreignObject></svg>`;
  const img = new Image(); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); await img.decode();
  const c = document.createElement("canvas"); c.width = W * scale; c.height = H * scale; c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Uint8Array(await (await new Promise(r => c.toBlob(r, "image/png"))).arrayBuffer());
}
$("#sumImg").onclick = async () => { const b = $("#sumImg"); b.disabled = true;
  try { const png = await elPng($("#summary")), d = new Date(), p2 = n => String(n).padStart(2, "0");
    await host.saveImage(`run-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.png`, png);
    b.textContent = "Saved + copied" } catch (e) { log("error", {where: "summary image", msg: String(e)}); b.textContent = "Couldn't save" }
  setTimeout(() => { b.textContent = "Save as image"; b.disabled = false }, 2500) };
$("#go").onclick = () => timer != null ? wrap ? resume() : stop() : start().catch(e => { $("#status").textContent = "Couldn't capture the game: " + e.message; $("#status").className = "bad" });

// one full frame every 3 s for 3 minutes, saved as PNG: material for building and testing the readers
$("#frames").onclick = async () => {
  $("#frames").disabled = true;   // one batch at a time
  try { if (!video?.srcObject?.active) await startCapture() }   // stopped tracks only give the last frame
  catch (err){ $("#frames").disabled = false; $("#status").textContent = "Couldn't capture the game: " + err.message; return }
  let n = 0, dir = null, busy = false, over = false;
  // done: the capture closes again unless tracking runs on it
  const done = () => { over = true; clearInterval(iv); $("#frames").disabled = false; if (timer == null) video?.srcObject?.getTracks().forEach(tr => tr.stop()) };
  const iv = setInterval(async () => {
    if (busy || over) return;   // a slow PNG save (> 3 s) must not start a second one with the same frame number
    busy = true;
    try {
      if (!video.videoWidth || !video.srcObject?.active) throw new Error("capture stopped (Stop pressed or game closed)");
      canvas.width = video.videoWidth; canvas.height = video.videoHeight; g.drawImage(video, 0, 0);
      const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
      dir = await host.saveFrame(`frame-${String(n).padStart(3, "0")}.png`, new Uint8Array(await blob.arrayBuffer()));
      $("#status").textContent = `Saving sample frames: ${n + 1}/60`;
      if (++n >= 60){ done(); $("#status").textContent = "Frames saved."; host.openFolder(dir) }
    } catch (err){ done(); $("#status").textContent = `Stopped saving frames after ${n}: ${err.message}` }
    finally { busy = false }
  }, 3000);
};

// "Report a bug": the last frames and log lines into one folder, opened for sending. The popup (Ctrl+Shift+B from the game,
// the Bug button, the menu) grabs the frames the moment it opens, so typing the note doesn't push the problem out of them
async function saveReport(frames, note){
  const s = session?.stats();
  try {
    const dir = await host.saveReport(frames.map((f, i) => ({name: `frame-${i}-${new Date(f.t).toISOString().slice(11, 19).replace(/:/g, "")}.png`, bytes: f.bytes})),
      {note: note.trim().slice(0, 2000), running: timer != null, fps: FPS, check, stats: s && {...s, mobs: s.mobs.length, items: s.items.length}, log: LOG.slice()});
    $("#status").textContent = `Bug report saved (${frames.length} frames + log). Send that folder to Danny.`;
    host.openFolder(dir);
  } catch (e){ $("#status").textContent = "Couldn't save the bug report: " + e.message }
}
$("#report").onclick = () => { saveReport(RECENT.slice(), $("#reportNote").value); $("#reportNote").value = "" };
let bugFrames = null;
function openBugPop(){
  bugFrames = RECENT.slice();
  $("#bugPopInfo").textContent = bugFrames.length ? `The last ${bugFrames.length} game pictures (~${bugFrames.length * 3} s) were grabbed just now.` : "No game pictures yet (press Start first); the log is still saved.";
  $("#bugPop").classList.remove("hidden"); $("#bugPopNote").focus();
}
const closeBugPop = () => { $("#bugPop").classList.add("hidden"); $("#bugPopNote").value = ""; bugFrames = null };
$("#bugBtn").onclick = openBugPop;
$("#bugPopCancel").onclick = closeBugPop;
$("#bugPopSave").onclick = () => { const f = bugFrames || [], n = $("#bugPopNote").value; closeBugPop(); saveReport(f, n) };
$("#bugPopNote").onkeydown = e => { if (e.key === "Escape") closeBugPop(); else if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); $("#bugPopSave").click() } };

$("#pcode").onchange = e => host.settings({partyCode: e.target.value.trim().slice(0, 20)}).then(s => { settings = s; lastParty = 0; if (!s.partyCode){ $("#partyBox").classList.add("hidden"); $("#miniParty").textContent = "" } });
$("#nick").onchange = e => host.settings({nick: e.target.value.trim().slice(0, 12)}).then(s => settings = s);
const guideDone = share => host.settings({share, guideDone: true}).then(s => { settings = s; $("#share").checked = share; $("#guide").classList.add("hidden") });
$("#guideShare").onclick = () => guideDone(true);
$("#guideNo").onclick = () => guideDone(false);
$("#stopBeep").onchange = e => host.settings({stopBeep: e.target.checked}).then(s => settings = s);
// goal: "next" (the default: the level after the one you're on), a typed level, or "off"
const goalOf = () => settings.goal === "off" ? 0 : +settings.goal >= 2 ? +settings.goal : "next";
function goalUi(){ const g = goalOf(); $("#goalNext").setAttribute("aria-pressed", String(g === "next")); $("#goalOff").setAttribute("aria-pressed", String(g === 0));
  $("#goal").value = typeof g === "number" && g ? g : "" }
// "I only buy meat and lemons": Red/Orange/White/Blue Potions are drops or quest rewards, so using them costs nothing
const FREE_POTS = ["2000000", "2000007", "2000001", "2000002", "2000003", "2000008"];
const freeIds = () => settings.meatOnly ? FREE_POTS : [];
function meatUi(){ $("#meatOnly").setAttribute("aria-pressed", String(!!settings.meatOnly)); $("#meatNote").textContent = settings.meatOnly ? "color potions count as free" : "" }
$("#meatOnly").onclick = () => host.settings({meatOnly: !settings.meatOnly}).then(s => { settings = s; session?.setFree(freeIds()); meatUi(); if (session) render() });
const setGoal = v => host.settings({goal: v}).then(s => { settings = s; session?.setGoal(goalOf()); goalUi(); if (session) render() });
$("#goal").onchange = e => { const v = Math.round(+e.target.value || 0); setGoal(v >= 2 ? Math.min(200, v) : "next") };
$("#goalNext").onclick = () => setGoal("next"); $("#goalOff").onclick = () => setGoal("off");
$("#alertItems").onchange = e => host.settings({alertItems: e.target.value.slice(0, 500)}).then(s => { settings = s; const n = alertSet().size; $("#alertItemsNote").textContent = n ? n + " item" + (n > 1 ? "s" : "") + " watched" : "" });
$("#alert").onchange = e => host.settings({alertWorth: Math.max(0, +e.target.value || 0)}).then(s => settings = s);
$("#miniBtn").onclick = () => { document.body.classList.add("mini"); host.mini(true) };
$("#mini").onclick = () => { document.body.classList.remove("mini"); host.mini(false) };
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
// title bar: File / View / Help open the app's menus under the button
for (const b of document.querySelectorAll("#titlebar [data-menu]")) b.onclick = () => { const r = b.getBoundingClientRect(); host.menu?.(b.dataset.menu, r.left, r.bottom) };
host.onMenu?.(what => {
  if (what === "help") openHelp();
  else if (what === "mini") (document.body.classList.contains("mini") ? $("#mini") : $("#miniBtn")).click();
  else if (what === "report") openBugPop();
  else if (what.startsWith("onTop:")){ const on = what === "onTop:true"; settings.onTop = on; $("#ontop").checked = on; $("#status").textContent = "Keep on top: " + (on ? "on" : "off") + "." }
  else if (what === "startStop"){ if (!$("#go").disabled) $("#go").click() }
  else if (what === "pause") $("#pauseBtn").click();
  else if (what === "invNow"){ if (timer == null || !engine?.invNow) $("#status").textContent = "Press Start first."; else { engine.invNow(); $("#status").textContent = "Reading your open inventory tab: keep it open a few seconds..." } }
  else if (what === "update"){ showTab("settings"); $("#updCheck").scrollIntoView(); $("#updCheck").click() }
});
// Theme (Settings): the presets (themes.js) and the player's own (settings.themes); settings.theme = "p:Name" or "u:Name".
// Edit colours previews live; Save keeps it as one of yours; share as a one-line code or a .mstheme file
const TH = window.TrackerThemes, darkQ = matchMedia("(prefers-color-scheme: dark)");
let thEdit = null;   // the theme being edited: {name, mode, c, from: "u:Name" when it's one of yours}
const myThemes = () => (Array.isArray(settings.themes) ? settings.themes : []).map(TH.clean).filter(Boolean);
const allThemes = () => [...TH.PRESETS.map(t => ["p:" + t.name, t]), ...myThemes().map(t => ["u:" + t.name, t])];
const themeNow = () => allThemes().find(([id]) => id === settings.theme)?.[1] || TH.PRESETS[0];
function themeShow(t = thEdit || themeNow()){
  const r = TH.apply(t, darkQ.matches);
  host.themeBar?.({color: r.c.panel, symbolColor: r.c.ink, bg: r.c.bg});
  return r;
}
function themeUi(){
  const cur = settings.theme || "p:" + TH.PRESETS[0].name;
  $("#themeSw").innerHTML = allThemes().map(([id, t]) => { const c = TH.resolve(t, darkQ.matches).c;
    return `<button role="radio" aria-checked="${id === cur}" data-th="${esc(id)}" style="background:${c.panel};color:${c.ink}" title="${esc(t.name)}${id.startsWith("u:") ? " (yours)" : ""}">`
      + `<span class="bars"><i style="background:${c.bg}"></i><i style="background:${c.accent}"></i><i style="background:${c.soft}"></i><i style="background:${c.leaf}"></i><i style="background:${c.bad}"></i></span>`
      + `<span class="nm">${esc(t.name)}${id.startsWith("u:") ? " ★" : ""}</span></button>` }).join("");
  const t = themeNow(); $("#themeNow").textContent = t.mode === "system" ? "Follows Windows' light or dark mode." : "";
}
async function themePick(id){ settings = await host.settings({theme: id}); thEdit = null; $("#themeEditor").classList.add("hidden"); themeShow(); themeUi() }
$("#themeSw").onclick = e => { const b = e.target.closest("[data-th]"); if (b) themePick(b.dataset.th) };
function editorUi(){
  const t = thEdit;
  $("#thName").value = t.name; $("#thMode").value = t.mode;
  $("#thColors").innerHTML = Object.entries(TH.TOKENS).map(([k, [, label]]) => `<label><input type="color" data-tk="${k}" value="${t.c[k]}"> ${esc(label)}</label>`).join("");
  $("#thDelete").classList.toggle("hidden", !t.from);
  thWarn();
}
// readable? text on boxes, faded text, and the buttons' text on the accent (WCAG: 4.5 for text, 3 for big/bold)
function thWarn(){
  const c = thEdit.c, low = [["Text", c.ink, c.panel, 4.5], ["Faded text", c.muted, c.panel, 3], ["Text on accent", c.on, c.accent, 3], ["Text on background", c.ink, c.bg, 4.5]]
    .filter(([, a, b, min]) => TH.contrast(a, b) < min).map(([n]) => n);
  $("#thWarn").textContent = low.length ? "Hard to read: " + low.join(", ") + ". Try a lighter or darker colour." : "";
}
$("#themeEdit").onclick = () => {
  const t = themeNow(), r = TH.resolve(t, darkQ.matches), mine = settings.theme?.startsWith("u:");
  thEdit = {name: mine ? t.name : t.name + " (mine)", mode: r.mode, c: {...r.c}, from: mine ? settings.theme : null};
  $("#themeEditor").classList.remove("hidden"); editorUi(); $("#thName").focus();
};
$("#thColors").oninput = e => { const k = e.target.dataset.tk; if (!k || !thEdit) return; thEdit.c[k] = e.target.value; themeShow(); thWarn() };
$("#thMode").onchange = e => { if (thEdit){ thEdit.mode = e.target.value; themeShow() } };
$("#thName").oninput = e => { if (thEdit) thEdit.name = e.target.value };
$("#thCancel").onclick = () => { thEdit = null; $("#themeEditor").classList.add("hidden"); themeShow() };
// saved under its name (the same name replaces that theme); at most 40 of your own
async function themeSave(t, from = null){
  const c = TH.clean(t); if (!c) return null;
  const list = myThemes().filter(x => "u:" + x.name !== from && x.name !== c.name);
  if (TH.PRESETS.some(p => p.name === c.name)) c.name += " (mine)";
  list.push(c); settings = await host.settings({themes: list.slice(-40), theme: "u:" + c.name});
  return c;
}
$("#thSave").onclick = async () => {
  if (!thEdit) return; const c = await themeSave({...thEdit, name: $("#thName").value}, thEdit.from);
  if (!c) return; thEdit = null; $("#themeEditor").classList.add("hidden"); themeShow(); themeUi(); $("#thNote").textContent = `Saved "${c.name}".`;
};
$("#thDelete").onclick = async () => {
  if (!thEdit?.from) return; const gone = thEdit.from;
  settings = await host.settings({themes: myThemes().filter(x => "u:" + x.name !== gone), theme: "p:" + TH.PRESETS[0].name});
  thEdit = null; $("#themeEditor").classList.add("hidden"); themeShow(); themeUi(); $("#thNote").textContent = "Theme deleted.";
};
// sharing: what's on screen (the one being edited, else the chosen one)
const themeShared = () => { const t = thEdit ? {...thEdit, name: $("#thName").value} : TH.resolve(themeNow(), darkQ.matches); return TH.clean(t) };
$("#thCopy").onclick = async () => {
  const code = TH.encode(themeShared()); $("#thCode").value = code;
  try { await navigator.clipboard.writeText(code); $("#thNote").textContent = "Share code copied: paste it anywhere. Others paste it under Share a theme." }
  catch { $("#thCode").select(); $("#thNote").textContent = "Copy the code from the box (Ctrl+C)." }
};
$("#thExport").onclick = () => {
  const t = themeShared(), a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify({app: "MS Classic Grind Tracker theme", v: 1, ...t}, null, 1)], {type: "application/json"}));
  a.download = t.name.replace(/[^\w ()-]+/g, "").trim().replace(/\s+/g, "-") + ".mstheme"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  $("#thNote").textContent = "Saved as " + a.download + ".";
};
async function themeAdd(t, how){
  if (!t) return $("#thNote").textContent = how === "file" ? "That file isn't a tracker theme." : "That isn't a theme code (they start with MSCT1.).";
  const c = await themeSave(t); themeShow(); themeUi(); $("#thNote").textContent = `Added "${c.name}" and switched to it.`;
}
$("#thPaste").onclick = () => { themeAdd(TH.decode($("#thCode").value), "code"); $("#thCode").value = "" };
$("#thCode").onkeydown = e => { if (e.key === "Enter") $("#thPaste").click() };
$("#thOpen").onclick = () => $("#thFile").click();
$("#thFile").onchange = async e => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
  if (f.size > 20000) return $("#thNote").textContent = "That file is too big for a theme.";
  const text = await f.text(); let t = TH.decode(text); if (!t) try { t = TH.clean(JSON.parse(text)) } catch {}
  themeAdd(t, "file") };
darkQ.addEventListener?.("change", () => { themeShow(); themeUi() });

// Preferences: keyboard shortcuts (they work from the game too; main.js registers them) and the see-through window
const KEY_NAMES = {onTop: "Keep on top on/off", startStop: "Start / Stop", pause: "Pause / go on", mini: "Mini bar on/off",
  show: "Hide / show the tracker", invNow: "Read the open inventory tab now", report: "Report a bug"};
const keyText = k => k ? k.replace("CommandOrControl", "Ctrl").replace("Super", "Win").replace(/\+/g, " + ") : "Off";
const CODE_KEY = {Space: "Space", Tab: "Tab", Delete: "Delete", Insert: "Insert", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Minus: "-", Equal: "=", Comma: ",", Period: ".", Slash: "/",
  Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Backquote: "`", Backspace: "Backspace"};
// a keydown -> Electron accelerator ("CommandOrControl+Shift+T"); null while only modifiers are down
function accelOf(e){
  const c = e.code, key = /^Key[A-Z]$/.test(c) ? c[3] : /^Digit\d$/.test(c) ? c[5] : /^F\d{1,2}$/.test(c) ? c : /^Numpad\d$/.test(c) ? "num" + c[6] : CODE_KEY[c];
  if (!key) return null;
  return [e.ctrlKey && "CommandOrControl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super", key].filter(Boolean).join("+");
}
let keyState = {keys: {}, defaults: {}, failed: []}, keyWait = null;
function keysUi(note){
  $("#keyRows").innerHTML = Object.entries(KEY_NAMES).map(([a, name]) => `<tr><td>${esc(name)}</td><td class="n"><button class="alt keyset${keyState.failed.includes(a) ? " bad" : ""}" data-key="${a}" title="Click, then press the new keys">${esc(keyWait === a ? "Press keys..." : keyText(keyState.keys[a]))}</button></td></tr>`).join("");
  if (note !== undefined) $("#keysNote").textContent = note;
  else if (keyState.failed.length) $("#keysNote").textContent = keyState.failed.map(a => KEY_NAMES[a]).join(", ") + ": those keys are taken by another program. Pick others.";
  // the shortcut on the Bug button's tooltip
  $("#bugBtn").title = "Report a bug" + (keyState.keys.report ? ` (${keyText(keyState.keys.report)}, works from the game too)` : "");
}
async function keysSet(change, note){ keyState = await host.keys?.(change) || keyState; keyWait = null; keysUi(note) }
$("#keyRows").onclick = async e => {
  const b = e.target.closest("[data-key]"); if (!b) return;
  if (keyWait){ const a = keyWait; keyWait = null; await keysSet(null, ""); if (a === b.dataset.key) return }   // clicked again: cancel
  keyWait = b.dataset.key; await host.keys?.(null, true); keysUi("Press the new keys for " + KEY_NAMES[keyWait] + " (Esc cancels, Backspace turns it off).");
  // the shortcuts are off while it waits: back on after 15 s, or when the window loses focus
  const w = keyWait; setTimeout(() => { if (keyWait === w) keysSet(null, "") }, 15e3);
};
addEventListener("blur", () => { if (keyWait) keysSet(null, "") });
document.addEventListener("keydown", e => {
  if (!keyWait) return;
  e.preventDefault(); e.stopPropagation();
  const a = keyWait;
  if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey) return keysSet(null, "");
  if (e.code === "Backspace" && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) return keysSet({[a]: ""}, KEY_NAMES[a] + ": off.");
  const k = accelOf(e); if (!k) return;   // only modifiers so far
  if (!/^F\d+$/.test(k.split("+").pop()) && !e.ctrlKey && !e.altKey && !e.metaKey) return keysUi("Add Ctrl or Alt to that key (Shift alone would take a letter from chat), or use an F key.");
  if (k === "Alt+F4") return keysUi("Alt+F4 closes windows: pick another.");
  const clash = Object.keys(KEY_NAMES).find(x => x !== a && keyState.keys[x] === k);
  keysSet({[a]: k, ...(clash ? {[clash]: ""} : {})}, KEY_NAMES[a] + ": " + keyText(k) + (clash ? ` (taken off ${KEY_NAMES[clash]})` : "") + ".");
}, true);
$("#keysReset").onclick = () => keysSet(Object.fromEntries(Object.entries(keyState.defaults).map(([a, k]) => [a, k])), "Shortcuts back to the defaults.");
$("#opacity").oninput = e => { $("#opacityV").textContent = e.target.value + "%" };
$("#opacity").onchange = e => host.settings({opacity: Math.min(1, Math.max(0.4, +e.target.value / 100))}).then(x => settings = x);
$("#updCheck").onclick = async () => { $("#updNote").textContent = "Checking..."; showUpdate(await host.updateCheck?.()) };
// Install (Settings) and Restart and update (the banner, which stays on top while scrolling) do the same
$("#updInstall").onclick = () => $("#updGo").click();
$("#updGo").onclick = async () => {
  $("#updGo").disabled = true; $("#updInstall").disabled = true; $("#updNote").textContent = "Installing... the tracker closes and opens again by itself.";
  if (timer != null){ $("#status").textContent = "Saving this session before the update..."; await finish() }
  if (!await host.updateInstall?.()){ $("#updGo").disabled = $("#updInstall").disabled = false; $("#status").textContent = "The update isn't ready yet." }
};
(async () => {
  host.version?.().then(v => { if (!v) return; $("#appVer").textContent = v; $("#helpVer").textContent = "MS Classic Grind Tracker " + v }).catch(() => {});
  host.updateState?.().then(u => u.state !== "idle" && showUpdate(u)).catch(() => {});
  settings = await host.settings();
  $("#share").checked = !!settings.share;
  layoutLoad(settings.layout); for (const b of BOXES) foldMark(b);
  $("#job").value = settings.job || "";
  $("#ontop").checked = settings.onTop !== false;
  const op = Math.round((+settings.opacity || 1) * 100); $("#opacity").value = op; $("#opacityV").textContent = op + "%";
  keysSet(null); themeShow(); themeUi();
  // the old "Show me where my potions are" box (removed in 0.2.36): counts are looked for on the whole screen again
  if (settings.countArea) settings = await host.settings({countArea: null});
  $("#alert").value = settings.alertWorth || 0;
  $("#alertItems").value = settings.alertItems || "";
  $("#stopBeep").checked = settings.stopBeep !== false;
  $("#kpqAct").value = settings.kpqAct || "auto"; $("#kpqMode").value = settings.kpqMode === "Rush" ? "Rush" : "Bonus";
  $("#autoPause").checked = settings.autoPause !== false;   // on unless turned off   // on unless turned off
  goalUi(); meatUi();
  $("#pcode").value = settings.partyCode || "";
  $("#nick").value = settings.nick || "";
  $("#guide").classList.toggle("hidden", !!settings.guideDone);
  const found = await host.gameFound();
  $("#status").textContent = found ? "MapleStory window found." : "Start MapleStory, then press Start.";
})();
