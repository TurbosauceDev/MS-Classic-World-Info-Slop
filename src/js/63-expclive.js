/* ---------------- EXP/hr calculator: live from the screen ---------------- */
// The browser version of the Grind Tracker's core (Danny 10-21: "most of the functionality of the desktop app, as a
// browser feature", so macOS players get it too). A shared game window is read with the app's own code, not a copy:
// readers.js (EXP bar, pickup lines, party bars, potion counts; inlined in 54-invprice.js), tracker/core/session.js
// (rates, active time, level-ups, loot value) and tracker/core/gamedata.js (D -> the app's game data), inlined below by
// build.py. Left out (browsers can't, or it needs OCR): map/job/death reading, global keys, click-through overlay.
// Map and class come from the page's pickers. A finished run goes to the saved sessions (62-expcalc.js, window.EXPC).
/*@GAMEDATA*/
/*@SESSION*/
(() => {
const R = window.GrindReaders, GS = window.GrindSession, $e = id => document.getElementById(id);
const PAUSE_MS = 5000;   // EXP bar off screen this long (Cash Shop, changing channel, minimized): the clock stops
let G = null, L = null, last = null, rendT = 0;   // L: the live run; last: the run just stopped (for Save as image)
const hms = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` };
const hrsTxt = h => h == null || !isFinite(h) ? "–" : dur(h * 3600);
const gameData = async () => { await ASSETS; return G || (G = GrindGamedata.toGamedata(D)) };

// ticks from a worker: a page in a background tab (the game in front) gets its own timers slowed to once a minute
function ticker(ms, f){
  let iv = null, w = null;
  const plain = () => { if (!iv) iv = setInterval(f, ms) };
  try { w = new Worker(URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms})`], {type: "text/javascript"}))); w.onmessage = f; w.onerror = () => { w.terminate(); w = null; plain() } }
  catch(e){ plain() }
  return () => { clearInterval(iv); w?.terminate() };
}

/* ---- a run: begin() starts the maths (tests call it without a screen), feed() reads one RGBA frame ---- */
async function begin(){
  const g = await gameData(), p = EXPC.pick(), t = Date.now();
  let icons = []; try { icons = await R.loadIcons(g) } catch(e) {}   // potions/arrows: counts on the quick slots and Use tab
  const sess = GS.createSession(g, {goalLevel: p.goal || "next"});
  L = {sess, rd: R.createReaders(g, icons), t0: t, barAt: t, held: false, auto: false, seen: {}, pick: p};
  sess.add({t, type: "job", name: p.cls});
  if (p.map) sess.add({t, type: "map", id: p.map});
  last = null; ui(); render(true);
}
function feed(f, t = Date.now()){
  if (!L) return;
  const ev = L.rd.readFrame(f, t, R.native(f, true)), info = L.rd.info;
  for (const e of ev){
    if (e.type === "glyph" || e.type === "kpqtime") continue;
    if (L.held && /^(exp|bonus|meso|item|itemraw)$/.test(e.type)) continue;   // paused by hand: a break, nothing counts
    L.sess.add(e);
    if (/^(exp|bonus|meso|item|itemraw)$/.test(e.type)) L.seen.lines = t;
  }
  if (info.bar){ L.seen.bar = t; L.barAt = t; if (L.auto){ L.auto = false; if (!L.held) L.sess.add({t, type: "resume"}) } }
  else if (!L.auto && t - L.barAt > PAUSE_MS){ L.auto = true; L.sess.add({t: L.barAt, type: "pause"}) }
  L.seen.party = info.partyWindow;
  render();
}
function pause(){
  if (!L) return; const t = Date.now();
  L.held = !L.held; L.sess.add(L.held ? {t, type: "pause", hold: true} : {t, type: "resume"});
  ui(); render(true);
}
// the run as a saved session; null when nothing was gained
function record(){
  const s = L.sess.stats(), p = EXPC.pick(), Lv = s.level || +$("#ecl1").value || 1;
  if (!(s.exp > 0) || !(s.activeMin > 0.1)) return null;
  const model = p.map ? EXPC.modelRate(p.cls, Lv, p.map, s.party) : null;
  return {t: L.t0, cls: p.cls, L: Lv, map: p.map, party: s.party, card: p.card, min: +s.activeMin.toFixed(1), gain: s.exp, rate: s.expHr,
    est: model != null ? model * p.card : null, mesosHr: s.mesosHr, kills: s.kills, live: true};
}
function stop(){
  if (!L) return;
  const r = record(); if (r) EXPC.addRec(r);
  last = r && {...r, next: hrsTxt(L.sess.stats().toLevelHrs)};
  unshare(); L = null; ui();
  $e("eclst").innerHTML = r ? `Saved to your sessions below: <b>${fmt(r.rate)}</b> EXP/hr over ${r.min} min. <button class="btn sm" id="eclimg" type="button">Save as image</button><span id="eclimgout"></span>` : "Stopped. Nothing was gained, so nothing was saved.";
  $e("eclimg")?.addEventListener("click", () => EXPC.saveImage(last, $e("eclimgout")));
}
addEventListener("pagehide", () => { if (L){ const r = record(); if (r) EXPC.addRec(r) } });   // tab closed mid-run: keep it

/* ---- the screen ---- */
let C = null;   // {stream, video, cap, canvas, stop, busy}
async function share(){
  const st = $e("eclst");
  if (!navigator.mediaDevices?.getDisplayMedia){ st.textContent = "Needs a desktop browser (Chrome, Edge, Firefox, Safari)."; return }
  let stream;
  try { stream = await navigator.mediaDevices.getDisplayMedia({video: {frameRate: 5}, audio: false}) }
  catch(e){ st.textContent = e.name === "NotAllowedError" ? "Sharing cancelled." : "This page can't share your screen here: open the site in your browser."; return }
  const video = document.createElement("video"); video.muted = true; video.playsInline = true; video.srcObject = stream;
  try { await video.play() } catch(e) {}
  const track = stream.getVideoTracks()[0];
  C = {stream, video, canvas: document.createElement("canvas"), cap: window.ImageCapture ? new ImageCapture(track) : null};
  track.addEventListener("ended", () => L ? stop() : unshare());
  st.textContent = "Loading the game's item pictures…";
  await begin();
  C.stop = ticker(500, grab);
}
function unshare(){
  if (!C) return;
  C.stop?.(); C.stream.getTracks().forEach(t => t.stop()); C = null;
  L?.pip?.close();
}
async function grab(){
  if (!C || C.busy || !L) return; C.busy = true;
  try {
    let src = null;
    if (C.cap && C.cap.track?.readyState === "live") try { src = await C.cap.grabFrame() } catch(e) {}   // works in a background tab
    if (!src){ if (!C.video.videoWidth) return; src = C.video }
    const w = src.videoWidth || src.width, h = src.videoHeight || src.height, c = C.canvas;
    if (c.width !== w || c.height !== h){ c.width = w; c.height = h }
    const g = c.getContext("2d", {willReadFrequently: true}); g.drawImage(src, 0, 0); src.close?.();
    feed({w, h, d: g.getImageData(0, 0, w, h).data});
  } catch(e) {} finally { if (C) C.busy = false }
}

/* ---- what's shown ---- */
function ui(){
  const on = !!L;
  $e("eclshare").hidden = on; $e("eclpause").hidden = !on; $e("eclstop").hidden = !on;
  $e("eclmini").hidden = !on || !window.documentPictureInPicture;
  $e("eclpause").textContent = L?.held ? "Resume" : "Pause"; $e("eclpause").setAttribute("aria-pressed", !!L?.held);
  $e("eclout").hidden = !on;
}
function render(now){
  if (!L) return;
  const t = Date.now(); if (!now && t - rendT < 900) return; rendT = t;
  const s = L.sess.stats(), p = EXPC.pick(), sn = L.seen, ok = (k, ms) => sn[k] && t - sn[k] < ms;
  const model = p.map && s.level ? EXPC.modelRate(p.cls, s.level, p.map, s.party) : null, est = model != null ? model * p.card : null;
  const state = L.held ? "Paused" : L.auto ? "Paused: EXP bar off screen" : s.paused ? "Idle" : "Reading";
  const bar = L.sess.state.bar;
  $e("eclst").innerHTML = `<span class="pill ${L.held || L.auto ? "p-warn" : ""}">${state}</span> Active ${hms(s.activeMin * 6e4)} of ${hms(t - L.t0)}.`;
  const stat = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
  const lvl = s.level ? `${s.level}${bar?.pct != null ? ` <span class="sub">${bar.pct.toFixed(2)}%</span>` : ""}${s.levelUps.length ? ` <span class="sub">(+${s.levelUps.length})</span>` : ""}` : "–";
  const items = s.items.slice(0, 8), used = s.used.filter(u => u.n > 0).slice(0, 6), mobs = s.mobs.slice(0, 6);
  $e("eclout").innerHTML = `<div class="big">${fmt(s.expHr)} <small>EXP/hr${s.expHr5 != null ? ` · last 5 min ${fmt(s.expHr5)}` : ""}</small></div>
    <dl class="stats">${stat("EXP gained", fmt(s.exp))}${stat("Level", lvl)}${stat("Next level in", hrsTxt(s.toLevelHrs))}${s.goalLevel > (s.level || 0) + 1 ? stat("Level " + s.goalLevel + " in", hrsTxt(s.toGoalHrs)) : ""}
      ${stat("Mesos/hr", fmt(s.mesosHr))}${stat("Mesos", fmt(s.mesos))}${stat("Kills/hr", fmt(s.killsHr))}${stat("Kills", fmt(s.kills))}
      ${stat("Loot value/hr", fmt(s.lootHr))}${s.usedCostHr >= 0.5 ? stat("Potions/hr", "−" + fmt(s.usedCostHr)) : ""}${stat("Net mesos/hr", fmt(s.netHr))}${s.deaths ? stat("Deaths", s.deaths) : ""}
      ${est ? stat("vs our estimate", Math.round(s.expHr / est * 100) + "%") : ""}</dl>
    <div class="eclread"><span class="pill ${ok("bar", 3000) ? "p-good" : "p-warn"}">EXP bar ${ok("bar", 3000) ? "✓" : "not seen"}</span>
      <span class="pill ${ok("lines", 120e3) ? "p-good" : ""}">Pickup lines ${ok("lines", 120e3) ? "✓" : "none yet"}</span>
      <span class="pill">${s.party > 1 ? "Party of " + s.party : "Solo"}</span>${p.map ? "" : `<span class="pill p-warn">Pick a map to name kills</span>`}
      ${s.readShare != null && s.readShare < 0.7 && s.exp > 0 ? `<span class="pill p-warn">${Math.round(s.readShare * 100)}% of EXP seen as lines: kills, mesos and loot are undercounted</span>` : ""}</div>
    ${items.length || used.length || mobs.length ? `<div class="ecllist">
      ${items.length ? `<div><h4>Loot</h4><ul>${items.map(i => `<li><span>${esc(i.name)} ×${fmt(i.n)}</span><span>${fmt(i.total)}</span></li>`).join("")}</ul></div>` : ""}
      ${mobs.length ? `<div><h4>Monsters</h4><ul>${mobs.map(m => `<li><span>${esc(m.name)}</span><span>${fmt(m.kills)}</span></li>`).join("")}</ul></div>` : ""}
      ${used.length ? `<div><h4>Used</h4><ul>${used.map(u => `<li><span>${esc(u.name)} ×${fmt(u.n)}</span><span>${u.total == null ? "?" : fmt(u.total)}</span></li>`).join("")}</ul></div>` : ""}
    </div>` : ""}`;
  if (L.pip) miniDraw(s, state);
}

/* ---- Mini view: a small always-on-top window (Document Picture-in-Picture, Chrome/Edge) ---- */
async function mini(){
  if (!L) return;
  if (L.pip){ L.pip.close(); return }
  let w; try { w = await documentPictureInPicture.requestWindow({width: 300, height: 190}) } catch(e){ return }
  const root = document.documentElement;
  for (const a of root.attributes) w.document.documentElement.setAttribute(a.name, a.value);
  document.querySelectorAll("style").forEach(st => w.document.head.append(st.cloneNode(true)));
  w.document.title = "EXP/hr";
  w.document.body.innerHTML = `<div class="eclmini"><div id="mm"></div><button class="btn sm" id="mmpause" type="button">Pause</button></div>`;
  w.document.getElementById("mmpause").addEventListener("click", pause);
  w.addEventListener("pagehide", () => { if (L) L.pip = null; $e("eclmini").textContent = "Mini view" });
  L.pip = w; $e("eclmini").textContent = "Close mini view"; render(true);
}
function miniDraw(s, state){
  const d = L.pip.document, m = d.getElementById("mm"); if (!m) return;
  m.innerHTML = `<div class="mmbig">${fmt(s.expHr)} <small>EXP/hr</small></div>
    <div class="mmrow"><span>${fmt(s.mesosHr)} mesos/hr</span><span>${fmt(s.killsHr)} kills/hr</span></div>
    <div class="mmrow"><span>Next level ${hrsTxt(s.toLevelHrs)}</span><span>${hms(s.activeMin * 6e4)}</span></div>
    <div class="mmrow sub"><span>${state}</span><span>${s.level ? "Lv " + s.level : ""}</span></div>`;
  d.getElementById("mmpause").textContent = L.held ? "Resume" : "Pause";
}

$e("eclshare").addEventListener("click", share);
$e("eclpause").addEventListener("click", pause);
$e("eclstop").addEventListener("click", stop);
$e("eclmini").addEventListener("click", mini);
// the pickers feed the run: map names kills, class/goal for time to goal
$("#ecmap").addEventListener("change", () => { const p = EXPC.pick(); if (L && p.map !== L.pick.map){ L.pick = p; L.sess.add({t: Date.now(), type: "map", id: p.map}); render(true) } });
$("#ecgoalL").addEventListener("input", () => { if (L){ L.sess.setGoal(+$("#ecgoalL").value || "next"); render(true) } });
$("#eccls").addEventListener("change", () => { if (L){ L.sess.add({t: Date.now(), type: "job", name: $("#eccls").value}); render(true) } });
window.EXPLIVE = {begin, feed, pause, stop, get run(){ return L }};   // tests
})();
