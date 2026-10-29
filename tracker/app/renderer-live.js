// Tracker window, live readers: OCR job/map, run compare, beeps, party, auto-pause, KPQ, level-ups, run log, snapshots, deaths (renderer.js is split in load order; all share one global scope, see renderer.js)
// a crop (black-on-white RGBA) -> PNG bytes for the OCR in the main process
async function toPng(c){
  const cv = document.createElement("canvas"); cv.width = c.w; cv.height = c.h;
  cv.getContext("2d").putImageData(new ImageData(c.d, c.w, c.h), 0, 0);
  return new Uint8Array(await (await new Promise(r => cv.toBlob(r, "image/png"))).arrayBuffer());
}
// job from the status bar every 30 s, when the player left the job on "Auto": taken once the same job is read twice running
const ocrCache = GrindOcrCache.createOcrCache();   // core/ocrcache.js: same crop pixels, same text, no second Tesseract run
const ocrText = c => ocrCache.run(c, async c => { const t = Date.now(); try { return await host.ocr(await toPng(c)) } finally { perf("ocr", Date.now() - t) } });
let lastJob = 0, jobSeen = null, jobNow = null, charName = null, charSeen = null;   // charName: History, and KPQ rounds (Settings > KPQ board name)
async function readJob(c, t, nc){   // c: the status bar text crop (GrindReaders.jobTextCrop), or null; nc: the name crop
  const sess = session, sl = slicer;
  // the character name (History, KPQ board): taken once the same name reads twice in a row
  // the job box holds both ("Archer" over "Turbow") and its pixels only change with a new job or name, so this crop is read
  // from the OCR cache nearly every time; the wide status bar crop (HP/MP/EXP digits make it different every time, ~100 ms)
  // is only the fallback when the box didn't give a job
  let boxText = "";
  if (nc){ boxText = await ocrText(nc); const n = GrindReaders.nameFromText(boxText); if (n && n === charSeen && n !== charName){ charName = n; note("Character: " + n); jr.note(t, "CHARACTER", n) } charSeen = n }
  if (settings.job) return;
  let job = boxText ? GrindReaders.jobFromText(boxText) : null;
  if (!job){
    if (!c){ if (check && !check.job) check.jobWhy = "The level and job text on the status bar wasn't found."; return }
    job = GrindReaders.jobFromText(await ocrText(c));
  }
  log("job", {job});   // not the OCR text: the character name sits in the same box
  if (check && sess === session){ if (!job) check.jobWhy = "The status bar text was found but the job didn't read. Pick it by hand."; else if (!check.job){ check.job = job; check.late = check.ended } }
  if (job && job === jobSeen && job !== jobNow && sess === session && !settings.job){ jobNow = job; const e = {t, type: "job", name: job}; sess.add(e); sl.add(e) }
  jobSeen = job;
}

// map name every 5 s: cut the minimap title out, OCR it in the main process, take it once the same map is read twice in a row
let ocrBusy = false, lastOcr = 0, mapSeen = null, mapNow = null, mapMissing = 0, mapMiss = 0;
async function readMap(c, fb, t){   // c: the minimap title crop (GrindReaders.mapTextCrop); fb: the last good title rect re-cut from this frame (the band hunt failed but the minimap may be fine)
  const sess = session, sl = slicer;   // an OCR that finishes after Stop/Start belongs to the old session
  // no map name for 30 s (minimap closed, moved, covered): the map is unknown from here, not the last one seen
  if (!c && !fb){ if (check && !check.map) check.mapWhy = "Minimap not found: it's closed, minimized or covered."; if (++mapMissing === 6 && mapNow && sess){ mapNow = mapSeen = null; note("Map name not seen for 30 s (minimap closed or covered): map unknown until it's back.", "bad"); const e = {t, type: "map", id: null, name: null}; sess.add(e); sl.add(e) } return }
  mapMissing = 0;
  const text = await ocrText(fb || c), m = GrindReaders.mapFromText(text, G), key = m && (m.id || m.name);
  log("map", {text, id: m?.id ?? null, name: m?.name ?? null, fb: !!fb});
  if (check && sess === session){ if (!m) check.mapWhy = "Minimap found, but its name didn't read. Is something over the minimap title?"; else if (!check.map){ check.map = m.name || "map " + m.id; check.late = check.ended } }
  // a map we don't have keeps its name as read, which can differ by a letter between reads: that's still the same map
  const same = (a, b) => a === b || a && b && !G.maps[a] && !G.maps[b] && GrindReaders.similar(a, b) >= 0.75;
  // the name holds through flaky band hunts (Danny 10-29: it dropped while the minimap sat untouched): the fallback
  // crop re-reads the last good rect, and only 30 s of nothing reading at all clears the map — never one missed band
  if (key) mapMiss = 0;
  else if (++mapMiss === 6 && mapNow && sess){ mapNow = mapSeen = null; note("Map name not read for 30 s (minimap closed, covered or unreadable): map unknown until it reads again.", "bad"); const e = {t, type: "map", id: null, name: null}; sess.add(e); sl.add(e) }
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
  note(`15-minute run done: ${fmt(sc.expHr)} EXP/hr` + (sc.verdict ? `, ${sc.verdict} (typical ${fmt(sc.ref)})` : "") + (settings.share && !kpq?.on ? ", shared" : ""), "run");
  const band = run.level ? `Lv ${Math.max(1, run.level - 5)}-${run.level + 5} ${run.party > 1 ? "in a party" : "solo"}` : "";
  box.innerHTML = `<div class="k">Last 15-minute run</div><div class="v">${fmt(sc.expHr)} EXP/hr</div>` + (sc.verdict
    ? `<div class="${/good|fast/.test(sc.verdict) ? "good" : sc.verdict === "slow" ? "slow" : ""}">${esc(sc.verdict)} for ${esc(band)} (typical ${fmt(sc.ref)}, ${sc.peers} players)</div>`
      + (sc.faster.length ? `<div class="note">Faster for players like you: ${sc.faster.map(m => `${esc(m.name)} (${fmt(m.expHr)})`).join(", ")}</div>` : "")
    : `<div class="note">${sc.noBar ? "The EXP bar wasn't read during this run, so it isn't compared." : `Not enough shared runs around your level yet to compare (${esc(band) || "level not read"}).`}</div>`) + bt;
}
function beep(hz, sec){
  if (settings.muted) return;   // Mute sounds (Settings, or its shortcut)
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
  const worth = GrindSession.lootPrice(G, id).each, name = G.items[id]?.n || "item " + id;
  // the conditions engine owns drop alerts once it has any (0.2.78); the old keys stay for a page that booted without it
  if (typeof alertHas === "function" && (alertHas("lootWorth") || alertHas("lootNamed"))){ alertEvent({t: Date.now(), name, worth}); return }
  const min = +settings.alertWorth || 0;
  if (alertSet().has(String(id))){ beep(660, 0.15); setTimeout(() => beep(990, 0.25), 180); flash(); $("#status").textContent = `Drop you're watching for: ${name}`; return }
  if (!min || worth < min) return;
  flash();
  beep(880, 0.25);
  $("#status").textContent = `Valuable drop: ${name} (worth ~${fmt(worth)})`;
}

// party view: every minute, our numbers go up with the party code and everyone's come back
let lastParty = 0, partyBusy = false, partyNames = null, partyLive = null;   // partyNames: the other trackers on the party code last time (event log joins/leaves); partyLive: the same answer for the overlay widget
async function sendParty(){
  const s = session.stats(), box = $("#partyBox");
  const r = await host.party({job: s.job, level: s.level, mapName: s.nowMapName, expHr: s.expHr, expHr5: s.expHr5, killsHr: s.killsHr, mesosHr: s.mesosHr,
    active: Math.round(s.activeMin)}).catch(() => null);
  if (!r || timer == null) return;   // stopped while the answer was on its way: don't bring the card back
  box.classList.remove("hidden"); $("#miniParty").textContent = ""; $("#fzParty").textContent = "";
  if (r.error){ box.innerHTML = `<div class="k">Party</div><div class="note">${r.why === "party full" ? "Party full: 6 trackers already use this code." : r.why === "too often" ? "Waiting a moment before updating." : "Party view didn't answer (" + esc(r.why || r.error) + ")."}</div>`; return }
  $("#miniParty").textContent = `party: ${fmt(r.expHr)} EXP/hr together (${r.members.length})`; $("#fzParty").textContent = $("#miniParty").textContent;
  const names = r.members.filter(m => !m.you).map(m => m.nick || m.job || "a member");
  if (partyNames){ for (const n of names) if (!partyNames.includes(n)) note(`${n} joined party "${settings.partyCode}"`, "party"); for (const n of partyNames) if (!names.includes(n)) note(`${n} left party "${settings.partyCode}"`, "party") }
  partyNames = names;
  partyLive = r.members ? {expHr: r.expHr, members: r.members.slice(0, 6).map(m => ({nick: m.nick, job: m.job, level: m.level, expHr: m.expHr, you: !!m.you}))} : null;
  box.innerHTML = `<div class="k">Party "${esc(settings.partyCode)}": ${fmt(r.expHr)} EXP/hr together</div><table>` + r.members.map(m =>
    `<tr><td>${m.you ? "<b>you</b>" : esc(m.nick || m.job || "member")}${m.nick && !m.you && m.job ? ` <span class="note">${esc(m.job)}</span>` : ""}${m.level ? " Lv " + m.level : ""}</td>
    <td class="n">${fmt(m.expHr || 0)}/hr</td><td class="n note">${m.expHr5 != null ? "5 min: " + fmt(m.expHr5) : ""}</td></tr>`).join("")
    + `</table><div class="note">Each member's own EXP/hr, updated every minute. Members who stopped drop off after 3 minutes.</div>`;
}

// EXP stopped: one low beep when no EXP for 2 minutes after some came in; again only after EXP comes back and stops again.
// The conditions engine's "No EXP for" alert replaces this when one exists (0.2.78) — same words, editable, cool-headed.
let stopWarned = false;
function stopCheck(s){
  if (wrap || settings.stopBeep === false || (typeof alertHas === "function" && alertHas("idleExp")) || !s.lastExpT) return;
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
// KPQ: picked in the KPQ box, or found by itself (Auto) once a KPQ stage is on the minimap. While it's on, any map that
// isn't a KPQ stage (Kerning City between rounds, a shop) pauses the session; the next stage picks it back up.
// A round = coming into a KPQ stage from outside. Maps: G.kpq (80000000-80000600, from the site's KPQ data).
const KPQ_MAPS = new Set((G.kpq || []).map(String));
let kpq = null;
// Pause (button or its shortcut): the timer stops until pressed again (held); the game screen coming back doesn't resume it
function pauseUi(){ $("#resetBtn").classList.toggle("hidden", timer != null || starting || !session?.state.events); const b = $("#pauseBtn"); b.classList.toggle("hidden", timer == null || !!wrap); b.textContent = held ? "Go on" : "Pause"; b.setAttribute("aria-pressed", String(held)) }
$("#pauseBtn").onclick = () => {
  if (timer == null || wrap || !session) return;
  held = !held; const t = Date.now();
  if (held){ const e = {t: Math.max(t, session.state.last || 0), type: "pause", hold: true}; session.add(e); slicer.add(e); log("event", e); $("#status").textContent = "Paused by you. Press Go on (or the Pause shortcut) to carry on." }
  else { const e = {t, type: "resume"}; session.add(e); slicer.add(e); log("event", e); $("#status").textContent = "Tracking again." }
  pauseUi(); render();
};
function pauseAt(t){ const e = {t: Math.max(t, session.state.last || 0), type: "pause"}; session.add(e); slicer.add(e); log("event", e) }
function kpqReset(){ kpq = {on: false, phase: "idle", hold: false, inside: false, rounds: 0, left: null, leftT: 0, stage: null, round: null, times: [], stageTimes: {}, stageExp: {}, history: [], last: null}; kpqRefresh() }
// stage and round times: from the KPQ clock ("Time Left", top middle) when it reads, else the PC clock
const KPQ_STAGE = {"80000000": "1st", "80000100": "2nd", "80000200": "3rd", "80000300": "4th", "80000400": "Last", "80000500": "Bonus"};
const kpqLeftAt = t => kpq.left === null ? null : kpq.left - (t - kpq.leftT) / 1000;
const kpqSince = (p, t) => p.left0 !== null && kpq.left !== null ? p.left0 - kpqLeftAt(t) : (t - p.t0) / 1000;
const mss = sec => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0") };
// round sections: Rush = 1st stage to the Bonus map (or the round's end), Bonus = Bonus map to the Exit. The tracker keeps a
// snapshot (EXP, mesos, item counts) at each border; the section's gain is the difference (core/kpqscore.js scores it)
const BONUS_MAP = "80000500", KERNING = "10003000";
function kpqSnap(){ const st = session?.stats() || {}; return {exp: st.exp || 0, mesos: st.mesos || 0, items: Object.fromEntries((st.items || []).map(i => [i.id, i.n])), kills: (st.maps || []).find(m => m.map === BONUS_MAP)?.kills || 0} }
const kpqGot = (a, b) => Object.fromEntries(Object.entries(b.items).map(([id, n]) => [id, n - (a.items[id] || 0)]).filter(([, n]) => n > 0));
const kpqLoot = (a, b) => GrindKpq.lootSummary(G.items, kpqGot(a, b));
// the raw round the server stores and re-scores: stage seconds, Rush loot, and the Bonus section when the player fought in it
function kpqRaw(r, t){
  const now = kpqSnap(), cut = r.bonus ? r.bonus.snap : now;
  const raw = {stages: {}, clear: r.clear == null ? null : Math.round(r.clear), rush: {loot: kpqLoot(r.snap0, cut)}, bonus: null};
  for (const [id, a] of Object.entries(kpq.stageTimes)) if (r.stages[id] && a.length) raw.stages[id] = Math.round(a.at(-1));
  if (r.bonus?.fought) raw.bonus = {sec: Math.round(kpqSince(r.bonus, t)), exp: Math.max(0, now.exp - cut.exp), mesos: Math.max(0, now.mesos - cut.mesos), kills: Math.max(0, now.kills - cut.kills), loot: kpqLoot(cut, now)};
  return raw;
}
// the shared reference (median and best stage times of recorded rounds, from the site's server) comes with the summary
let kpqRef = null;
function kpqRefresh(){ host.summary().then(s => { kpqRef = s?.kpq?.ref || null }).catch(() => {}) }
// phase: idle -> primed (Kerning City, KPQ likely) -> rush (a stage map) -> bonusWait (Bonus map) -> bonus (kills in it) -> idle.
// Never set by hand. A Bonus section only exists once a kill shows up in the Bonus map.
function kpqWatch(s){
  if (!kpq?.round?.bonus || kpq.phase !== "bonusWait") return;
  const k = (s.maps || []).find(m => m.map === BONUS_MAP)?.kills || 0;
  if (k > kpq.round.bonus.snap.kills){ kpq.phase = "bonus"; kpq.round.bonus.fought = true; note("KPQ round " + kpq.rounds + ": killing in the Bonus map, recording the Bonus section", "kpq") }
}
function kpqTime(left, t){
  kpq.left = left; kpq.leftT = t;
  for (const p of [kpq.stage, kpq.round]) if (p && p.left0 === null) p.left0 = left + (t - p.t0) / 1000;   // clock first seen mid-stage
}
function kpqEnd(t, round, end){
  if (kpq.stage){ const id = kpq.stage.id, sec = kpqSince(kpq.stage, t); (kpq.stageTimes[id] ||= []).push(sec); kpq.round?.list.push([KPQ_STAGE[id], clockAt(kpq.stage.t0), Math.round(sec)]); kpq.stageExp[id] = (kpq.stageExp[id] || 0) + Math.max(0, (session?.stats().exp || 0) - kpq.stage.exp0); kpq.stage = null }
  if (round && kpq.round){
    const r = kpq.round, raw = kpqRaw(r, t), sc = r.clear != null ? GrindKpq.score(raw, kpqRef) : null;
    note(`KPQ round ${kpq.rounds} over: ${mss(kpqSince(r, t))}` + (r.clear != null ? `, cleared in ${mss(r.clear)}` : ", not cleared") + (sc ? `. Score ${fmt(sc.total)} (Rush ${fmt(sc.rush.pts)}${sc.bonus ? ", Bonus " + fmt(sc.bonus.pts) : ", no Bonus"})${sc.provisional ? ", provisional: no recorded averages yet" : ""}` : ""), "kpq");
    kpq.times.push(kpqSince(r, t)); kpq.history.push({...kpqRound(r, t, kpqShare(r, t, raw), end), raw, score: sc && {total: sc.total, rush: sc.rush.pts, bonus: sc.bonus?.pts ?? null}});
    kpq.last = sc; kpq.round = null; kpq.phase = "idle"
  }
  if (round) kpq.left = null;   // each round's clock starts over
}
function kpqMap(id, t){
  if (!kpq || id == null) return;   // map not read: no change
  const inside = KPQ_MAPS.has(String(id));
  if (inside && !kpq.on && settings.kpqAct !== "grind"){ kpq.on = true; kpq.phase = "rush"; kpqRefresh(); $("#status").textContent = "KPQ run spotted: rounds are counted, and Kerning City between rounds is paused." }
  if (!kpq.on){ if (String(id) === KERNING && kpq.phase !== "primed"){ kpq.phase = "primed"; note("Kerning City: KPQ likely, waiting for the 1st stage", "kpq") } else if (String(id) !== KERNING && kpq.phase === "primed") kpq.phase = "idle"; return }
  if (inside){
    if (!kpq.inside) kpq.rounds++;
    // a new stage: the last one's time is kept; the Exit map ends the round
    if (kpq.stage?.id !== String(id)){
      // cleared: from the Last stage on to Bonus or Exit. Clear time = 1st stage to then (Bonus left out, so Bonus and Rush compare)
      if (kpq.stage?.id === "80000400" && kpq.round) kpq.round.clear = kpqSince(kpq.round, t);
      kpqEnd(t, String(id) === "80000600", "Exit");
      if (KPQ_STAGE[id]){ const p = {id: String(id), t0: t, left0: kpqLeftAt(t), exp0: session?.stats().exp || 0}; kpq.stage = p; if (!kpq.round){ const st = session?.stats(); kpq.round = {n: kpq.rounds, t0: t, left0: p.left0, exp0: st?.exp || 0, mesos0: st?.mesos || 0, startStage: String(id), stages: {}, list: [], snap0: kpqSnap(), bonus: null} }
        if (String(id) === BONUS_MAP && kpq.round && !kpq.round.bonus){ kpq.round.bonus = {t0: t, left0: p.left0, snap: kpqSnap(), fought: false}; kpq.phase = "bonusWait" }
        else if (String(id) !== BONUS_MAP) kpq.phase = "rush" }
      if (KPQ_STAGE[id] && kpq.round) kpq.round.stages[String(id)] = 1;
      if (KPQ_STAGE[id]) note(`KPQ round ${kpq.rounds}: ${KPQ_STAGE[id]} stage` + (kpq.round && kpq.round.clear != null && String(id) === "80000500" ? ` (cleared in ${mss(kpq.round.clear)})` : ""), "kpq");
    }
    kpq.inside = true;
    if (kpq.hold && !held){ kpq.hold = false; const e = {t, type: "resume"}; session.add(e); slicer.add(e); log("event", e); $("#status").textContent = "KPQ round " + kpq.rounds + ": tracking again." }
  } else {
    kpqEnd(t, true, "left");
    kpq.inside = false; kpq.phase = String(id) === KERNING ? "primed" : "idle";
    if (!kpq.hold){ kpq.hold = true; if (session.state.pausedAt === null) pauseAt(t); $("#status").textContent = "KPQ: paused between rounds. Picks back up on the next stage." }
  }
}
// KPQ leaderboard: a finished round (1st stage to past the Last stage) goes to the server's /api/kpq when sharing is on.
// Rounds joined mid-way or left before the Last stage was cleared aren't sent.
let kpqSent = 0;
function kpqShare(r, t, raw){
  if (!session) return "no session";
  if (!settings.share) return "sharing off";
  if (r.clear == null) return "Last stage not cleared";
  if (r.startStage !== "80000000") return "joined at the " + KPQ_STAGE[r.startStage] + " stage";
  const s = session.stats(), st = {};
  for (const [id, a] of Object.entries(kpq.stageTimes)) if (r.stages[id]) st[id] = Math.round(a.at(-1));
  kpqSent++; note("KPQ round sent to the KPQ leaderboard", "kpq");
  host.shareRun({kpq: true, v: 1, date: new Date(r.t0).toLocaleDateString("sv"), hour: new Date(r.t0).getUTCHours(), mode: raw?.bonus ? "Bonus" : "Rush", v2: raw,
    party: s.party, level: s.level, job: s.job, clear: Math.round(r.clear), total: Math.round(kpqSince(r, t)), clock: r.left0 !== null,
    exp: Math.max(0, s.exp - r.exp0), mesos: Math.max(0, s.mesos - r.mesos0), stages: st, partyCode: settings.partyCode || null,
    name: settings.kpqName !== false && [settings.nick, charName].find(n => /^[A-Za-z0-9]{2,12}$/.test(n || "")) || kpqAlias(s.job)});   // KPQ board only; runs never carry the name
  return "sent";
}
// the run's KPQ timeline, saved with the session: one entry per round with each stage's start (PC clock) and length, so the
// rounds, the Bonus and the gaps can be read straight off the saved run (Danny, 2026-10-19). end: "Exit", "left" (out of
// KPQ without Exit, e.g. Bonus timed out to Kerning) or "stopped" (still in it at Stop)
const clockAt = t => new Date(t).toLocaleTimeString("en-GB");
function kpqRound(r, t, sent, end){
  return {n: r.n, start: clockAt(r.t0), stages: r.list.slice(), clear: r.clear == null ? null : Math.round(r.clear), total: Math.round(kpqSince(r, t)), end, sent: sent || null};
}
// for saving at Stop: the finished rounds plus the one still going
function kpqTimeline(t){
  if (!kpq?.on) return null;
  const now = kpq.round && {...kpqRound(kpq.round, t, "not finished", "stopped"), stages: [...kpq.round.list, ...(kpq.stage ? [[KPQ_STAGE[kpq.stage.id], clockAt(kpq.stage.t0), Math.round(kpqSince(kpq.stage, t))]] : [])]};
  return [...kpq.history, ...(now ? [now] : [])];
}
// name off (or none read): a made-up name like "Archer4821" (1st job + 4 digits from the install ID), saved the first time so
// the player keeps the same one on the board after a job advance (Danny, 2026-10-18)
const FIRST_JOB = {Fighter: "Swordman", Page: "Swordman", Spearman: "Swordman", Cleric: "Magician", Hunter: "Archer", Crossbowman: "Archer", Assassin: "Rogue", Bandit: "Rogue"};
function kpqAlias(job){
  if (/^[A-Za-z]+\d{4}$/.test(settings.alias || "")) return settings.alias;
  job = job || settings.job || "";
  const base = job.startsWith("Wizard") ? "Magician" : FIRST_JOB[job] || (/^(Beginner|Swordman|Magician|Archer|Rogue)$/.test(job) ? job : "Player");
  const alias = base + (parseInt(String(settings.install || "").replace(/[^0-9a-f]/gi, "").slice(0, 8) || "0", 16) % 9000 + 1000);
  settings.alias = alias; host.settings({alias}).then(s => settings = s).catch(() => {});
  return alias;
}
const KPQ_PHASE = {idle: "waiting", primed: "Kerning City, KPQ likely", rush: "recording Rush", bonusWait: "in the Bonus map, waiting for the first kill", bonus: "recording Bonus"};
function kpqText(s){
  if (!kpq?.on) return kpq?.phase === "primed" ? "Kerning City: KPQ is likely. Recording starts by itself on the 1st stage." : "Nothing to set: the tracker spots KPQ by itself (Kerning City, then the 1st stage), records the Rush, then the Bonus once you kill in it, and pauses between rounds.";
  const n = kpq.rounds, per = v => n ? fmt(v / n) : "-";
  return `KPQ ${KPQ_PHASE[kpq.phase] || ""}: ${n} round${n === 1 ? "" : "s"}` + (n ? ` · ${Math.round(s.activeMin / n * 10) / 10} min a round · ${per(s.exp)} EXP a round · ${per(s.mesos)} mesos a round` : "")
    + (kpq.round ? ` · this round ${mss(kpqSince(kpq.round, Date.now()))}` + (kpq.stage ? ` (${KPQ_STAGE[kpq.stage.id]} stage ${mss(kpqSince(kpq.stage, Date.now()))})` : "") : "")
    + (kpq.times.length ? ` · best round ${mss(Math.min(...kpq.times))}, average ${mss(kpq.times.reduce((a, b) => a + b, 0) / kpq.times.length)}` : "")
    + (kpq.left !== null ? ` · KPQ clock ${mss(kpqLeftAt(Date.now()))} left` : "")
    + (kpq.round && kpq.phase !== "idle" ? (() => { const p = GrindKpq.score(kpqRaw(kpq.round, Date.now()), kpqRef); return ` · Rush so far ${fmt(p.rush.pts)}` + (p.bonus ? ` · Bonus so far ${fmt(p.bonus.pts)}` : "") + (p.provisional ? " (provisional)" : "") })() : kpq.last ? ` · last round ${fmt(kpq.last.total)} pts` : "")
    + (kpq.hold ? " · paused between rounds" : "") + (kpqSent ? ` · ${kpqSent} round${kpqSent === 1 ? "" : "s"} sent to the KPQ leaderboard` : "");
}
function kpqSet(){
  if (!session || !kpq) return;
  const t = Date.now();
  if (settings.kpqAct === "grind" && kpq.on && !wrap){ kpq.on = false; if (kpq.hold && !held){ kpq.hold = false; const e = {t, type: "resume"}; session.add(e); slicer.add(e) } }
}

// a level-up: how long the last level took
let levelsShown = 0;
function levelNote(s){
  if (s.levelUps.length <= levelsShown) return;
  const l = s.levelUps.at(-1); levelsShown = s.levelUps.length;
  statusKind = "level"; $("#status").textContent = `Level ${l.level}!` + (l.activeMin != null ? ` Level ${l.level - 1} took ${hm(l.activeMin / 60)} of farming.` : "");
}
const hm = h => h < 1 ? Math.round(h * 60) + " min" : h.toFixed(1) + " h";

/* what reading costs on this PC, per stage (ms): shown at Stop in the event log and kept in the bug report. busy = share of
   the time between Start and Stop that the window spent reading. */
let PERF = {}, perfT0 = 0, perfLogged = 0, lastMemo = null;
const perf = (k, ms) => { const p = PERF[k] ||= {n: 0, sum: 0, max: 0}; p.n++; p.sum += ms; if (ms > p.max) p.max = ms };
function perfLine(){
  const el = Date.now() - perfT0, avg = k => PERF[k] ? (PERF[k].sum / PERF[k].n).toFixed(1) : "-", hit = ocrCache.stats;
  if (!PERF.tick || el < 5000) return "";
  return `Reading cost: ${PERF.tick.n} frames read, ${skipped} skipped as unchanged; per frame: capture ${avg("grab")} ms, compare ${avg("same")} ms, read ${avg("read")} ms (slowest ${PERF.read ? Math.round(PERF.read.max) : "-"}), whole tick ${avg("tick")} ms = ${Math.round(PERF.tick.sum / el * 100)}% of one core's time; ${lastMemo && lastMemo.hits + lastMemo.reads ? Math.round(lastMemo.hits / (lastMemo.hits + lastMemo.reads) * 100) + "% of bar/clock reads skipped (strip unchanged); " : ""}text reader ${hit.misses} runs${PERF.ocr ? " (" + avg("ocr") + " ms each)" : ""}, ${hit.hits} answered from memory.`;
}
function perfReset(){ PERF = {}; perfT0 = Date.now(); perfLogged = 0; paceReset() }
/* adaptive pace (Danny 10-29: "slow the capture if the user is stalled or went AFK"): 2 reads a second while anything is
   happening (a bar change, pickup, map...), 1 after 45 s of nothing, one every 2 s after 3 min. The first thing that
   changes puts it back to 2. slowCap: reads that run long keep it at 1 at best. The capture itself is told the same rate. */
let lastActive = Date.now(), slowCap = false, paceNote = 0;
const PACE_LABEL = {2: "", 1: "Quiet for 45 s: reading once a second.", 0.5: "Quiet for 3 min (AFK?): reading every 2 seconds."};
function paceReset(){ lastActive = Date.now(); slowCap = false; paceNote = 0 }
function setFps(rate, why){
  if (rate === FPS) return;
  FPS = rate;
  try { video.srcObject.getVideoTracks()[0].applyConstraints({frameRate: rate}).catch(() => {}) } catch {}
  log("pace", {fps: rate, why});
  if (!slowCap || rate >= 2){ const m = PACE_LABEL[rate] || "Something moved: back to 2 reads a second."; if (rate < 2 || paceNote) note(m); paceNote = rate < 2 ? 1 : 0 }
}
function pace(t, active){
  if (active) lastActive = t;
  const idle = t - lastActive, base = idle > 180e3 ? 0.5 : idle > 45e3 ? 1 : 2, want = ovBlocker ? Math.max(base, BAR_FPS) : ovChatOn ? Math.max(base, 2) : base;   // a Chat blocker wants the HP/MP bars quicker, idle or not (slowCap still holds it to 1)
  setFps(slowCap ? Math.min(want, 1) : want, want < 2 ? "quiet" : "active");
}

let slowTicks = 0, skipped = 0;
async function tick(){
  if (timer == null) return;   // stopped
  const t = Date.now(), eng = engine, sess = session;
  let active = false;
  try {
    // game closed: the capture ends and the last frame would be read forever; minimized: no picture until it's back
    if (!video.srcObject?.active){ $("#status").textContent = "The game window closed. Press Stop, then Start once it's back."; throw null }
    if (!video.videoWidth){ $("#status").textContent = "No picture from the game (minimized?). Waiting..."; throw null }   // skip this tick
    const f = grabFrame(); perf("grab", Date.now() - t);
    keepFrame(t, f);
    const t1 = Date.now(), same = sameAsLast(f); perf("same", Date.now() - t1);
    if (same){ skipped++; if (video?.pump) FRBUF.give(f.d.buffer); throw null }   // unchanged: the buffer is free again
    // one OCR at a time (the first can take seconds): a death check first, the map every 5 s, the job every 30 s in between
    const want = {};
    if (!ocrBusy){
      if (deathPending && t - deathPending.last >= 1000){ deathPending.last = t; want.chat = true }
      else if (boxPending && t - boxPending.last >= 1000){ boxPending.last = t; want.chat = true; want.box = true }
      else if (t - lastOcr > 5000){ lastOcr = t; want.map = true }
      else if ((!settings.job || !charName) && t - lastJob > 30e3){ lastJob = t; want.job = true }
    }
    chatWant(want);
    const t2 = Date.now(), r = await eng.read({frame: f, t, want}); perf("read", Date.now() - t2);
    if (eng.kind !== "worker" && video?.pump) FRBUF.give(f.d.buffer);   // inline readers ran in this window: the buffer never left, pool it again (the worker mode got it back with the reply)
    if (timer == null || sess !== session || !r) throw null;   // stopped (or restarted) while reading, or the frame was lost
    active = r.ev.some(e => e.type !== "glyph")
    if (r.memo) lastMemo = r.memo;
    chatIngest(r.chat);
    if (r.scale){ scale = r.scale; fastLeft = 19 }   // also at 1x: finding the scale is the slow part, so it's checked every 20 frames only
    for (const e of r.ev){
      if (wrap && e.type !== "inv" && e.type !== "wallet" && e.type !== "glyph") continue;   // after Stop: only the end inventory look counts
      if (held && /^(exp|bonus|meso|item|itemraw)$/.test(e.type)) continue;   // paused by hand: a break, nothing picked up counts
      if (e.type === "kpqtime"){ if (kpq) kpqTime(e.left, e.t); continue }
      if (e.type === "vitals"){ jr.event(e); ovVit = {hp: e.hp, mp: e.mp, t: Date.now()}; try { ovSend?.(true) } catch {}; continue }   // HP / MP: journey log + Chat blocker bars; the session doesn't count them
      // a pickup-line letter learned from an item name: kept for next time (at most 300)
      if (e.type === "glyph"){ const g = [...(settings.glyphs || []), {ch: e.ch, w: e.w, h: e.h, bits: e.bits}].slice(-300); host.settings({glyphs: g}).then(x => settings = x); log("glyph", {ch: e.ch}); continue }
      // a box (Companion's Magic Box) gone from the Use tab: it was opened, its rewards are in the chat box
      if (e.type === "inv" && e.tab === "use"){ const n = +e.items[BOX] || 0; if (n < boxHad && !e.unknown) boxPending = {tries: 0, last: 0}; if (!e.partial?.[BOX]) boxHad = n }
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
    jr.hud(t, !!info.bar); jr.tick(t);   // journey log (renderer-journal.js)
    // the inventory's spot, remembered for next time (saved when it moved, at most every 10 s)
    const ia = info.invAt, il = settings.invLast;
    if (ia && (!il || Math.abs(ia.x - il.x) + Math.abs(ia.y - il.y) > 0.005) && t - invSavedT > 10e3){ invSavedT = t; host.settings({invLast: ia}).then(x => settings = x) }
    if (check && info.useSpots && !check.use){ check.use = info.useSpots + " item count" + (info.useSpots > 1 ? "s" : ""); check.late = check.ended }
    if (check && info.partyWindow > 1 && !check.party){ check.party = info.partyWindow; check.late = check.ended }
    if (!wrap) autoPause(r.minimap, info, t);
    if (check && (!check.ended || check.late)){ check.late = false; renderCheck() }   // a ✗ turns ✓ when it starts working
    if (session.state.deaths > deathSeen){ deathSeen = session.state.deaths; deathPending = {t, tries: 0, last: 0} }
    const ocr = fn => { ocrBusy = true; fn.catch(() => {}).finally(() => ocrBusy = false) };
    if (want.box) ocr(checkBox(r.crops.chat, t));
    else if (want.chat) ocr(checkDeath(r.crops.chat, t));
    else if (want.map) ocr(readMap(r.crops.map, r.crops.mapFb, t));
    else if (want.job) ocr(readJob(r.crops.job, t, r.crops.name));
    if (t - lastParty > 60e3 && settings.partyCode && !partyBusy){ lastParty = t; partyBusy = true; sendParty().catch(() => {}).finally(() => partyBusy = false) }
  } catch (err){ if (err) $("#status").textContent = "Reading a frame failed (" + err.message + "); still going." }   // one bad frame never stops tracking
  if (timer == null || sess !== session) return;
  try { renderSnaps(render()) } catch {}
  try { feedAdd(feed?.step(session.state, t, feedWho())) } catch {}
  // over 250 ms a frame, 10 times running: read once a second instead of twice
  const ms = Date.now() - t; perf("tick", ms);
  slowTicks = ms > 250 ? slowTicks + 1 : 0;
  if (slowTicks >= 10 && !slowCap){ slowCap = true; $("#status").textContent = "Reading once a second to keep your PC smooth (big screen)." }
  pace(t, active);
  if (t - perfLogged > 60e3){ perfLogged = t; const l = perfLine(); if (l) log("perf", {text: l}) }
  timer = setTimeout(tick, Math.max(50, 1000 / FPS - ms));
}

// the run log (core/feed.js, Danny 2026-10-18: "like WoW's combat log"): every 2 s, what changed since the last batch as a
// line per kind; newest at the bottom, older lines scroll up (it stays put while you've scrolled up to read)
let feed = null;
const feedWho = () => [settings.nick, charName].find(n => /^[A-Za-z0-9]{2,12}$/.test(n || "")) || "You";
const clockS = t => new Date(t).toLocaleTimeString([], {hour: "numeric", minute: "2-digit", second: "2-digit"});
function feedLine(l){ const who = `<span class="who">${esc(l.who)}</span>`; let h;
  if (l.kind === "exp") h = `${who} gained <b>${fmt(l.n)} EXP</b>${l.detail ? ` <span class="dim">${esc(l.detail)}</span>` : ""}`;
  else if (l.kind === "meso") h = `${who} picked up ${COIN}<b>${fmt(l.n)}</b>`;
  else if (l.kind === "loot") h = `${who} looted ` + [...l.parts.map(p => (G.iicons?.[p.id] ? `<img class="ic" alt="" src="data:image/png;base64,${G.iicons[p.id]}">` : "") + `<b>${fmt(p.n)}</b> ${esc(p.name)}`),
    ...(l.unread ? [`<span class="dim">${l.unread} that didn't read</span>`] : [])].join(", ");
  else h = esc(l.text);
  return `<div class="fl ${l.kind}"><time>${clockS(l.t)}</time><span>${h}</span></div>` }
function feedAdd(lines){ if (!lines?.length) return;
  // map changes, level-ups, deaths, party and job go to the event log; Started/Stopped lines to both
  const ev = lines.filter(l => EV_KINDS.has(l.kind) || l.kind === "sep"), run = lines.filter(l => !EV_KINDS.has(l.kind));
  ev.forEach(eventAdd);
  const html = lines.map(feedLine).join("");
  if (run.length) logAppend($("#feed"), run.map(feedLine).join(""));
  // the Mini and Focus views have their own copies (always at the newest line)
  for (const f of [$("#miniFeed"), $("#fzFeed")]){ f.insertAdjacentHTML("beforeend", html); while (f.children.length > 60) f.firstElementChild.remove(); f.scrollTop = f.scrollHeight } }
const feedSep = text => feedAdd([{t: Date.now(), kind: "sep", text}]);
function logAppend(el, html){
  const stick = el._stick ?? el.scrollHeight - el.scrollTop - el.clientHeight < 24;   // (_stick: renderer-layout.js, kept through resizes)
  el.insertAdjacentHTML("beforeend", html);
  while (el.children.length > 300) el.firstElementChild.remove();
  if (stick) el.scrollTop = el.scrollHeight }

// the event log (Danny 2026-10-19: "describing things that happen like map changes, level ups, status changes ... that's also
// where messages for the user should go"): every #status message lands here too, so the one line under Start is just the newest
const EV_KINDS = new Set(["map", "level", "death", "party", "job"]);
const note = (text, kind = "info") => eventAdd({t: Date.now(), kind, text});   // a line in the event log only (the status line stays)
// the server's answer to a shared run or KPQ round, pushed from the main process (preload onShare): the "sent" note only
// ever meant queued, so the outcome follows it — kept but not counted shows with the server's own reason (2026-10-26)
host.onShare(s => note(s.counted === false ? `The server kept but didn't count that ${s.what}: ${s.why}`
  : `The server refused that ${s.what}: ${s.why}`, s.what === "KPQ round" ? "kpq" : "info"));
let statusKind = "", statusUndo = false;   // statusKind: set right before a #status write that's a level-up; statusUndo: oneFrame putting the old line back
function eventAdd(l){ const el = $("#events"), last = el.lastElementChild;
  // the same level twice (the level-up message and the run log's "reached level"): keep the first
  const lv = l.kind === "level" && (String(l.text).match(/level (\d+)/i) || [])[1];
  if (lv && [...el.children].slice(-4).some(x => x.dataset.lv === lv)) return;
  // a message that only changed its numbers (a frame counter, "Saving 12/60") updates its line instead of adding one
  const key = String(l.text).replace(/\d[\d,.:]*/g, "#");
  if (l.kind === "msg" || l.kind === "bad"){
    if (last?.dataset.key === key && l.t - +last.dataset.t < 15000){ last.outerHTML = eventLine(l, key, lv); return }
  }
  logAppend(el, eventLine(l, key, lv)) }
const eventLine = (l, key, lv) => feedLine(l).replace('<div ', `<div data-key="${esc(key)}" data-txt="${esc(l.text)}" data-t="${l.t}"${lv ? ` data-lv="${lv}"` : ""} `);
function eventStatus(){ const el = $("#status"), text = el.textContent.trim();
  const last = $("#events").lastElementChild;
  if (statusUndo){ statusUndo = false; if (/^Reading the MapleStory/.test(last?.dataset.txt || "")) last.remove(); return }
  const kind = statusKind || (el.classList.contains("bad") ? "bad" : "msg"); statusKind = "";
  if (!text || last?.dataset.txt === text) return;
  eventAdd({t: Date.now(), kind, text}) }
new MutationObserver(eventStatus).observe($("#status"), {childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class"]});
eventStatus();   // the first line ("Looking for the MapleStory window...")

// start/end snapshots: {t, level, pct, exp?, file?, hand?}; a hand-fixed or button snapshot isn't replaced by the automatic ones
const snaps = {start: null, end: null};
const clock = t => new Date(t).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});
$("#snapFix").onclick = () => { const e = $("#snapEdit"), open = e.hidden; e.hidden = !open; $("#snapFix").setAttribute("aria-expanded", String(open)); $("#snapFix").textContent = open ? "done" : "fix" };
function renderSnaps(live = session?.stats().exp){   // live: EXP the live count added up over (about) the same stretch
  for (const [i, k] of [[0, "start"], [1, "end"]]){
    const sn = snaps[k], lv = $("#s" + i + "lv"), pc = $("#s" + i + "pct");
    if (document.activeElement !== lv) lv.value = sn?.level ?? "";
    if (document.activeElement !== pc) pc.value = sn?.pct ?? "";
    $("#s" + i + "t").textContent = sn ? clock(sn.t) + (sn.file ? " · saved" : "") : "";
  }
  const a = snaps.start, b = snaps.end, d = a && b && b.t > a.t ? GrindSession.expBetween(G, a, b) : null, hrs = a && b ? (b.t - a.t) / 3.6e6 : 0;
  $("#snapRate").textContent = d != null && hrs > 0 ? fmt(d / hrs) + " EXP/hr" : "-";
  // the main card's one line: start reading -> the end reading, or the bar now while tracking
  const now = b || (session?.state.bar?.level ? {level: session.state.bar.level, pct: session.state.bar.pct, t: session.state.bar.t} : null), rd = x => x?.level ? `Lv ${x.level} ${x.pct != null ? (+x.pct).toFixed(2) + "%" : ""}` : "?";
  const a0 = a?.level ? a : session?.state.firstBar || a;   // no start reading yet: the run's first bar read
  $("#snapLine").innerHTML = a0 || now ? `<b>${esc(rd(a0))}</b> → <b>${esc(rd(now))}</b>${a0 && now ? ` <span class="dim">read ${esc(clock(a0.t))} · ${esc(clock(now.t))}</span>` : ""}${d != null && hrs > 0 ? ` <span class="dim">· ${fmt(d / hrs)} EXP/hr</span>` : ""}`
    : "Read at Start and at Stop";
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
  const sn = !bar && !hand && snaps[which]?.level ? {...snaps[which]} : {t: Date.now(), level, pct: bar ? bar.pct : null, exp: bar && level && !(G.exp[level] && Math.abs(bar.exp - bar.pct / 100 * G.exp[level]) > 0.01 * G.exp[level]) ? bar.exp : undefined, hand};
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
// boxes: a Companion's Magic Box that left the Use tab was opened; its rewards are read from the chat box (OCR, up to 3
// tries a second apart). Each reward group counts once while it stays on screen (boxSeen: group -> times counted)
const BOX = "2430000";
let boxHad = 0, boxPending = null, boxSeen = new Map();
async function checkBox(c, t){
  const sess = session, groups = GrindReaders.boxFromText(await host.ocr(await toPng(c)));
  if (sess !== session || !boxPending) return;
  const n = new Map(); for (const g of groups) n.set(g.key, (n.get(g.key) || 0) + 1);
  let got = 0;
  for (const g of groups){
    if ((boxSeen.get(g.key) || 0) >= n.get(g.key)) continue;
    boxSeen.set(g.key, (boxSeen.get(g.key) || 0) + 1); got++;
    for (const it of g.items){
      if (!it.id){ log("boxraw", {name: it.name, qty: it.qty}); continue }
      const e = {t, type: "item", id: it.id, qty: it.qty, src: "box"}; session.add(e); slicer.add(e); log("event", e);
    }
  }
  if (got){ boxPending = null; note("Box opened: " + groups.slice(-got).flatMap(g => g.items.map(i => i.name + " ×" + i.qty)).join(", ")) }
  else if (++boxPending.tries >= 3) boxPending = null;
}
const deaths = {confirmed: 0, lost: 0, unseen: 0};
async function checkDeath(c, t){   // c: the chat box crop (GrindReaders.chatCrop)
  const sess = session, text = await host.ocr(await toPng(c)), lost = GrindReaders.deathFromText(text);
  if (sess !== session || !deathPending) return;
  if (lost){ deaths.confirmed++; deaths.lost += lost; deathPending = null; log("death", {lost}); note(`Death confirmed in chat: lost ${fmt(lost)} EXP`, "death"); jr.death(t, lost) }
  else if (++deathPending.tries >= 3){ deaths.unseen++; deathPending = null; log("death", {lost: null}) }
}

