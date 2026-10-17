// Tracker window: grabs 2 frames a second from the game window, runs the readers, shows the session.
const G = GAMEDATA, $ = s => document.querySelector(s), fmt = n => Math.round(n).toLocaleString();
const FPS = 2;
let session = null, slicer = null, readers = null, video = null, timer = null, settings = {};
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
  if (isBlack()){
    await host.wholeScreen(true); await openStream();
    $("#status").textContent = isBlack() ? "Capture is black even for the whole screen. Try windowed mode in the game's settings."
      : "Game window came back black, so this is reading the whole screen instead. That only works with the game in full screen.";
  } else $("#status").textContent = "Reading the MapleStory window.";
}
function grab(){
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  g.drawImage(video, 0, 0);
  const id = g.getImageData(0, 0, canvas.width, canvas.height);
  return {w: id.width, h: id.height, d: id.data};
}

// sharing progress: minutes into the current 15-minute run, and runs sent this session
let runsSent = 0;
function runInfo(){
  const S = slicer?.current?.state, min = S && S.last !== null ? Math.floor((S.last - S.start) / 6e4) : 0;
  return `shared run ${min}/15 min` + (runsSent ? `, ${runsSent} sent` : "");
}
function render(){
  const s = session.stats();
  $("#killsHr").textContent = fmt(s.killsHr);
  $("#expHr").textContent = fmt(s.expHr);
  $("#expHr5").textContent = s.expHr5 == null ? "" : "last 5 min: " + fmt(s.expHr5);
  $("#killsEst").textContent = s.killsEstHr == null ? "" : "~" + fmt(s.killsEstHr) + " with missed lines (est.)";
  $("#ttl").textContent = s.toLevelHrs == null ? "-" : s.toLevelHrs < 1 ? Math.round(s.toLevelHrs * 60) + " min" : s.toLevelHrs.toFixed(1) + " h";
  $("#mesosHr").textContent = fmt(s.mesosHr);
  $("#miniExp").textContent = fmt(s.expHr); $("#miniTtl").textContent = $("#ttl").textContent;
  $("#miniNote").textContent = s.expHr5 == null ? "" : "last 5 min: " + fmt(s.expHr5) + " EXP/hr";
  $("#lootHr").textContent = fmt(s.lootHr);
  $("#active").textContent = Math.round(s.activeMin) + " min";
  $("#where").textContent = [s.level && "Lv " + s.level, s.mapName, s.job, s.party > 1 ? "party of " + s.party : "solo",
    s.kills + " kills", fmt(s.mesoPerKill) + " mesos/kill",
    s.readShare != null && Math.round(s.readShare * 100) + "% of EXP seen as messages",
    settings.share && runInfo()].filter(Boolean).join(" · ");
  $("#mobs").innerHTML = s.mobs.map(m => `<tr><td>${m.name}</td><td class="n">${m.kills} kills</td><td class="n">${fmt(m.mesoPerKill)} mesos/kill</td></tr>`).join("");
  $("#items").innerHTML = s.items.map(i => `<tr><td>${i.name}</td><td class="n">×${i.n}</td><td class="n">${fmt(i.total)}</td></tr>`).join("")
    + (s.unreadItems ? `<tr><td colspan="3">${s.unreadItems} pickup(s) with names not read yet</td></tr>` : "");
  $("#priceNote").textContent = G.pwRead ? `Worth = player-shop median from meso.watch (${G.pwRead}), else NPC price. Mesos/kill on maps with several monsters is a best guess.` : "";
}

// map name every 5 s: cut the minimap title out, OCR it in the main process, take it once the same map is read twice in a row
let lastOcr = 0, mapSeen = null, mapNow = null, mapMissing = 0;
async function readMap(f, t){
  const c = GrindReaders.mapTextCrop(GrindReaders.native(f));
  // no map name for 30 s (minimap closed, moved, covered): the map is unknown from here, not the last one seen
  if (!c){ if (++mapMissing === 6 && mapNow && session){ mapNow = mapSeen = null; const e = {t, type: "map", id: null, name: null}; session.add(e); slicer.add(e) } return }
  mapMissing = 0;
  const cv = document.createElement("canvas"); cv.width = c.w; cv.height = c.h;
  cv.getContext("2d").putImageData(new ImageData(c.d, c.w, c.h), 0, 0);
  const png = new Uint8Array(await (await new Promise(r => cv.toBlob(r, "image/png"))).arrayBuffer());
  const m = GrindReaders.mapFromText(await host.ocr(png), G), key = m && (m.id || m.name);
  // a map we don't have keeps its name as read, which can differ by a letter between reads: that's still the same map
  const same = (a, b) => a === b || a && b && !G.maps[a] && !G.maps[b] && GrindReaders.similar(a, b) >= 0.75;
  if (key && same(key, mapSeen) && !same(key, mapNow) && session){ mapNow = key; const e = {t, type: "map", id: m.id, name: m.name}; session.add(e); slicer.add(e) }
  mapSeen = key;
}

// after each 15-minute run: how it compares with other players around your level (shared data)
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]);
async function showSpeed(run){
  const sc = GrindSession.speedCheck(run, await host.summary(), G), box = $("#lastRun");
  box.classList.remove("hidden");
  const band = run.level ? `Lv ${Math.max(1, run.level - 5)}-${run.level + 5} ${run.party > 1 ? "in a party" : "solo"}` : "";
  box.innerHTML = `<div class="k">Last 15-minute run</div><div class="v">${fmt(sc.expHr)} EXP/hr</div>` + (sc.verdict
    ? `<div class="${/good|fast/.test(sc.verdict) ? "good" : sc.verdict === "slow" ? "slow" : ""}">${esc(sc.verdict)} for ${esc(band)} (typical ${fmt(sc.ref)}, ${sc.peers} players)</div>`
      + (sc.faster.length ? `<div class="note">Faster for players like you: ${sc.faster.map(m => `${esc(m.name)} (${fmt(m.expHr)})`).join(", ")}</div>` : "")
    : `<div class="note">${sc.noBar ? "The EXP bar wasn't read during this run, so it isn't compared." : `Not enough shared runs around your level yet to compare (${esc(band) || "level not read"}).`}</div>`);
}
// a beep when something worth at least the set amount is picked up
let audio = null;
function dropAlert(id){
  const min = +settings.alertWorth || 0, worth = G.pw?.[id]?.[0] ?? G.items[id]?.p ?? 0;
  if (!min || worth < min) return;
  try {
    audio = audio || new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 880; g.gain.value = 0.15; o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.25);
  } catch {}
  $("#status").textContent = `Valuable drop: ${G.items[id]?.n || "item " + id} (worth ~${fmt(worth)})`;
}

async function start(){
  await startCapture();
  session = GrindSession.createSession(G, {idleMs: (settings.idleSec || 60) * 1000});
  // every 15 minutes of non-stop farming on one map with the same party is one shared run (when sharing is on)
  slicer = GrindSession.createRunSlicer(G, {idleMs: 60e3, onRun: run => { if (settings.share){ runsSent++; host.shareRun(run) } showSpeed(run) }});
  readers = GrindReaders.createReaders(G); mapNow = mapSeen = null;
  // job isn't read from the screen yet: the player picks it
  if (settings.job){ const e = {t: Date.now(), type: "job", name: settings.job}; session.add(e); slicer.add(e) }
  timer = setInterval(() => {
    const t = Date.now();
    const f = grab();
    for (const e of readers.readFrame(f, t)){ session.add(e); slicer.add(e); if (e.type === "item") dropAlert(e.id) }
    if (t - lastOcr > 5000){ lastOcr = t; readMap(f, t) }
    render();
  }, 1000 / FPS);
  $("#go").textContent = "Stop";
}
async function stop(){
  clearInterval(timer); timer = null;
  video?.srcObject?.getTracks().forEach(tr => tr.stop());
  if (session && session.state.events) await host.saveSession({shared: !!settings.share, ...session.shareable()});
  $("#go").textContent = "Start";
}
$("#go").onclick = () => timer ? stop() : start().catch(e => { $("#status").textContent = "Couldn't capture the game: " + e.message; $("#status").className = "bad" });

// one full frame every 3 s for 3 minutes, saved as PNG: material for building and testing the readers
$("#frames").onclick = async () => {
  $("#frames").disabled = true;   // one batch at a time
  if (!video) await startCapture();
  let n = 0, dir = null;
  const iv = setInterval(async () => {
    canvas.width = video.videoWidth; canvas.height = video.videoHeight; g.drawImage(video, 0, 0);
    const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
    dir = await host.saveFrame(`frame-${String(n).padStart(3, "0")}.png`, new Uint8Array(await blob.arrayBuffer()));
    $("#status").textContent = `Saving sample frames: ${n + 1}/60`;
    if (++n >= 60){ clearInterval(iv); $("#status").textContent = "Frames saved."; $("#frames").disabled = false; host.openFolder(dir) }
  }, 3000);
};

$("#alert").onchange = e => host.settings({alertWorth: Math.max(0, +e.target.value || 0)}).then(s => settings = s);
$("#miniBtn").onclick = () => { document.body.classList.add("mini"); host.mini(true) };
$("#mini").onclick = () => { document.body.classList.remove("mini"); host.mini(false) };
$("#histBtn").onclick = async () => {
  const box = $("#hist"); box.classList.toggle("hidden"); if (box.classList.contains("hidden")) return;
  const list = await host.sessions();
  $("#histRows").innerHTML = list.length ? list.slice(0, 30).map(x => { const h = (x.activeMin || 0) / 60;
    return `<tr><td>${esc(x.date)} ${esc(x.mapName || "")}</td><td class="n">${Math.round(x.activeMin || 0)} min</td><td class="n">${h ? fmt(x.exp / h) : "-"} EXP/hr</td></tr>` }).join("")
    : `<tr><td>No sessions yet: they're saved when you press Stop.</td></tr>`;
};
$("#csv").onclick = () => host.exportCsv();
$("#ontop").onchange = e => host.settings({onTop: e.target.checked}).then(s => settings = s);
$("#share").onchange = e => host.settings({share: e.target.checked}).then(s => settings = s);
$("#job").onchange = e => host.settings({job: e.target.value}).then(s => {
  settings = s;
  if (session){ const ev = {t: Date.now(), type: "job", name: s.job || null}; session.add(ev); slicer.add(ev) }
});
(async () => {
  settings = await host.settings();
  $("#share").checked = !!settings.share;
  $("#job").value = settings.job || "";
  $("#ontop").checked = settings.onTop !== false;
  $("#alert").value = settings.alertWorth || 0;
  const found = await host.gameFound();
  $("#status").textContent = found ? "MapleStory window found." : "Start MapleStory, then press Start.";
})();
