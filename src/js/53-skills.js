/* ---------------- skill database ---------------- */
let openSkillPage;   // (key "job|id"): open that skill's page (used by Search everything)
(() => {
// every 1st and 2nd job skill in the launch game files (D.skills: job -> skills, D.icons: id -> png). Clicking a skill opens
// its page: description, every level's effect, what it needs and what it unlocks.
const CLASS = {Warrior: ["Warrior", 1], Fighter: ["Warrior", 2], Page: ["Warrior", 2], Spearman: ["Warrior", 2],
  Magician: ["Magician", 1], "F/P Wizard": ["Magician", 2], "I/L Wizard": ["Magician", 2], Cleric: ["Magician", 2],
  Archer: ["Bowman", 1], Hunter: ["Bowman", 2], Crossbowman: ["Bowman", 2], Rogue: ["Thief", 1], Assassin: ["Thief", 2], Bandit: ["Thief", 2]};
// our label from the game files' skill kind; Slow/Threaten are "attack" there but deal no damage
const typeOf = s => { const top = s.st[s.st.length - 1] || "";
  if (s.k === "passive" || (!s.k && !/MP -/.test(top))) return "Passive";
  if (!s.k || s.k === "self_buff") return "Buff";
  if (s.k === "party_support") return "Party buff";
  if (s.k === "mobility") return "Movement";
  return s.k === "attack" && !/damage|Basic Attack|Attack \d+x/i.test(top) ? "Debuff" : "Attack" };
const TYPEPILL = {Attack: "p-bad", Buff: "p-good", "Party buff": "p-good", Passive: "p-hot", Debuff: "p-warn", Movement: "p-warn"};
const K = [];
for (const [job, list] of Object.entries(D.skills)) for (const s of list){ const [cls, tier] = CLASS[job] || [job, 0];
  K.push({key: job + "|" + s.id, job, cls, tier, s, type: typeOf(s), hay: [s.n, job, cls, s.d, ...s.st].join("|").toLowerCase()}) }
const OPEN = {}; for (const o of K) OPEN[o.key] = o;
const NEEDED = {}; for (const o of K) for (const [n] of o.s.req){ const r = K.find(x => x.job === o.job && x.s.n === n) || K.find(x => x.cls === o.cls && x.tier === 1 && x.s.n === n);
  if (r) (NEEDED[r.key] = NEEDED[r.key] || []).push(o) }
const reqOf = o => o.s.req.map(([n, lv]) => [K.find(x => x.job === o.job && x.s.n === n) || K.find(x => x.cls === o.cls && x.tier === 1 && x.s.n === n), n, lv]);
$("#skjob").innerHTML += Object.keys(D.skills).map(j => `<option>${esc(j)}</option>`).join("");
$("#sktype").innerHTML += [...new Set(K.map(o => o.type))].sort().map(t => `<option>${t}</option>`).join("");

const DEF = {q: "", cls: "", job: "", tier: "", type: "", sort: "job", dir: 1};
let S = {...DEF, open: null};
try { Object.assign(S, JSON.parse(localStorage.getItem("skills") || "{}"), {q: "", open: null}) } catch(e) {}
const save = () => { try { localStorage.setItem("skills", JSON.stringify(S)) } catch(e) {} };
const FIELDS = [["cls", "#skcls"], ["job", "#skjob"], ["tier", "#sktier"], ["type", "#sktype"]];
const sync = () => { $("#sksearch").value = S.q; for (const [k, el] of FIELDS) $(el).value = S[k] };
sync();

const icon = (o, big) => D.icons[o.s.id] ? `<img${big ? ' class="sprite"' : ""} src="data:image/png;base64,${D.icons[o.s.id]}" alt="">` : "<i></i>";
const link = o => `<button class="linkbtn" data-skopen="${esc(o.key)}">${esc(o.s.n)}</button>`;
const pill = o => `<span class="pill ${TYPEPILL[o.type] || "p-hot"}">${o.type}</span>`;
const tierTxt = o => o.tier === 1 ? "1st job" : o.tier === 2 ? "2nd job (Lv 30+)" : "";

function page(o){
  const s = o.s, st = (k, v) => v == null || v === "" ? "" : `<div><dt>${k}</dt><dd>${v}</dd></div>`;
  const req = reqOf(o).map(([r, n, lv]) => `<li>${r ? link(r) : esc(n)} <span class="sub">level ${lv}+</span></li>`).join("");
  const unl = (NEEDED[o.key] || []).map(x => `<li>${link(x)} <span class="sub">${esc(x.job)} · needs level ${x.s.req.find(r => r[0] === s.n)[1]}</span></li>`).join("");
  const same = K.filter(x => x !== o && x.s.n === s.n).map(x => `<li>${link(x)} <span class="sub">${esc(x.job)}</span></li>`).join("");
  const card = (h, body, empty) => `<div><h4>${h}</h4>${body ? `<ul class="mlist">${body}</ul>` : `<p class="sub">${empty}</p>`}</div>`;
  const desc = s.d.replace(/\n?Required Skills?:.*$/s, "").trim();
  return `<div class="mpage">
    <div class="mpbar"><button class="btn" id="skback">← All skills</button><button class="btn" id="skshare">Copy link</button></div>
    <div class="mtop">${icon(o, true)}<div><h2>${esc(s.n)}</h2>
      <p class="sub">${esc(o.job)} · ${esc(o.cls)} ${tierTxt(o)} · max level ${s.max} · skill ID ${esc(s.id)}</p><p class="mflags">${pill(o)}</p></div></div>
    ${desc ? `<p class="idesc">${esc(desc).replace(/\n/g, "<br>")}</p>` : ""}
    <dl class="stats mgrid">${st("Max level", s.max)}${o.type === "Attack" ? st("Monsters hit", s.mob) + st("Hits per use", s.att) : ""}${s.rg ? st("Reach", s.rg[0] + " px" + (s.rg[1] ? ` (+${s.rg[1]} behind)` : "")) : ""}</dl>
    <div class="mcols">
      ${card("Needs", req, "No other skill needed.")}
      ${card("Unlocks", unl, "No skill needs it.")}
      ${same ? card("Same skill in other jobs", same) : ""}
    </div>
    <h3 class="msec">Every level</h3>
    <div class="tblwrap"><table class="mini"><thead><tr><th class="num">Lv</th><th>Effect</th></tr></thead>
      <tbody>${s.st.map((t, i) => `<tr><td class="num">${i + 1}</td><td>${esc(t)}</td></tr>`).join("")}</tbody></table></div>
  </div>`;
}

const JOBORDER = Object.keys(D.skills);
const COLS = {name: o => o.s.n, job: o => JOBORDER.indexOf(o.job), type: o => o.type, max: o => o.s.max};
function render(){
  const q = S.q.trim().toLowerCase(), f = COLS[S.sort] || COLS.job;
  const rows = K.filter(o => (!S.cls || o.cls === S.cls) && (!S.job || o.job === S.job) && (!S.tier || o.tier === +S.tier) && (!S.type || o.type === S.type) && (!q || o.hay.includes(q)))
    .sort((a, b) => { const x = f(a), y = f(b); return (typeof x === "string" ? x.localeCompare(y) : x - y) * S.dir || JOBORDER.indexOf(a.job) - JOBORDER.indexOf(b.job) || a.s.id - b.s.id });
  document.querySelectorAll("#skhead th[data-k]").forEach(th => { const on = th.dataset.k === S.sort;
    th.setAttribute("aria-sort", on ? (S.dir > 0 ? "ascending" : "descending") : "none");
    th.querySelector("button").dataset.arrow = on ? (S.dir > 0 ? "▲" : "▼") : "" });
  $("#skcount").textContent = `${rows.length} skill${rows.length === 1 ? "" : "s"}`;
  $("#skrows").innerHTML = rows.map(o => `<tr data-key="${esc(o.key)}"><td><button class="mbtn skbtn">${icon(o)}<span><b>${esc(o.s.n)}</b></span></button></td>
      <td>${esc(o.job)} <span class="sub">${o.tier === 1 ? "1st" : "2nd"}</span></td><td>${pill(o)}</td><td class="num">${o.s.max}</td>
      <td class="sub">${o.s.req.map(([n, lv]) => `${esc(n)} ${lv}`).join(", ") || "–"}</td><td class="sub">${esc(o.s.st[o.s.st.length - 1] || "")}</td></tr>`).join("")
    || `<tr><td colspan="6" class="sub">No skill matches.</td></tr>`;
}
function show(){
  const o = S.open && OPEN[S.open];
  $("#sklist").hidden = !!o; $("#skpage").hidden = !o;
  if (!o){ render(); return }
  $("#skpage").innerHTML = page(o);
}
function openSkill(key){ S.open = key; save(); show(); $("#skills").scrollIntoView({block: "start"}) }
$("#sksearch").addEventListener("input", e => { S.q = e.target.value; render() });
for (const [k, el] of FIELDS) $(el).addEventListener("change", e => { S[k] = e.target.value; save(); render() });
$("#skreset").addEventListener("click", () => { Object.assign(S, DEF); save(); sync(); render() });
document.querySelectorAll("#skhead th[data-k] button").forEach(b => b.addEventListener("click", () => {
  const k = b.parentElement.dataset.k; S.dir = S.sort === k ? -S.dir : (k === "max" ? -1 : 1); S.sort = k; save(); render();
}));
$("#skrows").addEventListener("click", e => { const b = e.target.closest(".skbtn"); if (b) openSkill(b.closest("tr").dataset.key) });
$("#skpage").addEventListener("click", e => {
  if (e.target.id === "skback"){ S.open = null; save(); show(); return }
  if (e.target.id === "skshare") return copyShare(e.target, shareUrl("s", S.open));
  const l = e.target.closest("[data-skopen]"); if (l) openSkill(l.dataset.skopen);
});
openSkillPage = key => { if (!OPEN[key]) return; $("#t-skills").click(); openSkill(key) };
if (HASH.s && OPEN[HASH.s]) S.open = String(HASH.s);
show();
})();
