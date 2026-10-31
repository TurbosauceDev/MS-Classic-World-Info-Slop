// Journey log, window side (core/combatlog.js has the line format and the event -> line rules; main.js writes the file).
// Off by default (Settings > Journey log). On: every event the readers see goes to the log, during a tracked run (tapped off
// session.add) and between runs ("watch": the game window read at a low, self-slowing rate, bar + chat lines + map name only,
// nothing counted). Screen pixels only. A run takes the capture over from the watch; Stop hands it back.
const BAR_FPS = 4;   // reads a second while a Chat blocker is on (0.3.5; was 2). Whole-frame read ~6 ms (tests/cv_bench.js), so ~2.4 % of one core
let ovChatOn = false;   // a Chat window card is on (main.js ov-state): the game's chat box is scanned every read (renderer-chat.js). Here for the same load-order reason as ovBlocker
let ovBlocker = false;   // a Chat blocker card is on (main.js ov-state, set in renderer-overlay.js): the idle watch keeps reading HP/MP/EXP. Here because this file loads first
const jr = (() => {
  const J = GrindJournal;
  let obs = null, buf = [], lines = 0;
  const on = () => !!settings.journal;
  const get = () => obs ||= J.createObserver(G, (t, kind, ...f) => { buf.push(J.line(t, kind, ...f)); lines++; if (buf.length >= 100) flush() });
  async function flush(){ if (!buf.length) return; const b = buf; buf = []; try { await host.journalWrite(b) } catch {} }
  setInterval(flush, 2000); addEventListener("beforeunload", flush);
  // the watch: pace follows how long nothing changed (a stalled or AFK player costs less); any event speeds it back up
  const PACE = [[30e3, 1000], [120e3, 2000], [600e3, 5000], [Infinity, 10000]];   // [quiet for under, ms between reads]
  let w = null, jwEng = null;   // w: {t0, timer, last, miss, mapSeen, mapT, jobT}
  // the watch runs for the journey log, and (0.3.4) for a Chat blocker on the overlay: HP / MP / EXP bars keep moving between runs
  const idle = () => timer == null && !starting && !dummyOn;
  const logging = () => on() && settings.journalWatch !== false;
  const wanted = () => (logging() || ovBlocker || ovChatOn) && idle();   // order matters: at load jrUi calls this before renderer-dummy.js defines dummyOn
  const pace = (t, last) => PACE.find(([q]) => t - last < q)[1];
  async function open(){
    if (!await host.gameFound()) return false;
    await host.wholeScreen(false);
    FPS = ovBlocker ? BAR_FPS : ovChatOn ? 2 : 1;   // capture rate (openStream asks for it); a run sets 2 itself. A blocker wants the bars BAR_FPS times a second
    try { await openStream() } catch { return false }
    if (!video.videoWidth || isBlack()){ video.srcObject?.getTracks().forEach(tr => tr.stop()); return false }
    return true;
  }
  async function begin(){
    if (w || !wanted()) return;
    ICONS ||= await GrindReaders.loadIcons(G).catch(() => []);
    if (!wanted() || !await open()) return;
    if (!wanted()){ video.srcObject?.getTracks().forEach(tr => tr.stop()); return }   // a run was started while the capture opened
    jwEng = makeEngine(ICONS || [], null, settings.invArea || null, settings.glyphs || [], settings.invLast || null); scale = null; fastLeft = 0; lastPix = null;
    const t = Date.now(); w = {t0: t, timer: null, last: t, miss: 0, mapSeen: null, mapT: 0, jobT: 0, jobSeen: null};
    if (on()) get().begin(t, "watch", !jr.warm); jr.warm = true; loop();
  }
  function end(why){
    if (!w) return;
    clearTimeout(w.timer); w = null; jwEng?.close(); jwEng = null;
    if (timer == null) video?.srcObject?.getTracks().forEach(tr => tr.stop());
    if (on()) get().end(Date.now(), "watch", why);
    if (why === "game_closed" || why === "off") jr.warm = false;
  }
  async function loop(){
    const me = w; if (!me) return;
    if (!wanted()) return end(on() ? "run" : "off");
    const t = Date.now(); let wait = ovBlocker ? 1000 / BAR_FPS : ovChatOn ? 500 : pace(t, me.last);
    try {
      if (!video?.srcObject?.active){   // closed game, or a snapshot/potion look stopped the stream
        if (!await open()){ if (++me.miss >= 3) return end("game_closed"); throw null }
      }
      me.miss = 0;
      if (!video.videoWidth) throw null;
      const f = grabFrame();
      if (!sameAsLast(f)){
        const want = {};
        if (!ocrBusy && logging()){
          if (me.death && t - me.death.last >= 1000){ me.death.last = t; want.chat = true }   // HP 0 or a bar drop: the chat line says what the death cost
          else if (t - me.mapT > 5000 && t - me.last < 600e3) want.map = true;   // a long-quiet player's map can't have changed without the bar or chat moving
          else if ((!me.charName || !me.job) && t - me.jobT > 30e3) want.job = true;
        }
        chatWant(want);
        const r = await jwEng.read({frame: f, t, want});
        if (w !== me || !r) throw null;
        if (r.scale){ scale = r.scale; fastLeft = 19 }
        for (const e of r.ev){
          if (/^(exp|bonus|meso|item|itemraw|bar|wallet|inv|use|party|vitals)$/.test(e.type)){
            jr.event(e);
            if (e.type === "vitals") ovVit = {hp: e.hp, mp: e.mp, t};
            if (e.type === "bar") me.barPct = {level: e.level, pct: e.pct};
            if (/^(exp|bonus|meso|item|itemraw|party)$/.test(e.type) || e.type === "bar" && me.bar != null && e.exp !== me.bar || e.type === "vitals" && me.hp != null && e.hp[0] !== me.hp) me.last = t;
            if (e.type === "bar"){ if (me.bar != null && me.bar - e.exp > 5 && !(e.level > me.level) && !me.death) me.death = {last: 0, tries: 0}; me.bar = e.exp; me.level = e.level || me.level }
            if (e.type === "vitals"){ if (e.hp[0] === 0 && me.hp > 0 && !me.death) me.death = {last: 0, tries: 0}; me.hp = e.hp[0] }
          }
        }
        if (r.info.invAt) lastInvTab = r.info.inv || null;
        jr.hud(t, !!r.info.bar); chatIngest(r.chat);
        if (want.map){ me.mapT = t; ocrBusy = true; mapRead(r.crops.map, t, me).catch(() => {}).finally(() => ocrBusy = false) }
        else if (want.chat){ ocrBusy = true; deathRead(r.crops.chat, t, me).catch(() => {}).finally(() => ocrBusy = false) }
        else if (want.job){ me.jobT = t; ocrBusy = true; jobRead(r.crops.job, r.crops.name, t, me).catch(() => {}).finally(() => ocrBusy = false) }
      }
      if (on()) get().tick(t);
      if (ovBlocker || ovChatOn) ovIdlePush(me, t);
    } catch (e) { if (e) wait = 5000 }
    if (w === me) me.timer = setTimeout(loop, wait);
  }
  // no session between runs, so the overlay gets a bare snapshot: the bars the blocker draws (watch: true = being read, not dimmed)
  function ovIdlePush(me, t){ try { host.overlayPush?.({t, on: false, watch: true, st: {level: me.barPct?.level ?? null, pct: me.barPct?.pct ?? null}, vit: ovVit, map: {}, feed: [], chat: chatSnap(), chatOn: ovChatOn, th: null}) } catch {} }
  // the map name twice running (like readMap in renderer-live.js, minus the session)
  async function mapRead(c, t, me){
    if (!c) return;
    const m = GrindReaders.mapFromText(await ocrText(c, "map"), G), key = m && (m.id || m.name);
    if (key && key === me.mapSeen) { jr.event({t, type: "map", id: m.id, name: m.name}); me.last = Math.max(me.last, t - 25e3) }   // a map change is activity, but not a full reset of the pace
    me.mapSeen = key;
  }
  // the chat box after a death: "You have lost N EXP" (GrindReaders.deathFromText); three tries, then it's left as an unconfirmed drop
  async function deathRead(c, t, me){
    if (!me.death) return;
    const lost = c ? GrindReaders.deathFromText(await host.ocr(await toPng(c))) : null;
    if (lost){ jr.death(t, lost); me.death = null } else if (++me.death.tries >= 3) me.death = null;
  }
  async function jobRead(c, nc, t, me){
    if (nc){ const n = GrindReaders.nameFromText(await ocrText(nc, "name")); if (n && n === me.nameSeen && n !== me.charName){ me.charName = n; jr.note(t, "CHARACTER", n) } me.nameSeen = n }
    if (settings.job){ me.job = settings.job; jr.event({t, type: "job", name: settings.job}); return }
    if (!c) return;
    const job = GrindReaders.jobFromText(await ocrText(c));
    if (job && job === me.jobSeen){ me.job = job; jr.event({t, type: "job", name: job}) }
    me.jobSeen = job;
  }
  // a minute-ish ensure loop: the watch (re)starts when the game shows up, ends when the setting goes off
  setInterval(() => { if (wanted()) begin().catch(() => {}); else if (w) end(on() ? "run" : "off") }, 15e3);
  return {
    warm: false,
    event(e){ if (on()) get().event(e) },
    hud(t, seen){ if (on()) get().hud(t, seen) },
    note(t, kind, ...f){ if (on()) get().note(t, kind, ...f) },
    death(t, lost){ if (on()) get().death(t, lost) },
    tick(t){ if (on()) get().tick(t) },
    // a tracked run: every event the session takes also goes to the log
    runStart(s){
      if (w) end("run");
      if (!on()) return;
      const add = s.add.bind(s); s.add = e => { jr.event(e); return add(e) };
      get().begin(Date.now(), "run", false);
      get().note(Date.now(), "RUN_START");
    },
    runStop(why){ if (on()){ get().note(Date.now(), "RUN_STOP", Math.round((Date.now() - runT0) / 1e3)); get().end(Date.now(), "run", why); flush() } setTimeout(() => wanted() && begin().catch(() => {}), 2500) },
    yield(){ end("run") },
    wake(){ if (wanted()) begin().catch(() => {}); else if (w) end(on() ? "run" : "off") },
    flush, stats: () => ({lines, buffered: buf.length, watching: !!w}),
  };
})();

// Settings > Journey log
async function jrUi(){
  $("#jrOn").checked = !!settings.journal; $("#jrWatch").checked = settings.journalWatch !== false; $("#jrMb").value = settings.journalMb || 40;
  $("#jrWatch").disabled = $("#jrMb").disabled = !settings.journal;
  try { const i = await host.journalInfo(); $("#jrInfo").textContent = i.files ? `${i.files} file${i.files > 1 ? "s" : ""}, ${(i.bytes / 1e6).toFixed(1)} MB` : "no log yet" } catch {}
  jr.wake();
}
const jrSet = patch => host.settings(patch).then(s => { settings = s; jrUi() });
$("#jrOn").onchange = e => jrSet({journal: e.target.checked});
$("#jrWatch").onchange = e => jrSet({journalWatch: e.target.checked});
$("#jrMb").onchange = e => jrSet({journalMb: Math.min(500, Math.max(5, Math.round(+e.target.value) || 40))});
$("#jrOpen").onclick = () => host.journalOpen();
