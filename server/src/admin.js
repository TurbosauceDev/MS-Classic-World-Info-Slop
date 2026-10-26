// The owner panel: a single static page served at GET /admin. The data routes
// (/api/kpq/recent, /api/feedback, /api/feedback/done) stay key-protected; the
// page asks for the key once and keeps it in the browser (localStorage fbkey,
// the same spot the site's Feedback admin uses). Design tokens mirror the
// site's src/styles.css (docs/ai/design.md), light and dark.
export const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Tracker admin — MS Classic World Info</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{
  --bg:#e7ddf9; --panel:#f7f1ff; --ink:#2a2142; --muted:#685c94; --line:#cfbff0;
  --accent:#7d58d6; --accent-soft:#dccbfa; --leaf:#3d7a5c; --leaf-soft:#e1efe7;
  --warn:#9a6a00; --warn-soft:#fbefcf; --bad:#a3322b; --bad-soft:#f7e2e0;
  --f-display:"Bricolage Grotesque","Segoe UI",system-ui,sans-serif;
  --f-body:"IBM Plex Sans","Segoe UI",system-ui,sans-serif;
  --f-mono:"IBM Plex Mono",ui-monospace,Consolas,monospace;
}
@media (prefers-color-scheme: dark){ :root{
  --bg:#1f1931; --panel:#2a2243; --ink:#f0eafd; --muted:#b6aad8; --line:#453a64;
  --accent:#d2bffb; --accent-soft:#41346a; --leaf:#7cc9a2; --leaf-soft:#1d3029;
  --warn:#e2b44a; --warn-soft:#352b14; --bad:#ef7a70; --bad-soft:#3a2320;
  color-scheme:dark }}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 var(--f-body)}
.wrap{max-width:1080px;margin:0 auto;padding:28px 16px 60px}
header{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:baseline;justify-content:space-between}
header h1{font:800 clamp(26px,4vw,38px)/1.05 var(--f-display);margin:0;letter-spacing:-.01em}
header .sub{color:var(--muted);font-size:14.5px}
.hstat{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.pill{display:inline-block;font:600 12px var(--f-body);padding:2px 8px;border-radius:999px;white-space:nowrap}
.p-good{background:var(--leaf-soft);color:var(--leaf)}
.p-warn{background:var(--warn-soft);color:var(--warn)}
.p-hot{background:var(--accent-soft);color:var(--accent)}
.p-bad{background:var(--bad-soft);color:var(--bad)}
.p-mut{background:var(--bg);color:var(--muted)}
button{font:600 15px var(--f-body);color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px 14px;cursor:pointer;transition:border-color .15s,background .15s,color .15s}
button:hover{border-color:var(--accent)}
button:active{transform:translateY(1px)}
button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button.mini{font-size:13px;padding:4px 10px;border-radius:6px}
button.danger:hover{border-color:var(--bad);color:var(--bad)}
button:disabled{opacity:.5;cursor:default}
input[type=password]{font:500 16px var(--f-body);color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:9px 11px;width:min(360px,100%)}
label.chk{display:flex;gap:8px;align-items:center;font:500 15px var(--f-body);cursor:pointer}
.seg{display:flex;flex-wrap:wrap;gap:6px;margin:20px 0 14px}
.seg button{border-radius:999px;padding:8px 16px;background:var(--panel)}
.seg button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--bg)}
.controls{display:flex;flex-wrap:wrap;gap:12px 18px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin-bottom:14px}
.controls .spacer{flex:1}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:12px;margin-bottom:14px}
.fact{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.fact h3{margin:0 0 2px;font:600 12px var(--f-body);text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.fact p{margin:0;font:500 19px/1.3 var(--f-body)}
.fact p .num,.num{font-family:var(--f-mono);font-variant-numeric:tabular-nums}
.fact .sub{font:400 13px var(--f-body);color:var(--muted)}
.tblwrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--panel)}
table{border-collapse:collapse;width:100%;font-size:15px}
th,td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
th{font:600 12px var(--f-body);text-transform:uppercase;letter-spacing:.06em;color:var(--muted);background:var(--bg);position:sticky;top:0;white-space:nowrap}
tr:last-child td{border-bottom:0}
tbody tr.data:hover td{background:color-mix(in srgb,var(--accent) 7%,transparent)}
tr.data{cursor:pointer}
tr.data.kept td{background:color-mix(in srgb,var(--warn) 7%,transparent)}
tr.subrow td{background:var(--bg);font:400 13.5px/1.6 var(--f-body);color:var(--muted);padding:10px 12px 12px 30px}
tr.subrow .stg{font-family:var(--f-mono);white-space:nowrap;margin-right:14px}
tr.subrow .stg b{color:var(--ink);font-weight:500}
.sub{color:var(--muted);font-size:13.5px}
.mono{font-family:var(--f-mono);font-size:14px}
.msg{white-space:pre-wrap;max-width:52ch;word-break:break-word}
.empty{padding:18px;color:var(--muted)}
.err{padding:14px 18px;color:var(--bad)}
.gate{max-width:460px;margin:12vh auto 0;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:22px}
.gate h2{margin:0 0 6px;font:800 22px var(--f-display)}
.gate p{color:var(--muted);font-size:14.5px;margin:0 0 14px}
.gate .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px}
.gate .why{color:var(--bad);font-size:14px;min-height:1.4em;margin:8px 0 0}
h2.sect{font:800 20px/1.25 var(--f-display);margin:26px 0 8px}
.note{color:var(--muted);font-size:14.5px;max-width:78ch;margin:10px 0 14px}
[hidden]{display:none!important}
@media (max-width:600px){ th,td{padding:8px 9px} tr.subrow td{padding-left:12px} }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <h1>Tracker admin</h1>
      <div class="sub">MS Classic World Info — owner tools on the shared-data server</div>
    </div>
    <div class="hstat">
      <span class="pill p-mut" id="hstate">locked</span>
      <button class="mini" id="refresh" hidden>Refresh</button>
      <label class="chk" id="autowrap" hidden><input type="checkbox" id="auto" checked>auto 30s</label>
      <button class="mini danger" id="forget" hidden>Forget key</button>
    </div>
  </header>

  <div class="gate" id="gate">
    <h2>Owner key</h2>
    <p>Same key as the site's Feedback inbox (the repo's FEEDBACK_KEY). It never leaves this browser except in the request header.</p>
    <input type="password" id="key" placeholder="paste the key" autocomplete="off">
    <div class="row">
      <label class="chk"><input type="checkbox" id="remember" checked>remember on this device</label>
      <button id="open">Open</button>
    </div>
    <p class="why" id="gatewhy"></p>
  </div>

  <div id="panel" hidden>
    <div class="seg" role="tablist">
      <button role="tab" id="t-kpq" aria-pressed="true">KPQ rounds</button>
      <button role="tab" id="t-fb" aria-pressed="false">Feedback</button>
      <button role="tab" id="t-sum" aria-pressed="false">Public summary</button>
    </div>

    <section id="s-kpq">
      <div class="facts" id="kfacts"></div>
      <div class="controls">
        <label class="chk"><input type="checkbox" id="today" checked>today only (Pacific)</label>
        <span class="spacer"></span>
        <span class="sub" id="kstamp"></span>
      </div>
      <div class="tblwrap" id="kwrap"><div class="empty">loading…</div></div>
      <p class="note">Everything the server received, newest first — rounds the leaderboard kept <b>and</b> rounds it stored but did not count (the reason sits in the Status column). "counted" = it is on the public boards; anything else explains itself. No install or IP data is shown, by the endpoint's own rule.</p>
    </section>

    <section id="s-fb" hidden>
      <div class="tblwrap" id="fwrap"><div class="empty">loading…</div></div>
      <p class="note">Notes from the site's Feedback page. "delete" asks once for confirmation. Marking done keeps the note for reference.</p>
    </section>

    <section id="s-sum" hidden>
      <div class="facts" id="sfacts"></div>
      <h2 class="sect">Rush board — top 5</h2>
      <div class="tblwrap" id="srush"><div class="empty">loading…</div></div>
      <h2 class="sect">Bonus board — top 5</h2>
      <div class="tblwrap" id="sbonus"><div class="empty">loading…</div></div>
      <p class="note">What the public site shows: the anonymous summary this server serves, which the daily build bakes into the pages. Compare it with the KPQ tab — a round can be on file here and still be missing there when it was not counted.</p>
    </section>
  </div>
</div>

<script>
"use strict";
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ls = { get(){ try { return localStorage.getItem("fbkey") || "" } catch { return "" } },
             set(v){ try { v ? localStorage.setItem("fbkey", v) : localStorage.removeItem("fbkey") } catch {} } };
let KEY = ls.get(), TAB = "kpq", timer = null, lastKpq = null;

const PT = new Intl.DateTimeFormat("en-CA", {timeZone: "America/Los_Angeles"});
const ptDay = iso => iso ? PT.format(new Date(iso)) : "";
const ptClock = iso => { const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit"}) };
const ago = iso => { const s = (Date.now() - Date.parse(iso)) / 1e3;
  if (s < 90) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " hr ago";
  return iso.slice(0, 10) };
const mmss = v => v == null ? "—" : Math.floor(v / 60) + ":" + String(Math.round(v) % 60).padStart(2, "0");
const nfmt = v => v == null ? "—" : Number(v).toLocaleString("en-US");
const STG = [["80000000","1st"],["80000100","2nd"],["80000200","3rd"],["80000300","4th"],["80000400","Last"],["80000500","Bonus"]];

async function api(path, opt = {}){
  const r = await fetch(path, {...opt, headers: {...opt.headers, authorization: "Bearer " + KEY}});
  if (r.status === 401){ lock("That key didn't open it."); throw new Error("401") }
  const body = await r.json().catch(() => ({}));
  if (r.status === 503) throw new Error(body.error || "server has no key set");
  if (!r.ok) throw new Error(body.error || r.status);
  return body;
}

function lock(msg){
  KEY = ""; ls.set(""); clearInterval(timer); timer = null;
  $("#panel").hidden = true; $("#gate").hidden = false;
  for (const id of ["refresh","autowrap","forget"]) $("#" + id).hidden = true;
  $("#hstate").textContent = "locked"; $("#hstate").className = "pill p-mut";
  $("#gatewhy").textContent = msg || "";
}

function unlock(){
  $("#gate").hidden = true; $("#panel").hidden = false;
  for (const id of ["refresh","autowrap","forget"]) $("#" + id).hidden = false;
  $("#hstate").textContent = "open"; $("#hstate").className = "pill p-good";
  show(TAB);
  clearInterval(timer);
  timer = setInterval(() => { if (document.visibilityState === "visible" && TAB !== "sum") show(TAB, true) }, 30000);
}

/* ---------- KPQ rounds ---------- */
function whyPill(r){
  return r.ok ? '<span class="pill p-good">counted</span>'
              : '<span class="pill p-warn">' + esc(r.why || "kept, not counted") + "</span>";
}
function stages(r){
  let s = {}; try { s = JSON.parse(r.stages || "{}") || {} } catch {}
  const got = STG.filter(([id]) => s[id] != null);
  if (!got.length) return '<span class="pill p-mut">no stage times</span>';
  return got.map(([id, label]) => '<span class="stg">' + label + " <b>" + mmss(s[id]) + "</b></span>").join("");
}
function kpqTable(rounds){
  if (!rounds.length) return '<div class="empty">no rounds on file yet</div>';
  const today = PT.format(new Date());
  const shown = $("#today").checked ? rounds.filter(r => ptDay(r.received) === today) : rounds;
  if (!shown.length) return '<div class="empty">Nothing received today (Pacific). The tracker has not POSTed a round since midnight PT — sharing was off, the timer was not sent, or nobody ran one yet. Untick "today only" to see the last rounds on file.</div>';
  let rows = "";
  for (const r of shown){
    const id = "k" + r.id;
    rows += '<tr class="data ' + (r.ok ? "" : "kept") + '" data-x="' + id + '" title="click for stage times">' +
      '<td class="num" title="' + esc(r.received) + '">' + ago(r.received) + '<div class="sub">' + ptClock(r.received) + " PT</div></td>" +
      "<td>" + (r.name ? "<b>" + esc(r.name) + "</b>" : '<span class="sub">—</span>') + "</td>" +
      '<td class="num">' + r.party + "</td>" +
      "<td>" + (r.level ? r.level + " " : "") + esc(r.job || "") + "</td>" +
      '<td class="num">' + mmss(r.clear) + "</td>" +
      '<td class="num">' + (r.total != null && r.total !== r.clear ? mmss(r.total) : "—") + "</td>" +
      '<td class="num">' + nfmt(r.exp) + "</td>" +
      '<td class="num">' + nfmt(r.mesos) + "</td>" +
      "<td>" + (r.src === "site" ? '<span class="pill p-hot">site timer</span>' : '<span class="pill p-mut">tracker</span>') + "</td>" +
      "<td>" + whyPill(r) + (r.src !== "site" && !r.clock ? '<div class="sub">no stopwatch read</div>' : "") + "</td></tr>";
    rows += '<tr class="subrow" id="' + id + '" hidden><td colspan="10">' + stages(r) +
      '<div class="sub">round date ' + esc(r.date || "?") + (r.hour != null ? ", started ~" + String(r.hour).padStart(2,"0") + ":00 UTC" : "") +
      (r.mode === "Rush" ? " · Rush" : " · Bonus") + " · round #" + r.id + "</div></td></tr>";
  }
  return "<table><thead><tr><th>When</th><th>Name</th><th>Pty</th><th>Lv / Job</th><th>Clear</th><th>Total</th><th>EXP</th><th>Mesos</th><th>Src</th><th>Status</th></tr></thead><tbody>" + rows + "</tbody></table>";
}
function kpqFacts(rounds){
  const today = PT.format(new Date());
  const t = rounds.filter(r => ptDay(r.received) === today);
  const ok = t.filter(r => r.ok);
  const fast = ok.length ? ok.reduce((a, r) => r.clear < a.clear ? r : a) : null;
  const kept = t.length - ok.length;
  const card = (h, v, s) => '<div class="fact"><h3>' + h + '</h3><p><span class="num">' + v + "</span></p>" + (s ? '<div class="sub">' + s + "</div>" : "") + "</div>";
  $("#kfacts").innerHTML =
    card("Today (Pacific)", t.length ? ok.length + " counted · " + kept + " kept" : "0 rounds",
      t.length ? (fast ? "fastest " + mmss(fast.clear) + (fast.name ? " — " + esc(fast.name) : "") : "nothing counted") : "nothing received since PT midnight") +
    card("Last round", rounds.length ? ago(rounds[0].received) : "—", rounds.length ? ptClock(rounds[0].received) + " PT" : "") +
    card("On file", nfmt(kpqTotal), "newest " + rounds.length + " listed");
}
let kpqTotal = "…";
async function loadKpq(quiet){
  if (!quiet) $("#kwrap").innerHTML = '<div class="empty">loading…</div>';
  try {
    const body = await api("/api/kpq/recent?limit=200");
    kpqTotal = body.total; lastKpq = body.rounds || [];
    $("#kwrap").innerHTML = kpqTable(lastKpq);
    kpqFacts(lastKpq);
    $("#kstamp").textContent = "checked " + new Date().toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit", second: "2-digit"});
  } catch (e){
    if (e.message !== "401") $("#kwrap").innerHTML = '<div class="err">' + esc("couldn't reach the server: " + e.message) + "</div>";
  }
}

/* ---------- Feedback ---------- */
function fbTable(notes){
  if (!notes.length) return '<div class="empty">inbox empty</div>';
  let rows = "";
  for (const n of notes){
    const kind = {Idea: "p-hot", Bug: "p-bad", "Wrong number": "p-warn"}[n.kind] || "p-mut";
    rows += "<tr" + (n.done ? ' style="opacity:.55"' : "") + ">" +
      '<td class="num" title="' + esc(n.received) + '">' + ago(n.received) + "</td>" +
      '<td><span class="pill ' + kind + '">' + esc(n.kind) + "</span></td>" +
      "<td>" + (n.page ? '<span class="mono">' + esc(n.page) + "</span>" : '<span class="sub">—</span>') +
        (n.ver ? '<div class="sub">v' + esc(n.ver) + "</div>" : "") + "</td>" +
      '<td class="msg">' + esc(n.msg) + "</td>" +
      "<td>" + (n.contact ? esc(n.contact) : '<span class="sub">—</span>') + "</td>" +
      "<td>" + (n.done ? '<span class="pill p-good">done</span>' : '<span class="pill p-warn">open</span>') + "</td>" +
      '<td style="white-space:nowrap"><button class="mini" data-done="' + n.id + '" data-v="' + (n.done ? 0 : 1) + '">' + (n.done ? "undo" : "done") + "</button> " +
      '<button class="mini danger" data-del="' + n.id + '">delete</button></td></tr>';
  }
  return "<table><thead><tr><th>When</th><th>Kind</th><th>Page</th><th>Message</th><th>Contact</th><th>State</th><th></th></tr></thead><tbody>" + rows + "</tbody></table>";
}
async function loadFb(quiet){
  if (!quiet) $("#fwrap").innerHTML = '<div class="empty">loading…</div>';
  try { $("#fwrap").innerHTML = fbTable((await api("/api/feedback")).notes) }
  catch (e){ if (e.message !== "401") $("#fwrap").innerHTML = '<div class="err">' + esc("couldn't reach the server: " + e.message) + "</div>" }
}

/* ---------- Public summary ---------- */
const board = (list, mode) => !list || !list.length ? '<div class="empty">no entries yet</div>' :
  "<table><thead><tr><th>#</th><th>Group</th><th>Names</th><th>Best</th><th>Typical</th><th>Rounds</th></tr></thead><tbody>" +
  list.slice(0, 5).map((e, i) => "<tr><td>" + (i + 1) + "</td><td><span class='mono'>" + esc(e.group) + "</span></td><td>" + esc((e.names || []).join(", ") || "—") +
    "</td><td class='num'>" + (mode === "Rush" ? mmss(e.best) : nfmt(e.best)) + "</td><td class='num'>" + mmss(e.median) +
    "</td><td class='num'>" + e.rounds + "</td></tr>").join("") + "</tbody></table>";
async function loadSum(){
  $("#sfacts").innerHTML = ""; $("#srush").innerHTML = '<div class="empty">loading…</div>'; $("#sbonus").innerHTML = "";
  try {
    const s = await (await fetch("/api/summary")).json();
    const card = (h, v) => '<div class="fact"><h3>' + h + '</h3><p><span class="num">' + v + "</span></p></div>";
    $("#sfacts").innerHTML = card("Updated", ago(s.updated)) + card("Runs", nfmt(s.runs)) + card("Players", nfmt(s.players)) +
      card("Hours farmed", nfmt(s.hours)) + card("KPQ rounds counted", nfmt(s.kpq && s.kpq.rounds)) + card("KPQ groups", nfmt(s.kpq && s.kpq.groups));
    $("#srush").innerHTML = board(s.kpq && s.kpq.board && s.kpq.board.Rush, "Rush");
    $("#sbonus").innerHTML = board(s.kpq && s.kpq.board && s.kpq.board.Bonus, "Bonus");
  } catch { $("#srush").innerHTML = '<div class="err">could not reach the server</div>' }
}

/* ---------- tabs + events ---------- */
function show(tab, quiet){
  TAB = tab;
  for (const [t, s] of [["kpq","s-kpq"],["fb","s-fb"],["sum","s-sum"]]){
    $("#t-" + t).setAttribute("aria-pressed", String(t === tab));
    $("#" + s).hidden = t !== tab;
  }
  if (tab === "kpq") loadKpq(quiet);
  if (tab === "fb") loadFb(quiet);
  if (tab === "sum") loadSum();
}
for (const [id, tab] of [["t-kpq","kpq"],["t-fb","fb"],["t-sum","sum"]]) $("#" + id).onclick = () => show(tab);

$("#open").onclick = tryKey;
$("#key").addEventListener("keydown", e => { if (e.key === "Enter") tryKey() });
async function tryKey(){
  const k = $("#key").value.trim();
  $("#gatewhy").textContent = "";
  if (!k){ $("#gatewhy").textContent = "Paste the key first."; return }
  KEY = k;
  try { await api("/api/kpq/recent?limit=10") }
  catch (e){ if (e.message === "401") return; if ($("#gatewhy")) $("#gatewhy").textContent = e.message; return }
  if ($("#remember").checked) ls.set(KEY);
  $("#key").value = "";
  unlock();
}
$("#forget").onclick = () => lock("Key forgotten on this device.");
$("#refresh").onclick = () => show(TAB);
$("#today").onchange = () => { if (lastKpq){ $("#kwrap").innerHTML = kpqTable(lastKpq); kpqFacts(lastKpq) } };

$("#panel").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (b && b.dataset.del != null){
    if (b.dataset.arm){ api("/api/feedback/done", {method: "POST", body: JSON.stringify({id: +b.dataset.del, delete: true})}).then(loadFb).catch(() => {}) }
    else { b.dataset.arm = "1"; b.textContent = "sure?"; setTimeout(() => { b.dataset.arm = ""; b.textContent = "delete" }, 2500) }
    return;
  }
  if (b && b.dataset.done != null){
    api("/api/feedback/done", {method: "POST", body: JSON.stringify({id: +b.dataset.done, done: b.dataset.v === "1"})}).then(loadFb).catch(() => {});
    return;
  }
  const tr = e.target.closest("tr.data");
  if (tr){ const sub = $("#" + tr.dataset.x); if (sub) sub.hidden = !sub.hidden }
});

// a key remembered from last visit: validate it quietly, otherwise sit on the gate
if (KEY) api("/api/kpq/recent?limit=10").then(unlock).catch(() => {});
</script>
</body>
</html>`;
