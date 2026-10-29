// Tracker window, Start/Stop, inventory tab chips, run summary, run name, frame pictures, Report a bug (renderer.js is split in load order; all share one global scope, see renderer.js)
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
  starting = true; $("#status").className = ""; $("#status").textContent = "Opening the MapleStory window...";
  FPS = 2; slowTicks = 0;   // before the capture opens: it runs at FPS frames a second
  try { await startCapture(); ICONS ||= await GrindReaders.loadIcons(G).catch(() => []) }   // once: potion/arrow pictures for the counts
  finally { starting = false }
  timer = 0;   // running (the first tick sets the real timeout)
  session = GrindSession.createSession(G, {idleMs: (settings.idleSec || 60) * 1000, goalLevel: goalOf(), freeIds: freeIds()}); stopWarned = false;
  // every 15 minutes of non-stop farming on one map with the same party is one shared run (when sharing is on)
  slicer = GrindSession.createRunSlicer(G, {idleMs: 60e3, onRun: run => { if (settings.share && !kpq?.on){ runsSent++; host.shareRun({...run, partyCode: settings.partyCode || null}) } showSpeed(run) }});
  wrap = null; runT0 = Date.now(); $("#summary").classList.add("hidden"); check = {t0: Date.now()}; lastKeep = 0; RECENT.length = 0; log("start", {fps: FPS, w: video.videoWidth, h: video.videoHeight});
  kpqReset(); held = false; barSeen = false; goneSince = null; levelsShown = 0; deathSeen = 0; deathPending = null; boxHad = 0; boxPending = null; boxSeen = new Map(); Object.assign(deaths, {confirmed: 0, lost: 0, unseen: 0});
  snaps.start = snaps.start?.hand && Date.now() - snaps.start.t < 60e3 ? snaps.start : null; snaps.end = null;   // a start snapped just before Start is kept
  engine = makeEngine(ICONS, null, settings.invArea || null, settings.glyphs || [], settings.invLast || null); scale = null; fastLeft = 0; lastPix = null; skipped = 0; log("engine", {kind: engine.kind});
  mapNow = mapSeen = null; mapMissing = 0; jobNow = jobSeen = null; lastJob = 0; lastParty = 0; runsSent = 0; kpqSent = 0; FPS = 2; slowTicks = 0;
  // a job picked by hand wins; "Auto" reads it from the status bar
  if (settings.job){ const e = {t: Date.now(), type: "job", name: settings.job}; session.add(e); slicer.add(e) }
  feed = GrindFeed.createFeed(G); feedSep("Started tracking");
  clearInterval(autoTimer); autoTimer = setInterval(autosaveNow, 60e3);
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
    if (kpq?.on) kpqEnd(t, true, "stopped");
    log("wrap", {}); feedAdd(feed?.step(session.state, t, feedWho(), true)); feedSep("Stopped");
    if (video?.srcObject?.active && video.videoWidth && !snaps.end?.hand) await snap("end", grab(), false).catch(() => {});
    $("#status").textContent = "Stopped. Open your inventory on Equip, Use and Etc for a second each, then add a name or note if you like and press Finalize log.";
    render(); $("#wrap").scrollIntoView?.({block: "nearest"});
  } finally { stopping = false }
}
function resume(){
  if (!wrap || timer == null) return;
  const e = {t: Date.now(), type: "resume"}; session.add(e); slicer.add(e); log("event", e);
  wrap = null; lockGo(1000); $("#status").textContent = "Tracking again."; feedSep("Tracking again"); render();
}
async function finish(){
  if (stopping || timer == null) return;
  stopping = true; $("#wrapEnd").disabled = true; lockGo(3000);
  const t1 = wrap?.t || Date.now();
  try { await stopNow() } finally { stopping = false; wrap = null; $("#wrapEnd").disabled = false; renderWrap(); renderState(session?.stats()) }
  try { showSummary(t1) } catch (e){ log("summary", {err: e.message}) }
  $("#runName").value = $("#wrapName").value = $("#runNote").value = "";
}
// Discard run (Danny 2026-10-29: an accidental Start leaves a few-second log): same wrap-up as Finalize but nothing is saved.
// Two clicks: the first arms the button (red, "Really discard?") for 5 s, the second throws the run away.
async function discard(){
  if (stopping || timer == null) return;
  stopping = true; lockGo(3000);
  try {
    clearTimeout(timer); timer = null; engine?.close(); clearInterval(autoTimer); autoTimer = null;
    video?.srcObject?.getTracks().forEach(tr => tr.stop());
    await host.autosave?.(null);
  } finally { stopping = false; wrap = null }
  renderState(session?.stats()); resetTracker(); $("#status").textContent = "Run discarded. Nothing was saved."
}
function armDiscard(btn){
  if (btn.classList.contains("armed")){ clearTimeout(btn._t); btn.classList.remove("armed"); btn.textContent = btn.dataset.label; return discard() }
  btn.dataset.label = btn.textContent; btn.classList.add("armed"); btn.textContent = "Really discard?";
  btn._t = setTimeout(() => { btn.classList.remove("armed"); btn.textContent = btn.dataset.label }, 5000);
}
for (const id of ["#wrapDrop", "#miniWrapDrop", "#fzWrapDrop"]) $(id).onclick = () => armDiscard($(id));
async function stopNow(){
  log("stop", {engine: engine?.kind, skipped});
  if (!wrap && video?.srcObject?.active && video.videoWidth && !snaps.end?.hand) await snap("end", grab(), false).catch(() => {}); if (check && !check.ended){ check = null; renderCheck() }
  clearTimeout(timer); timer = null; engine?.close(); $("#partyBox").classList.add("hidden"); $("#miniParty").textContent = ""; $("#fzParty").textContent = "";
  video?.srcObject?.getTracks().forEach(tr => tr.stop());
  // a failed save (disk full, folder locked) must not leave the button saying Stop
  // the start/end readings go with it: History's EXP/hr comes from them when both are complete
  const a = snaps.start, b = snaps.end, snapExp = a && b && b.t > a.t ? GrindSession.expBetween(G, a, b) : null;
  const snapRec = snapExp != null ? {startLevel: a.level, startPct: a.pct, endLevel: b.level, endPct: b.pct, minutes: Math.round((b.t - a.t) / 6e3) / 10, exp: Math.round(snapExp)} : null;
  if (!snapRec && session?.state.events) $("#status").textContent = "Saved, but the start or end EXP reading is missing: History uses the live count for this one.";
  if (session && session.state.events) await host.saveSession(sessionRecord(snapRec)).catch(e => { $("#status").textContent = "Couldn't save this session: " + e.message });   // main.js drops the autosave once it's written
  else host.autosave?.(null);   // nothing counted: nothing to recover either
  clearInterval(autoTimer); autoTimer = null;
  renderState(session?.stats());
}
// Reset (Danny 2026-10-23: "cleaner in between use sessions"): only while not tracking. Clears the numbers, both logs, the
// start/end readings and the last summary back to a just-opened window; saved runs stay in Past sessions
function resetTracker(){
  if (timer != null || starting){ $("#status").textContent = "Stop and finalize the run first, then Reset."; return false }
  if (dummyOn) dummyClear();
  session = GrindSession.createSession(G, {idleMs: (settings.idleSec || 60) * 1000, goalLevel: goalOf(), freeIds: freeIds()});
  snaps.start = snaps.end = null; wrap = null; runT0 = 0; feed = null;
  for (const id of ["#summary", "#lastRun", "#partyBox", "#respawn"]) $(id).classList.add("hidden");
  $("#feed").innerHTML = $("#miniFeed").innerHTML = $("#fzFeed").innerHTML = $("#events").innerHTML = "";
  $("#runName").value = $("#wrapName").value = $("#runNote").value = "";
  try { renderSnaps(render()) } catch (e){ log("reset", {err: e.message}) }
  session = null; renderState(null); renderWrap();
  $("#status").className = ""; $("#status").textContent = "Reset: ready for a new run.";
  return true;
}
$("#resetBtn").onclick = resetTracker;
// what History keeps of a run (saved at Finalize log; the same thing autosaved every minute while tracking)
function sessionRecord(snapRec){
  return {shared: !!settings.share, ...session.shareable(), snap: snapRec, inv: session.stats().inv.map(({id, n, alike}) => ({id, n, alike})), name: runName() || null, note: $("#runNote").value.trim() || null, ...runExtras(), kpq: kpq?.on ? {mode: settings.kpqMode || "Bonus", rounds: kpq.rounds, timeline: kpqTimeline(Date.now()), best: kpq.times.length ? Math.round(Math.min(...kpq.times)) : null, avg: kpq.times.length ? Math.round(kpq.times.reduce((a, b) => a + b, 0) / kpq.times.length) : null} : null, lootValue: Math.round(session.stats().lootValue), levelUps: session.state.levelUps.map(({t, ...l}) => l),
    // EXP, farming time and kills per map visited (the run's map is the one with the most EXP, not where it ended)
    maps: session.stats().maps.slice(0, 12).map(m => ({map: m.map, name: m.name, exp: Math.round(m.exp), min: Math.round(m.min * 10) / 10, kills: m.kills}))};
}
// crash recovery: while tracking, the run so far is written every minute (main.js: sessions/autosave.json, swapped in whole);
// a normal save or a run with nothing in it removes it. On the next launch a left-over one is offered back (recoverCheck)
let autoTimer = null;
function autosaveNow(){
  if (timer == null || !session?.state.events || dummyOn) return false;
  try { host.autosave?.({...sessionRecord(null), autosaved: Date.now()})?.catch?.(() => {}); return true } catch (e){ log("autosave", {err: e.message}); return false }
}
async function recoverCheck(){
  const x = await host.autosaveGet?.().catch(() => null); if (!x || typeof x !== "object") return;
  const at = new Date(+x.autosaved || Date.now()).toLocaleString([], {weekday: "short", hour: "numeric", minute: "2-digit"});
  $("#recoverText").textContent = `A run wasn't saved: the tracker closed while it was tracking (last saved ${at}). ${[x.mapName, Math.round(+x.activeMin || 0) + " min farming", fmt(+x.expTotal || +x.exp || 0) + " EXP", fmt(+x.mesos || 0) + " mesos"].filter(Boolean).join(" · ")}.`;
  $("#recover").classList.remove("hidden");
  $("#recoverSave").onclick = async () => { const {autosaved, ...rec} = x;
    await host.saveSession({...rec, recovered: true, note: [rec.note, "Recovered after the tracker closed (up to the last minute's autosave)."].filter(Boolean).join("\n")});
    $("#recover").classList.add("hidden"); $("#status").textContent = "Recovered run saved to History."; if (modalIsOpen($("#histPop"))) loadHist() };
  $("#recoverDrop").onclick = async () => { await host.autosave?.(null); $("#recover").classList.add("hidden"); $("#status").textContent = "Unsaved run discarded." };
}
// more about the run for History: who played it, levels, clock time, the best drop, the monster killed most
const worthOf = id => GrindSession.lootPrice(G, id).each;   // Etc monster drops at NPC price (core/session.js lootPrice)
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
$("#miniWrapEnd").onclick = () => { if (!$("#wrapEnd").disabled) finish() };
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
  modalOpen($("#bugPop"), $("#bugPopNote"));
}
const closeBugPop = () => { modalClose($("#bugPop"), $("#bugBtn")); $("#bugPopNote").value = ""; bugFrames = null };
$("#bugPop")._close = closeBugPop;
$("#bugBtn").onclick = openBugPop;
$("#bugPopCancel").onclick = closeBugPop;
$("#bugPopSave").onclick = () => { const f = bugFrames || [], n = $("#bugPopNote").value; closeBugPop(); saveReport(f, n) };
$("#bugPopNote").onkeydown = e => { if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); $("#bugPopSave").click() } };

$("#pcode").onchange = e => host.settings({partyCode: e.target.value.trim().slice(0, 20)}).then(s => { settings = s; lastParty = 0; if (!s.partyCode){ $("#partyBox").classList.add("hidden"); $("#miniParty").textContent = ""; $("#fzParty").textContent = "" } });
$("#nick").onchange = e => host.settings({nick: e.target.value.trim().slice(0, 12)}).then(s => settings = s);
const guideDone = share => host.settings({share, guideDone: true}).then(s => { settings = s; $("#share").checked = share; $("#guide").classList.add("hidden") });
$("#guideShare").onclick = () => guideDone(true);
$("#guideNo").onclick = () => guideDone(false);
