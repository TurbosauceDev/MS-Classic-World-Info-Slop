/* ---------------- KPQ timer page (#kpqt) and the KPQ leaderboard's filters ---------------- */
// The timer: a stopwatch split by KPQ stage (1st … Last, then Bonus), keyed by the player (Space = next stage). Optional
// screen share reads the in-game "Time Left" clock with the tracker's reader (readers.js readKpqTimer, inlined by build.py):
// the round then starts when a new clock appears and its time follows the game clock. Stages stay a key press: the site has
// no map reader. Rounds live in localStorage ("kpqt"); cleared ones go to the tracker server's /api/kpq when the player
// turns sending on (src "site", 2026-10-21). Clear = 1st stage to leaving the Last stage, like the tracker.
const KPQT = (() => {
const STG = ["1st", "2nd", "3rd", "4th", "Last", "Bonus"];
const KS = ["80000000", "80000100", "80000200", "80000300", "80000400", "80000500"];   // KPQ map ids, same order
const API = TRK_API.replace(/\/api\/summary$/, "/api/kpq");
// jobs as the tracker reads them off the stat window; first job names for the made-up board name (tracker kpqAlias)
const JOBS = ["Beginner", "Swordman", "Fighter", "Page", "Spearman", "Magician", "Wizard (Fire, Poison)", "Wizard (Ice, Lightning)", "Cleric",
  "Archer", "Hunter", "Crossbowman", "Rogue", "Assassin", "Bandit"];
const FIRST = {Fighter: "Swordman", Page: "Swordman", Spearman: "Swordman", Cleric: "Magician", Hunter: "Archer", Crossbowman: "Archer", Assassin: "Rogue", Bandit: "Rogue"};
const $k = id => document.getElementById(id);
const tenths = s => { s = Math.max(0, s); const m = Math.floor(s / 60), r = s - m * 60; return m + ":" + (r < 10 ? "0" : "") + r.toFixed(1) };
const secs = s => s == null ? "–" : mss(s);
const dlt = d => (d < 0 ? "−" : "+") + (Math.abs(d) >= 60 ? mss(Math.abs(d)) : Math.abs(d).toFixed(1) + "s");

/* ---- saved state ---- */
const SET = Object.assign({name: "", job: "", level: "", party: 4, code: "", send: false, id: ""}, savedState("kpqtset", {name: "", job: "", level: "", party: 4, code: "", send: false, id: ""}));
if (!/^site-[0-9a-f]{24}$/.test(SET.id)) SET.id = "site-" + [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, "0")).join("");
let ROUNDS = [];
try { const v = JSON.parse(localStorage.getItem("kpqt") || "[]"); if (Array.isArray(v)) ROUNDS = v.filter(r => r && Array.isArray(r.st) && r.st.length === 6) } catch(e) {}
const save = () => { try { localStorage.setItem("kpqt", JSON.stringify(ROUNDS.slice(-300))); localStorage.setItem("kpqtset", JSON.stringify(SET)) } catch(e) {} };

/* ---- the round being timed ----
   cur = {t0: Date.now() at the 1st stage, at: ISO start, splits: [seconds at the end of each stage], clk: null | {left0, left, at}}
   With the game clock: round time = clk.left0 - clock now (plus the part of a second since it last ticked) */
let cur = null, undoBin = null;
try { const v = JSON.parse(localStorage.getItem("kpqtcur") || "null"); if (v && typeof v.t0 === "number" && Array.isArray(v.splits) && Date.now() - v.t0 < 3 * 3600e3) cur = v } catch(e) {}
const keepCur = () => { try { cur ? localStorage.setItem("kpqtcur", JSON.stringify(cur)) : localStorage.removeItem("kpqtcur") } catch(e) {} };
function now(){
  if (!cur) return 0;
  const c = cur.clk;
  // between clock ticks: the part of a second since the last one; clock gone (map change, window covered): carry on from it
  if (c && c.left != null){ const dt = (Date.now() - c.at) / 1000; return Math.max(cur.splits.at(-1) || 0, c.left0 - c.left + (dt < 4 ? Math.min(.95, dt) : dt)) }
  return (Date.now() - cur.t0) / 1000;
}
const stageIdx = () => cur ? cur.splits.length : -1;   // 0-4 = 1st … Last, 5 = Bonus
function start(left = null){
  cur = {t0: Date.now(), at: new Date().toISOString(), splits: [], clk: left == null ? null : {left0: left, left, at: Date.now()}};
  keepCur(); render(); loop();
}
function next(){
  if (!cur) return start(S?.left ?? null);
  if (stageIdx() >= 5) return end();
  cur.splits.push(Math.round(now() * 10) / 10); keepCur(); render();
}
function undo(){ if (cur?.splits.length){ cur.splits.pop(); keepCur(); render() } }
function cancel(){
  if (!cur) return;
  undoBin = cur; cur = null; keepCur(); render();
  toast(`Round thrown away <button type="button" data-undo>Undo</button>`, 6000);
}
// End: in the Last stage = cleared, no Bonus (a Rush); in the Bonus = done; earlier = left before the Last stage (kept, not cleared)
function end(){
  if (!cur) return;
  const t = Math.round(now() * 10) / 10, sp = [...cur.splits, t];   // the stage it's in ends now
  const st = STG.map((_, k) => sp[k] == null ? null : Math.round((sp[k] - (k ? sp[k - 1] : 0)) * 10) / 10);
  const cleared = sp.length >= 5, clear = cleared ? sp[4] : null;
  const r = {id: Date.now(), at: cur.at, date: new Date(cur.t0).toLocaleDateString("sv"), hour: new Date(cur.t0).getUTCHours(), st, clear,
    total: sp.at(-1), clock: !!cur.clk, party: +SET.party || 4, job: SET.job || null, level: +SET.level || null, sent: null};
  ROUNDS.push(r); cur = null; keepCur(); save(); render();
  if (S) S.armed = false;   // the clock still shows (Bonus, Exit): wait for it to go before a new round starts by itself
  if (cleared && SET.send) send(r);
  else toast(cleared ? `Cleared in <b>${tenths(clear)}</b>` : "Round saved (not cleared: ended before the Last stage)", 4000);
}

/* ---- leaderboard ---- */
const alias = () => { const j = SET.job || "", b = j.startsWith("Wizard") ? "Magician" : FIRST[j] || (/^(Beginner|Swordman|Magician|Archer|Rogue)$/.test(j) ? j : "Player");
  return b + (parseInt(SET.id.slice(5, 13), 16) % 9000 + 1000) };
async function send(r){
  if (r.clear == null || r.sent === "sent") return;
  const stages = {}; r.st.forEach((s, k) => { if (s != null) stages[KS[k]] = Math.round(s) });
  const name = /^[A-Za-z0-9]{2,12}$/.test(SET.name) ? SET.name : alias();
  const body = {kpq: true, v: 1, src: "site", install: SET.id, date: r.date, hour: r.hour, mode: r.st[5] != null ? "Bonus" : "Rush", party: r.party, level: r.level || +SET.level || null,
    job: r.job || SET.job || null, clear: Math.round(r.clear), total: Math.round(r.total), clock: r.clock, stages, partyCode: SET.code.trim() || null, name};
  r.sent = "sending"; render();
  try {
    const res = await fetch(API, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body), signal: AbortSignal.timeout(15e3)});
    const j = await res.json().catch(() => ({}));
    r.sent = res.ok ? (j.counted || j.why === "already sent" ? "sent" : "not counted: " + (j.why || "?")) : res.status === 429 ? "too many rounds this hour" : "refused: " + (j.error || res.status);
  } catch(e){ r.sent = "couldn't reach the server" }
  save(); render();
  toast(r.sent === "sent" ? `Sent to the <a href="#" data-go="trkkpq">KPQ leaderboard</a> as <b>${esc(name)}</b>` : "Not sent: " + esc(r.sent), 5000);
}

/* ---- screen share: the in-game KPQ clock ---- */
let S = null;
async function share(){
  if (S) return unshare();
  const st = $k("ktshst"); st.hidden = false;
  if (!navigator.mediaDevices?.getDisplayMedia){ st.textContent = "Needs a desktop browser (Chrome, Edge, Firefox)"; st.className = "pill p-warn"; return }
  let stream;
  try { stream = await navigator.mediaDevices.getDisplayMedia({video: {frameRate: 5}, audio: false}) }
  catch(e){ st.textContent = e.name === "NotAllowedError" ? "Sharing cancelled" : "This page can't share your screen here: open the site in your browser"; st.className = "pill p-warn"; return }
  const video = document.createElement("video"); video.muted = true; video.playsInline = true; video.srcObject = stream;
  try { await video.play() } catch(e) {}
  S = {stream, video, canvas: document.createElement("canvas"), left: null, seen: 0, gone: Date.now(), armed: false, prev: null};
  stream.getVideoTracks()[0].addEventListener("ended", unshare);
  S.timer = setInterval(tick, 250);
  $k("ktshare").textContent = "Stop sharing"; shareState();
}
function unshare(){
  if (!S) return;
  clearInterval(S.timer); S.stream.getTracks().forEach(t => t.stop()); S = null;
  $k("ktshare").textContent = "Share game window"; $k("ktshst").hidden = true; render();
}
function tick(){
  const v = S?.video; if (!v?.videoWidth) return;
  const c = S.canvas; if (c.width !== v.videoWidth || c.height !== v.videoHeight){ c.width = v.videoWidth; c.height = v.videoHeight }
  const g = c.getContext("2d", {willReadFrequently: true}); g.drawImage(v, 0, 0);
  let left = null;
  try { left = GrindReaders.readKpqTimer(GrindReaders.native({w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data}, true)) } catch(e) {}
  feed(left, Date.now());
}
// one clock read (also called by tests): null = no clock on screen
function feed(left, t){
  if (!S) return;
  if (left == null){ if (S.left != null) S.gone = t; S.left = null; S.prev = null; if (t - S.gone > 3000) S.armed = true; shareState(); return }
  // a new round's clock: armed (no clock for 3 s) and two reads that agree (falling, or the same second)
  const fresh = S.armed && S.prev != null && left <= S.prev && S.prev - left <= 2;
  S.prev = left;
  if (S.left !== left){ S.left = left; S.at = t }
  if (!cur && fresh){ S.armed = false; start(left); toast("Round started from the KPQ clock", 3000) }
  else if (cur){
    if (!cur.clk) cur.clk = {left0: left + (t - cur.t0) / 1000, left, at: t};   // clock first seen mid-round
    else if (cur.clk.left !== left){ cur.clk.left = left; cur.clk.at = t }
    keepCur();
  }
  shareState();
}
function shareState(){
  if (!S) return;
  const st = $k("ktshst");
  st.textContent = S.left != null ? "KPQ clock " + mss(S.left) : S.armed ? "Watching for the next KPQ clock" : "No KPQ clock on screen";
  st.className = "pill" + (S.left != null ? " p-good" : "");
}

/* ---- drawing ---- */
const cleared = () => ROUNDS.filter(r => r.clear != null);
function bests(){
  const b = STG.map((_, k) => { const v = ROUNDS.map(r => r.st[k]).filter(x => x != null); return v.length ? Math.min(...v) : null });
  const c = cleared().map(r => r.clear);
  return {stage: b, clear: c.length ? Math.min(...c) : null};
}
let raf = 0;
function loop(){ cancelAnimationFrame(raf); if (!cur) return; const f = () => { if (!cur) return; if (!$k("kpqt").hidden) live(); raf = requestAnimationFrame(f) }; raf = requestAnimationFrame(f) }
function live(){
  const t = now(), i = stageIdx(), b = bests();
  $k("ktclock").textContent = tenths(t);
  const el = $k("ktstages").children[Math.min(i, 5)]; if (!el) return;
  const st = t - (cur.splits.at(-1) || 0), best = b.stage[i];
  el.querySelector(".t").textContent = tenths(st);
  const bar = el.querySelector(".kt-bar i"); bar.style.width = (best ? Math.min(100, st / best * 100) : 0) + "%"; bar.classList.toggle("over", !!best && st > best);
  const d = el.querySelector(".d"); if (best){ d.textContent = st > best ? dlt(st - best) + " vs best" : "best " + tenths(best); d.className = "d" + (st > best ? " slow" : "") }
}
function render(){
  const i = stageIdx(), b = bests(), sp = cur?.splits || [];
  const clk = $k("ktclock"); clk.className = "kt-clock" + (cur ? i >= 5 ? " bonus" : " run" : "");
  if (!cur){ const last = ROUNDS.at(-1); clk.textContent = last ? tenths(last.clear ?? last.total) : "0:00.0" }
  $k("ktstate").innerHTML = !cur ? (S?.armed ? "Ready: starts by itself when the KPQ clock appears, or press <kbd>Space</kbd>" : "Ready: press <kbd>Space</kbd> as the 1st stage starts")
    : i < 4 ? `${STG[i]} stage: <kbd>Space</kbd> when it's cleared` : i === 4 ? "Last stage: <kbd>Space</kbd> into the Bonus, <kbd>Enter</kbd> if you skip it"
    : `Bonus stage (cleared in <b>${tenths(sp[4])}</b>${b.clear != null && sp[4] !== b.clear ? `, ${dlt(sp[4] - b.clear)} vs best` : ""}): <kbd>Space</kbd> when you leave`;
  $k("ktnext").innerHTML = (!cur ? "Start" : i < 4 ? "Next stage" : i === 4 ? "Into Bonus" : "Finish") + " <kbd>Space</kbd>";
  $k("ktend").innerHTML = (!cur || i < 4 ? "End round" : i === 4 ? "Clear, skip Bonus" : "Finish") + " <kbd>Enter</kbd>";
  $k("ktend").disabled = $k("ktcancel").disabled = !cur; $k("ktundo").disabled = !sp.length;
  // stage cells: done ones show their time and how it went against the best before this round
  $k("ktstages").innerHTML = STG.map((n, k) => {
    const done = cur && k < sp.length, t = done ? sp[k] - (k ? sp[k - 1] : 0) : null, best = b.stage[k];
    const d = done && best != null ? (t <= best ? `<span class="d fast">${t < best ? dlt(t - best) + " new best" : "= best"}</span>` : `<span class="d slow">${dlt(t - best)}</span>`)
      : `<span class="d">${best != null ? "best " + tenths(best) : ""}</span>`;
    const w = done ? (best ? Math.min(100, t / best * 100) : 100) : 0;
    return `<li class="kt-st${done ? " done" : ""}${cur && k === i ? " now" : ""}"><b>${n}</b><span class="t">${done ? tenths(t) : cur && k === i ? "0:00.0" : "–"}</span>${d}<div class="kt-bar"><i style="width:${w}%"${done && best && t > best ? ' class="over"' : ""}></i></div></li>`;
  }).join("");
  if (cur) live();
  // stats and history
  const c = cleared(), last10 = c.slice(-10).map(r => r.clear), sob = b.stage.slice(0, 5).every(x => x != null) ? b.stage.slice(0, 5).reduce((a, x) => a + x, 0) : null;
  const bon = ROUNDS.map(r => r.st[5]).filter(x => x != null);
  $k("ktstats").innerHTML = [["Rounds", fmt(ROUNDS.length) + (ROUNDS.length > c.length ? ` <span class="sub">(${c.length} cleared)</span>` : "")], ["Best clear", secs(b.clear)],
    ["Average, last 10", last10.length ? mss(last10.reduce((a, x) => a + x, 0) / last10.length) : "–"], ["Sum of best stages", secs(sob)],
    ["Average Bonus", bon.length ? mss(bon.reduce((a, x) => a + x, 0) / bon.length) : "–"]].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  if (!ROUNDS.length){ $k("kthist").innerHTML = `<p class="tiny">No rounds yet. They're saved in this browser as you finish them.</p>`; return }
  const rows = ROUNDS.slice(-50).reverse().map(r => {
    const sent = r.clear == null ? `<span class="sub">not cleared</span>` : r.sent === "sent" ? `<span class="pill p-good">sent</span>` : r.sent === "sending" ? `<span class="sub">sending…</span>`
      : `<button class="btn sm" type="button" data-send="${r.id}">Send</button>${r.sent ? ` <span class="sub">${esc(r.sent)}</span>` : ""}`;
    return `<tr><td class="sub kt-when" title="${esc(r.date)}">${esc(r.date.slice(5))} ${new Date(r.at).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}</td><td class="num${r.clear != null && r.clear === b.clear ? " best" : ""}"><b>${secs(r.clear)}</b></td>`
      + r.st.map((s, k) => `<td class="num${s != null && s === b.stage[k] ? " best" : ""}">${secs(s)}</td>`).join("")
      + `<td class="num">${r.party}</td><td>${r.clock ? "game clock" : "key presses"}</td><td>${sent}</td><td><button class="kt-x" type="button" data-del="${r.id}" title="Delete this round" aria-label="Delete this round">×</button></td></tr>`;
  }).join("");
  $k("kthist").innerHTML = `<div class="tblwrap"><table class="mini"><thead><tr><th>When</th><th class="num">Clear</th>${STG.map(n => `<th class="num">${n}</th>`).join("")}<th class="num">Party</th><th>Timed by</th><th>Leaderboard</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    + (ROUNDS.length > 50 ? `<p class="tiny">Newest 50 of ${fmt(ROUNDS.length)} shown; bests and averages use all of them.</p>` : "");
}
let toastT = 0;
function toast(html, ms){ const el = $k("kttoast"); el.innerHTML = html; el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), ms) }

/* ---- wiring ---- */
$k("ktjob").innerHTML = `<option value="">–</option>` + JOBS.map(j => `<option>${j}</option>`).join("");
const form = {name: "ktname", job: "ktjob", level: "ktlevel", party: "ktparty", code: "ktcode"};
for (const [k, id] of Object.entries(form)){ $k(id).value = SET[k] ?? ""; $k(id).addEventListener("input", () => { SET[k] = $k(id).value; save() }) }
$k("ktname").addEventListener("change", () => { const v = $k("ktname").value.trim(); $k("ktname").setCustomValidity(v && !/^[A-Za-z0-9]{2,12}$/.test(v) ? "Letters and digits, 2 to 12" : ""); $k("ktname").reportValidity() });
$k("ktsend").checked = !!SET.send; $k("ktsend").addEventListener("change", () => { SET.send = $k("ktsend").checked; save() });
$k("ktnext").addEventListener("click", next); $k("ktend").addEventListener("click", end); $k("ktundo").addEventListener("click", undo); $k("ktcancel").addEventListener("click", cancel);
$k("ktshare").addEventListener("click", share);
$k("kpqt").addEventListener("click", e => {
  const a = e.target.closest("a[data-go]"); if (a){ e.preventDefault(); $("#t-" + a.dataset.go).click(); window.scrollTo({top: 0}); return }
  if (e.target.closest("[data-undo]") && undoBin && !cur){ cur = undoBin; undoBin = null; keepCur(); render(); loop(); $k("kttoast").classList.remove("on"); return }
  const s = e.target.closest("[data-send]"); if (s){ const r = ROUNDS.find(x => x.id === +s.dataset.send); if (r) send(r); return }
  const d = e.target.closest("[data-del]"); if (d){ ROUNDS = ROUNDS.filter(x => x.id !== +d.dataset.del); save(); render() }
});
document.addEventListener("keydown", e => {
  if ($k("kpqt").hidden || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  if (e.target.closest?.("input, select, textarea, [contenteditable]") || document.querySelector("dialog[open], .modal:not([hidden])")) return;
  const k = e.key;
  if (k === " "){ e.preventDefault(); next() }
  else if (k === "Enter" && cur){ e.preventDefault(); end() }
  else if (k === "Backspace" && cur){ e.preventDefault(); undo() }
  else if (k === "Escape" && cur){ e.preventDefault(); cancel() }
});
render(); if (cur) loop();
return {feed, start, next, end, get rounds(){ return ROUNDS }, get cur(){ return cur }, set sharing(v){ S = v ? {left: null, gone: 0, armed: true, prev: null} : null }, render, name: () => SET.name};
})();

/* ---- KPQ leaderboard from the server's round list (summary.kpq.list, server 2026-10-21): filters for board, party
   size, job, period and timing. One line per party (party code) or player; Rush = fastest clear, Bonus = most EXP + mesos
   that round (site-timed rounds have no EXP, so they're on Rush only). Old summaries without a list: trkKpq's own board. ---- */
const KPQB = (() => {
const CLASS = {Beginner: "Beginner", Swordman: "Warrior", Fighter: "Warrior", Page: "Warrior", Spearman: "Warrior", Magician: "Magician", Cleric: "Magician",
  Archer: "Bowman", Hunter: "Bowman", Crossbowman: "Bowman", Rogue: "Thief", Assassin: "Thief", Bandit: "Thief"};
const jobClass = j => j ? CLASS[j] || (j.startsWith("Wizard") ? "Magician" : null) : null;
const STG = ["1st", "2nd", "3rd", "4th", "Last", "Bonus"];
const DEF = {mode: "Rush", party: "any", job: "any", when: "all", timing: "any"};
const F = Object.assign({...DEF}, savedState("trkkf", DEF));
const keep = () => { try { localStorage.setItem("trkkf", JSON.stringify(F)) } catch(e) {} };
let open = null, today = null;   // the board group / today-card round whose stage splits are shown
const day = d => new Date(d + "T12:00:00");
const todayStr = () => new Date().toLocaleDateString("sv");
function rows(list){
  const today = todayStr(), week = Date.now() - 7 * 864e5;
  return list.filter(e => (F.party === "any" || String(e.p) === F.party) && (F.job === "any" || jobClass(e.j) === F.job)
    && (F.when === "all" || (F.when === "today" ? e.d === today : day(e.d) >= week))
    && (F.timing === "any" || (F.timing === "clock" ? e.k : e.src === "tracker"))
    && (F.mode === "Rush" || e.s[5] != null && e.x != null));
}
const score = e => (e.x || 0) + (e.m || 0);
function board(list){
  const g = new Map();
  for (const e of rows(list)){
    if (!g.has(e.g)) g.set(e.g, {g: e.g, best: null, vals: [], n: 0, names: new Set()});
    const b = g.get(e.g), v = F.mode === "Rush" ? e.c : score(e);
    b.vals.push(v); b.n++; e.n.forEach(n => b.names.add(n));
    if (!b.best || (F.mode === "Rush" ? v < b.best.c : v > score(b.best))) b.best = e;
  }
  return [...g.values()].sort(F.mode === "Rush" ? (a, b) => a.best.c - b.best.c : (a, b) => score(b.best) - score(a.best));
}
/* Scored boards (server summary.kpq.scores, 2026-10-29): points per round from the tracker's raw numbers, computed by the server with
   tracker/core/kpqscore.js. Five boards, one line per party or player; filters above don't apply (they work on the plain round list). */
const SB = [["total", "Best full run"], ["rush", "Rush"], ["bonus", "Bonus"], ["could", "What could have been"], ["mmr", "Average score"]];
let sbSel = (savedState("trkks", {b: "total"}).b);
function scoreCard(k, mine, crank, rank){
  const sc = k.scores, w = k.weights || {}, ref = sc?.ref || {};
  if (!sc || !SB.some(([id]) => sc[id]?.length)) return `<div class="card kb-card kb-scored"><h3>Scored boards</h3><p class="sub">Rounds sent from Grind Tracker 0.3.20 and later are scored: Rush from stage speed, Bonus from EXP, mesos and drops. None have arrived yet.</p></div>`;
  if (!sc[sbSel]?.length) sbSel = SB.find(([id]) => sc[id]?.length)[0];
  const list = sc[sbSel], pv = e => e.provisional ? ' <span class="sub" title="No recorded average yet: speed points are 0 and the Bonus scale is a placeholder">†</span>' : "";
  const who = e => ((e.names || []).length ? `<b>${e.names.map(crank).join(", ")}</b> <span class="sub">` : "<span>") + (e.party > 1 ? "party of " + e.party : "solo") + "</span>";
  const lj = e => `<td>${e.level ? "Lv " + e.level : "–"}${e.job ? ` <span class="sub">${esc(e.job)}</span>` : ""}</td>`;
  const cols = {
    total: [["Score", e => `<b>${fmt(e.pts)}</b>${pv(e)}`], ["Rush", e => fmt(e.rush)], ["Bonus", e => e.bonus == null ? "–" : fmt(e.bonus)]],
    rush: [["Rush points", e => `<b>${fmt(e.pts)}</b>${pv(e)}`], ["Clear", e => mss(e.clear)], ["Speed points", e => (e.speed >= 0 ? "+" : "") + fmt(e.speed) + (e.perfect ? ' <span class="pill p-good">perfect</span>' : "")]],
    bonus: [["Bonus points", e => `<b>${fmt(e.pts)}</b>${pv(e)}`], ["EXP", e => fmt(e.exp)], ["Mesos", e => fmt(e.mesos)], ["Drops (NPC value)", e => fmt(e.npc)], ["Bonus time", e => mss(e.sec)]],
    could: [["Score", e => `<b>${fmt(e.pts)}</b>${pv(e)}`], ["Best Rush", e => fmt(e.rush)], ["Best Bonus", e => fmt(e.bonus)], ["Same round", e => e.sameRound ? "yes" : "no"]],
    mmr: [["Average", e => `<b>${fmt(e.pts)}</b>${pv(e)}`], ["Rounds", e => fmt(e.rounds)], ["Best round", e => fmt(e.best)]],
  }[sbSel];
  const trs = list.map((e, i) => { const me = mine && (e.names || []).some(n => n.toLowerCase() === mine);
    return `<tr${me ? ' class="kb-me"' : ""}><td class="num">${rank(i)}</td>${cols.map(([, f]) => `<td class="num">${f(e)}</td>`).join("")}<td>${who(e)}</td>${lj(e)}<td class="sub">${esc(e.date || "")}</td></tr>` }).join("");
  const seg = `<div class="seg small" role="radiogroup" aria-label="Scored board">${SB.map(([id, t]) => `<button role="radio" type="button" aria-checked="${id === sbSel}" data-sb="${id}"${sc[id]?.length ? "" : " disabled"}>${t}</button>`).join("")}</div>`;
  const hasRef = Object.keys(ref.med || {}).length, desc = {
    total: "One round's Rush points plus its Bonus points, best round per party or player.",
    rush: "Stage speed against the recorded average and best, plus drops.",
    bonus: "EXP, mesos and drops (at their NPC sell price) gained in the Bonus map, plus item bonuses.",
    could: "A player's best Rush plus their best Bonus, even from different rounds: the run they could have had.",
    mmr: `Average total over a player's rounds, ${3}+ rounds needed so one lucky run doesn't rank.`}[sbSel];
  return `<div class="card kb-card kb-scored"><h3>Scored boards</h3>${seg}<p class="sub">${desc}</p>
    <div class="tblwrap"><table><thead><tr><th class="num">Rank</th>${cols.map(([h]) => `<th class="num">${h}</th>`).join("")}<th>Who</th><th>Level and job</th><th>Date</th></tr></thead><tbody>${trs}</tbody></table></div>
    <details class="kb-how"><summary>How rounds are scored</summary><ul class="tiny">
      <li><b>Rush</b> = ${fmt(w.CLEAR_BASE || 1000)} for a clear + ${w.STAGE_W || 100} per stage for how far it beat the recorded average (the fastest recorded stage = +${w.STAGE_W || 100}, up to +${(w.STAGE_W || 100) * 1.5} for a new record, as far over average as the record is under = −${w.STAGE_W || 100}) + ${w.PERFECT || 500} for a near-perfect round (every stage ≥ ${Math.round((w.PERFECT_Z || .8) * 100)}% of the way to the record) + drop points.</li>
      <li><b>Bonus</b> = (EXP + mesos + NPC sell price of every drop) × a scale that makes the median recorded Bonus worth 1,000, + drop points.</li>
      <li><b>Drop points</b>: ${w.ETC_PTS || 5} per Etc item, ${w.USE_PTS || 10} per Use item, ${w.SCROLL_PTS || 150} per scroll, ${w.EQUIP_PTS || 25} per equip, ${fmt(w.PAN_PTS || 1000)} for a Pan Lid. NPC prices are the game's (OSMS export); the weights are our own design.</li>
      <li>${hasRef ? `Averages come from ${fmt(ref.n || 0)} recorded rounds (a stage needs ${ref.minRounds || 10}), so scores shift a little as more rounds arrive.` : `No averages yet (each stage needs ${ref.minRounds || 10} recorded rounds, ${fmt(ref.n || 0)} so far): speed points are 0 and rounds are marked †. Nothing is made up; the averages come from rounds players send.`}</li>
      <li>The tracker also shows market value (player prices) for drops; only the points use NPC prices.</li></ul></details></div>`;
}
const sel = (id, label, opts) => `<label>${label} <select data-f="${id}">${opts.map(([v, t]) => `<option value="${v}"${F[id] === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>`;
function render(k){
  const list = k.list, mine = KPQT.name().toLowerCase();
  const parties = [...new Set(list.map(e => e.p))].sort((a, b) => a - b), classes = [...new Set(list.map(e => jobClass(e.j)).filter(Boolean))].sort();
  if (F.party !== "any" && !parties.includes(+F.party)) F.party = "any";
  if (F.job !== "any" && !classes.includes(F.job)) F.job = "any";
  const bonusN = list.filter(e => e.s[5] != null && e.x != null).length;
  if (F.mode === "Bonus" && !bonusN) F.mode = "Rush";
  const rush = F.mode === "Rush", b = board(list);
  const filt = `<div class="kb-filters"><div class="seg small" role="radiogroup" aria-label="Board" id="trkkm">${["Rush", "Bonus"].map(m => `<button role="radio" type="button" aria-checked="${m === F.mode}" data-m="${m}"${m === "Bonus" && !bonusN ? " disabled" : ""}>${m}</button>`).join("")}</div>
    ${sel("party", "Party", [["any", "Any size"], ...parties.map(p => [String(p), p === 1 ? "Solo" : p + " players"])])}
    ${sel("job", "Job", [["any", "Any job"], ...classes.map(c => [c, c])])}
    ${sel("when", "When", [["all", "All time"], ["week", "Last 7 days"], ["today", "Today"]])}
    ${sel("timing", "Timed by", [["any", "Anything"], ["clock", "In-game clock"], ["tracker", "Grind Tracker only"]])}
    <button class="btn sm" type="button" data-kreset${Object.keys(DEF).every(x => F[x] === DEF[x]) ? " disabled" : ""}>Reset filters</button></div>`;
  const crank = n => /^[A-Za-z0-9]{2,13}$/.test(n) ? `<a href="https://classicrank.com/user/${n}" target="_blank" rel="noopener" title="${n} on classicrank.com">${n}</a>` : esc(n);
  const rank = i => i < 3 ? `<span class="pill ${i ? "p-hot" : "p-good"}">#${i + 1}</span>` : "#" + (i + 1);
  const mark = e => (e.k ? "" : ' <span class="sub" title="Timed with the PC clock: the KPQ clock wasn\'t read">~</span>') + (e.src === "site" ? ' <span class="sub" title="Timed on this site\'s KPQ timer (stages by key press)">⌨</span>' : "");
  const cols = rush ? 7 : 9;
  const trs = b.slice(0, 50).map((x, i) => {
    const e = x.best, names = [...x.names].slice(0, 6), me = mine && names.some(n => n.toLowerCase() === mine);
    const who = (names.length ? `<b>${names.map(crank).join(", ")}</b> <span class="sub">` : "<span>") + (e.p > 1 ? "party of " + e.p : "solo") + "</span>";
    const lj = `<td>${e.l ? "Lv " + e.l : "–"}${e.j ? ` <span class="sub">${esc(e.j)}</span>` : ""}</td>`;
    const tr = rush ? `<td class="num">${rank(i)}</td><td class="num"><b>${mss(e.c)}</b>${mark(e)}</td><td class="num">${mss(median(x.vals))}</td><td class="num">${x.n}</td><td>${who}</td>${lj}<td class="sub">${esc(e.d)}</td>`
      : `<td class="num">${rank(i)}</td><td class="num"><b>${fmt(score(e))}</b></td><td class="num">${fmt(e.x || 0)}</td><td class="num">${fmt(e.m || 0)}</td><td class="num">${mss(e.s[5])}</td><td class="num">${mss(e.c)}${mark(e)}</td><td>${who}</td>${lj}<td class="sub">${esc(e.d)}</td>`;
    const sp = open === x.g ? `<tr class="kb-sp"><td colspan="${cols + 1}">${splits(e)}</td></tr>` : "";
    return `<tr class="kb-row${me ? " kb-me" : ""}${open === x.g ? " kb-open" : ""}" data-g="${esc(x.g)}" tabindex="0" title="Stage times of this round">${tr}<td class="kb-ch" aria-hidden="true">${open === x.g ? "▴" : "▾"}</td></tr>${sp}`;
  }).join("");
  const th = rush ? `<th class="num">Rank</th><th class="num">Best clear</th><th class="num">Typical</th><th class="num">Rounds</th><th>Who</th><th>Level and job</th><th>Date</th>`
    : `<th class="num">Rank</th><th class="num">EXP + mesos</th><th class="num">EXP</th><th class="num">Mesos</th><th class="num">Bonus time</th><th class="num">Rush clear</th><th>Who</th><th>Level and job</th><th>Date</th>`;
  // fastest time per stage in the rounds the filters keep
  const rs = rows(list), fast = STG.slice(0, 5).map((n, s) => { let m = null; for (const e of rs) if (e.s[s] != null && (!m || e.s[s] < m.s[s])) m = e; return m ? [n, m.s[s], m.n[0] || ""] : null }).filter(Boolean);
  const fastHtml = rush && fast.length ? `<div class="card kb-fast"><h3>Fastest stages</h3><dl class="stats">${fast.map(([n, t, who]) => `<div><dt>${n}</dt><dd>${mss(t)}</dd><dd class="sub kb-who">${who ? esc(who) : "&nbsp;"}</dd></div>`).join("")}</dl><p class="tiny">Best single stage in the rounds shown above, whoever ran it. Together they're the fastest round anyone could put together.</p></div>` : "";
  const shown = rs.length;
  const body = b.length ? `<div class="tblwrap"><table><thead><tr>${th}<th aria-label="Stages"></th></tr></thead><tbody>${trs}</tbody></table></div>`
    : `<p class="tiny">No rounds match these filters. <button class="btn sm" type="button" data-kreset>Reset filters</button></p>`;
  // every round recorded today (this browser's date), in the order the server received it once rounds carry times
  // (Danny 10-25; arrival order + times 10-26), the day's best highlighted wherever it sits; independent of the
  // filters, so the whole day stays visible when the board is filtered down. Without times (old data): fastest first.
  const tday = list.filter(e => e.d === todayStr());
  const hasAt = tday.some(e => e.at);
  const trows = tday.slice().sort(hasAt ? (a, b) => (a.at || "").localeCompare(b.at || "") || a.c - b.c : (a, b) => a.c - b.c);
  const latest = list.map(e => e.d).sort().at(-1);
  const tbest = trows.length ? trows.reduce((b, e) => e.c < b.c ? e : b, trows[0]) : null;
  const tHM = at => { const t = new Date(at); return isNaN(t) ? "–" : t.toLocaleTimeString("en-GB", {hour: "2-digit", minute: "2-digit"}) };
  const ttrs = trows.map((e, i) => {
    const names = e.n || [], me = mine && names.some(n => n.toLowerCase() === mine);
    const who = (names.length ? `<b>${names.map(crank).join(", ")}</b> <span class="sub">` : "<span>") + (e.p > 1 ? "party of " + e.p : "solo") + "</span>";
    const sp = today === i ? `<tr class="kb-sp"><td colspan="${hasAt ? 8 : 7}">${splits(e)}</td></tr>` : "";
    const tt = hasAt ? `<td class="num" title="${esc(e.at || "")}">${e.at ? tHM(e.at) : "–"}</td>` : "";
    return `<tr class="kb-trow${e === tbest ? " kb-best" : ""}${me ? " kb-me" : ""}" data-ti="${i}" tabindex="0" title="Stage times of this round">${tt}<td class="num"><b>${mss(e.c)}</b>${mark(e)}${e === tbest ? ' <span class="pill p-good">best</span>' : ""}</td><td>${who}</td><td>${e.l ? "Lv " + e.l : "–"}${e.j ? ` <span class="sub">${esc(e.j)}</span>` : ""}</td><td class="num">${e.s[5] != null ? mss(e.s[5]) : "–"}</td><td class="num">${e.x != null ? fmt(e.x) : "–"}</td><td class="num">${e.m != null ? fmt(e.m) : "–"}</td><td class="kb-ch" aria-hidden="true">${today === i ? "▴" : "▾"}</td></tr>${sp}`;
  }).join("");
  const todayCard = `<div class="card kb-card kb-today"><h3>Today's runs</h3>${trows.length ? `<p class="sub kb-count">${fmt(trows.length)} run${trows.length === 1 ? "" : "s"} recorded today${hasAt ? ", in the order the server received them (your time)" : ", fastest first"}. The day's best is highlighted; click a line for its stage times.</p>
    <div class="tblwrap"><table><thead><tr>${hasAt ? '<th class="num">Recorded</th>' : ""}<th class="num">Clear</th><th>Who</th><th>Level and job</th><th class="num">Bonus</th><th class="num">EXP</th><th class="num">Mesos</th><th aria-label="Stages"></th></tr></thead><tbody>${ttrs}</tbody></table></div>
    <p class="sub">The filters above don't apply here. "~" = timed with the PC clock, "⌨" = timed on the site's <a href="#" data-go="kpqt">KPQ timer</a>.</p>`
    : `<p class="sub">No rounds recorded yet today${latest ? `. The latest on file is ${esc(latest)}` : ""}.</p>`}</div>`;
  return `<div class="card kb-card">${filt}<p class="sub kb-count">${fmt(shown)} round${shown === 1 ? "" : "s"} from ${fmt(b.length)} ${b.length === 1 ? "party or player" : "parties and players"}${shown < list.length ? ` (of ${fmt(list.length)})` : ""}. Click a line for its stage times.</p>${body}
    <p class="sub">${rush ? "" : "EXP and mesos are the best a party member's tracker saw that round. "}Level and job are the sender's. "~" = timed with the PC clock, "⌨" = timed on the site's <a href="#" data-go="kpqt">KPQ timer</a>.</p></div>${scoreCard(k, mine, crank, rank)}${todayCard}${fastHtml}`;
}
function splits(e){
  const tot = e.s.slice(0, 5).reduce((a, x) => a + (x || 0), 0) || 1;
  return `<div class="kb-split">${STG.map((n, s) => e.s[s] == null ? "" : `<span style="flex:${s < 5 ? Math.max(.06, e.s[s] / tot) : .16}"${s === 5 ? ' class="bon"' : ""}><b>${n}</b>${mss(e.s[s])}</span>`).join("")}</div>`;
}
function wire(root, redraw){
  root.addEventListener("change", e => { const s = e.target.closest("select[data-f]"); if (s){ F[s.dataset.f] = s.value; keep(); redraw() } });
  root.addEventListener("click", e => {
    const sb = e.target.closest("[data-sb]"); if (sb){ sbSel = sb.dataset.sb; try { localStorage.setItem("trkks", JSON.stringify({b: sbSel})) } catch(e) {} redraw(); return }
    if (e.target.closest("[data-kreset]")){ Object.assign(F, DEF); keep(); redraw(); return }
    if (e.target.closest("a")) return;
    const r = e.target.closest("tr.kb-row, tr.kb-trow"); if (r){ if (r.dataset.ti != null){ open = null; today = today === +r.dataset.ti ? null : +r.dataset.ti }
      else { today = null; open = open === r.dataset.g ? null : r.dataset.g } redraw() }
  });
  root.addEventListener("keydown", e => { const r = e.target.closest?.("tr.kb-row, tr.kb-trow"); if (r && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); r.click() } });
}
return {render, wire, keep, F};
})();
KPQB.wire($("#trkkpqdata"), trkRender);
