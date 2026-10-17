// Tracker window: grabs 2 frames a second from the game window, runs the readers, shows the session.
const G = GAMEDATA, $ = s => document.querySelector(s), fmt = n => Math.round(n).toLocaleString();
const FPS = 2;
let session = null, readers = null, video = null, timer = null, settings = {};
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
      : "Game window came back black, so this is reading the whole screen instead.";
  } else $("#status").textContent = "Reading the MapleStory window.";
}
function grab(){
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  g.drawImage(video, 0, 0);
  const id = g.getImageData(0, 0, canvas.width, canvas.height);
  return {w: id.width, h: id.height, d: id.data};
}

function render(){
  const s = session.stats();
  $("#killsHr").textContent = fmt(s.killsHr);
  $("#expHr").textContent = fmt(s.expHr);
  $("#ttl").textContent = s.toLevelHrs == null ? "-" : s.toLevelHrs < 1 ? Math.round(s.toLevelHrs * 60) + " min" : s.toLevelHrs.toFixed(1) + " h";
  $("#mesosHr").textContent = fmt(s.mesosHr);
  $("#lootHr").textContent = fmt(s.lootHr);
  $("#active").textContent = Math.round(s.activeMin) + " min";
  $("#where").textContent = [s.level && "Lv " + s.level, s.mapName, s.job, s.party > 1 ? "party of " + s.party : "solo",
    s.kills + " kills", fmt(s.mesoPerKill) + " mesos/kill"].filter(Boolean).join(" · ");
  $("#mobs").innerHTML = s.mobs.map(m => `<tr><td>${m.name}</td><td class="n">${m.kills} kills</td><td class="n">${fmt(m.mesoPerKill)} mesos/kill</td></tr>`).join("");
  $("#items").innerHTML = s.items.map(i => `<tr><td>${i.name}</td><td class="n">×${i.n}</td><td class="n">${fmt(i.total)}</td></tr>`).join("")
    + (s.unreadItems ? `<tr><td colspan="3">${s.unreadItems} pickup(s) with names not read yet</td></tr>` : "");
  $("#priceNote").textContent = G.pwRead ? `Worth = player-shop median from meso.watch (${G.pwRead}), else NPC price. Mesos/kill on maps with several monsters is a best guess.` : "";
}

async function start(){
  await startCapture();
  session = GrindSession.createSession(G, {idleMs: (settings.idleSec || 60) * 1000});
  readers = GrindReaders.createReaders(G);
  timer = setInterval(() => {
    const t = Date.now();
    for (const e of readers.readFrame(grab(), t)) session.add(e);
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
  if (!video) await startCapture();
  let n = 0, dir = null;
  const iv = setInterval(async () => {
    canvas.width = video.videoWidth; canvas.height = video.videoHeight; g.drawImage(video, 0, 0);
    const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
    dir = await host.saveFrame(`frame-${String(n).padStart(3, "0")}.png`, new Uint8Array(await blob.arrayBuffer()));
    $("#status").textContent = `Saving sample frames: ${n + 1}/60`;
    if (++n >= 60){ clearInterval(iv); $("#status").textContent = "Frames saved."; host.openFolder(dir) }
  }, 3000);
};

$("#share").onchange = e => host.settings({share: e.target.checked}).then(s => settings = s);
(async () => {
  settings = await host.settings();
  $("#share").checked = !!settings.share;
  const found = await host.gameFound();
  $("#status").textContent = found ? "MapleStory window found." : "Start MapleStory, then press Start.";
})();
