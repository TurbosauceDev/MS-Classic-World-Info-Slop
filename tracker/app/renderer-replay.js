// Replay mode, tracker-window side (0.3.42). Only runs in the replay window (replay-preload.js gives it host.replay). It loads a bug
// report's saved pictures, stands in for the capture (a fake FrameSrc video that serves them), and starts the REAL tracker: the real
// readers, the real tick, the real KPQ logic, against a throwaway session. Time is a virtual clock (Date.now) that follows the
// pictures' recorded times and never runs past a picture the tick hasn't read yet. Nothing is saved, shared or sent: the host in
// this window (replay-preload.js) can't. Pictures are ~3 s apart, so what happened between them is never seen: replay checks the
// readers and the tracker's decisions, not the totals. Loaded last, so every global it touches (start, kpq, LOG...) exists.
(async function(){
  if (!window.host?.replay) return;
  document.body.classList.add("replaying");
  const R = await host.replay.load();
  const panel = document.createElement("div");
  panel.id = "replayPanel";
  panel.innerHTML = `<style>
    body.replaying{padding-bottom:42vh} body.replaying #titlebar{display:none}
    #replayPanel{position:fixed;left:0;right:0;bottom:0;height:40vh;z-index:99999;background:#101010;color:#ddd;border-top:2px solid #b49bff;font:12px/1.4 Consolas,monospace;display:flex;flex-direction:column}
    #replayPanel .rbar{display:flex;gap:10px;align-items:center;padding:6px 10px;background:#1a1a1a;flex-wrap:wrap}
    #replayPanel .rbar b{color:#b49bff} #replayPanel button,#replayPanel select{font:inherit}
    #replayPanel .cols{display:flex;flex:1;min-height:0;gap:1px;background:#333}
    #replayPanel .col{flex:1;overflow:auto;padding:6px 8px;background:#101010;white-space:pre-wrap;word-break:break-word;min-width:0}
    #replayPanel h4{margin:0 0 4px;color:#b49bff;font-size:12px} #replayPanel .dim{color:#888} #replayPanel .bad{color:#ff8a8a}
  </style>
  <div class="rbar"><b>REPLAY</b><span id="rpName"></span><span class="dim">Nothing is saved, shared or sent.</span>
    <button id="rpPlay">Pause</button> <label>speed <select id="rpSpeed"><option>1</option><option>2</option><option>4</option><option>8</option><option>16</option></select>×</label>
    <span id="rpPos"></span> <button id="rpCopy">Copy as text</button></div>
  <div class="cols"><div class="col" id="rpLog"></div><div class="col" id="rpKpq"></div><div class="col" id="rpOrig"></div></div>`;
  document.body.appendChild(panel);
  const $r = s => panel.querySelector(s);
  const state = window.__replay = {done: false, idx: 0, frames: R?.frames?.length || 0, error: null};
  if (!R || !R.frames?.length){ $r("#rpName").textContent = "nothing to replay"; state.error = "no frames"; state.done = true; return }
  const F = R.frames;
  document.title = "Replay: " + R.dir;
  $r("#rpName").textContent = R.dir + " (" + F.length + " pictures" + (R.log.version ? ", tracker " + R.log.version : "") + ")";

  // PNG sizes straight from the headers, so the capture size is known before any picture is decoded
  const dims = F.map(f => { const b = f.bytes; return {w: ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0, h: ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0} });
  const big = dims.reduce((a, d) => d.w > a.w ? d : a, dims[0]), VW = R.log.now?.video?.w || big.w, VH = R.log.now?.video?.h || big.h;
  const imgs = new Map();   // index -> {w, h, d}, filled as pictures decode; only the current and the next one are kept
  const decode = async i => {
    if (i >= F.length || imgs.has(i)) return imgs.get(i);
    imgs.set(i, null);
    const bm = await createImageBitmap(new Blob([F[i].bytes], {type: "image/png"}));
    const c = new OffscreenCanvas(bm.width, bm.height), x = c.getContext("2d", {willReadFrequently: true}); x.drawImage(bm, 0, 0); bm.close?.();
    const id = x.getImageData(0, 0, c.width, c.height), img = {w: id.width, h: id.height, d: id.data};
    imgs.set(i, img); return img;
  };
  let idx = 0, cur = null, curFull = null, servedAt = 0;
  // the picture at the capture's size: a smaller (game-size) ring picture is blown back up pixel for pixel, as the game drew it
  const fullOf = () => {
    if (curFull) return curFull;
    const s = cur, d = new Uint8ClampedArray(VW * VH * 4);
    if (s.w === VW && s.h === VH) d.set(s.d);
    else for (let y = 0; y < VH; y++){ const sy = Math.min(s.h - 1, Math.floor(y * s.h / VH)); for (let x = 0; x < VW; x++){ const i = (sy * s.w + Math.min(s.w - 1, Math.floor(x * s.w / VW))) * 4, o = (y * VW + x) * 4; d[o] = s.d[i]; d[o + 1] = s.d[i + 1]; d[o + 2] = s.d[i + 2]; d[o + 3] = 255 } }
    return curFull = d;
  };
  // same shape and same pixel picks as framesrc.js (full / shrunk / band), on the current picture
  const vid = {pump: true, failed: false, ready: Promise.resolve(true), videoWidth: VW, videoHeight: VH, drop(){},
    srcObject: {active: true, getTracks: () => [], getVideoTracks: () => [{applyConstraints: async () => {}, stop(){}}]},
    full(){ servedAt ||= performance.now(); return {w: VW, h: VH, d: new Uint8ClampedArray(fullOf())} },
    shrunk({k, ox, oy}){
      servedAt ||= performance.now();
      const d = fullOf(), W = Math.floor((VW - ox) / k), H = Math.floor((VH - oy) / k), out = new Uint8ClampedArray(W * H * 4);
      for (let y = 0; y < H; y++) for (let x = 0, i = ((oy + y * k) * VW + ox) * 4, o = y * W * 4; x < W; x++, i += k * 4, o += 4){ out[o] = d[i]; out[o + 1] = d[i + 1]; out[o + 2] = d[i + 2]; out[o + 3] = 255 }
      return {w: W, h: H, d: out, k};
    },
    band({k, ox, oy}, r){
      const d = fullOf(), out = new Uint8ClampedArray(r.w * r.h * 4);
      for (let y = 0; y < r.h; y++) for (let x = 0, i = ((oy + (r.y0 + y) * k) * VW + ox + r.x0 * k) * 4, o = y * r.w * 4; x < r.w; x++, i += k * 4, o += 4){ out[o] = d[i]; out[o + 1] = d[i + 1]; out[o + 2] = d[i + 2]; out[o + 3] = 255 }
      return {w: r.w, h: r.h, d: out, k, crop: {x0: r.x0, y0: r.y0}};
    }};
  FrameSrc.open = () => vid;
  navigator.mediaDevices.getDisplayMedia = async () => vid.srcObject;

  // virtual clock: starts a moment before the first picture
  const T0 = F[0].t, TEND = F.at(-1).t + 4000;
  let vt = T0 - 1500, speed = 1, playing = false, lastReal = performance.now();
  Date.now = () => vt;
  cur = await decode(0); decode(1);
  const logFrom = LOG.length;
  await start();
  const okStart = timer != null;
  if (!okStart){ state.error = "Start failed: " + $("#status").textContent; state.done = true }
  playing = okStart;
  setInterval(() => {
    const now = performance.now(), dt = now - lastReal; lastReal = now;
    if (!playing || state.done) return;
    if (typeof ocrBusy !== "undefined" && ocrBusy) return;   // a map-name read is out: time waits for it
    let nv = vt + dt * speed;
    const next = F[idx + 1];
    if (next && nv >= next.t){
      // the next picture comes only once this one has been read (at fast speeds the tick would otherwise skip pictures)
      if (servedAt && now - servedAt >= 700 && imgs.get(idx + 1)){ idx++; cur = imgs.get(idx); curFull = null; servedAt = 0; state.idx = idx; imgs.delete(idx - 1); decode(idx + 1); nv = Math.min(nv, F[idx + 1] ? F[idx + 1].t - 1 : nv) }
      else nv = next.t - 1;
    }
    if (!next && nv >= TEND && servedAt && now - servedAt > 700){ nv = TEND; playing = false; state.done = true; $r("#rpPlay").textContent = "Finished" }
    vt = Math.max(vt, nv);
  }, 40);

  const rel = t => { const s = Math.round((t - T0) / 1000), a = Math.abs(s); return (s < 0 ? "-" : "+") + Math.floor(a / 60) + ":" + String(a % 60).padStart(2, "0") };
  const brief = l => {
    const {t, kind, ...rest} = l;
    if (kind === "status") return rest.text;
    if (kind === "event"){ const {type, ...e} = rest; delete e.t; return type + " " + JSON.stringify(e).slice(0, 150) }
    return Object.entries(rest).map(([k, v]) => k + "=" + (typeof v === "string" ? v : JSON.stringify(v))).join(" ").slice(0, 170);
  };
  const SHOW = new Set(["event", "status", "kpq", "map", "confused", "start", "wrap", "engine"]);
  const lines = (arr, from) => arr.slice(from).filter(l => SHOW.has(l.kind)).map(l => `${rel(l.t)} ${l.kind.padEnd(7)} ${brief(l)}`);
  function kpqText(){
    if (!kpq) return "KPQ: not started";
    const left = kpq.left === null ? "-" : mss(kpqLeftAt(vt));
    const out = [`KPQ ${kpq.on ? "on" : "off"}${kpq.hold ? " · HOLD (paused between rounds)" : ""} · phase ${kpq.phase} · rounds ${kpq.rounds} · stage ${kpq.stage ? KPQ_STAGE[kpq.stage.id] : "-"} · clock left ${left} · map ${mapNow ?? "-"}`, ""];
    for (const r of kpqTimeline(vt) || []) out.push(`Round ${r.n} from ${r.start}: ` + r.stages.map(s => `${s[0]} ${s[1]} (${mss(s[2])})`).join(" → ") + (r.clear != null ? ` · clear ${mss(r.clear)}` : "") + ` · total ${mss(r.total)} · ${r.end}`);
    return out.join("\n");
  }
  function draw(){
    $r("#rpPos").textContent = `picture ${idx + 1}/${F.length} · ${rel(Math.min(vt, F.at(-1).t))} of ${rel(F.at(-1).t)}`;
    const mine = lines(LOG, logFrom), orig = (R.log.lines || []).filter(l => l.t >= T0 - 5000 && l.t <= F.at(-1).t + 5000);
    $r("#rpLog").innerHTML = "<h4>Replay: what the tracker did with these pictures</h4>" + esc(mine.join("\n"));
    $r("#rpKpq").innerHTML = "<h4>KPQ timeline + state now</h4>" + esc(kpqText() + "\n\nState pill: " + $("#stateText").textContent + "\nStatus: " + $("#status").textContent);
    const now = R.log.now;
    $r("#rpOrig").innerHTML = "<h4>As it happened (report " + esc(R.log.saved || "") + ")</h4>" + esc((R.log.auto ? "AUTO REPORT: " + R.log.auto.reason + "\n" : "") + (R.log.note ? "Note: " + R.log.note + "\n" : "")
      + (now ? `State then: ${now.state}${now.pause ? " · " + (now.pause.label || now.pause.reason) : ""} · KPQ ${JSON.stringify(now.kpq)} · map ${JSON.stringify(now.map)}\n` : "") + "\n" + lines(orig, 0).join("\n"));
    state.lines = mine.length;
  }
  setInterval(draw, 500); draw();
  $r("#rpPlay").onclick = () => { if (state.done) return; playing = !playing; $r("#rpPlay").textContent = playing ? "Pause" : "Play" };
  $r("#rpSpeed").onchange = e => speed = +e.target.value;
  $r("#rpCopy").onclick = () => navigator.clipboard?.writeText([...panel.querySelectorAll(".col")].map(c => c.innerText).join("\n\n")).catch(() => {});
  window.__replaySpeed = v => { speed = v; $r("#rpSpeed").value = String(v) };
})().catch(e => { console.error(e); if (window.__replay) window.__replay.error = String(e && e.message || e) });
