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
try { Object.assign(S, savedState("skills", S), {q: "", open: null}) } catch(e) {}
const save = () => { try { localStorage.setItem("skills", JSON.stringify(S)) } catch(e) {} };
const FIELDS = [["cls", "#skcls"], ["job", "#skjob"], ["tier", "#sktier"], ["type", "#sktype"]];
const sync = () => { $("#sksearch").value = S.q; for (const [k, el] of FIELDS) $(el).value = S[k] };
sync();

const icon = (o, big) => D.icons[o.s.id] ? `<img${big ? ' class="sprite"' : ""} src="data:image/png;base64,${D.icons[o.s.id]}" alt="">` : "<i></i>";
const link = o => `<button class="linkbtn" data-skopen="${esc(o.key)}">${esc(o.s.n)}</button>`;
const pill = o => `<span class="pill ${TYPEPILL[o.type] || "p-hot"}">${o.type}</span>`;
const tierTxt = o => o.tier === 1 ? "1st job" : o.tier === 2 ? "2nd job (Lv 30+)" : "";

// ---- range and hitbox (D.skills[..].rv + D.hitact, both from the OSMS export; see scripts/skill_range.py) ----
// Game pixels, facing right: x > 0 in front of you, y < 0 above your feet. skRange() is pure (tests/golden.js checks it).
const atLv = (v, lv) => Array.isArray(v) ? v[Math.min(v.length, Math.max(1, lv)) - 1] : v;
const FAM = {fixed_rectangle: "Stored attack rectangle", effect_rectangle: "Stored party-effect rectangle", ranged_corridor: "Widening ranged corridor",
  action_hitbox: "Weapon swing area", action_extended: "Weapon swing area + forward extension", piercing_line: "Piercing arrow path", teleport_range: "Teleport distance"};
const skWeapons = (job, id) => { const H = D.hitact; if (!H) return [];
  const keys = H.sk[String(id)] || H.cls[job] || [], only = H.anim[String(id)];
  return H.weap.filter(w => keys.includes(w[0])).map(([key, label, set, pre]) => ({key, label,
    acts: (H.sets[set] || []).filter(a => (!pre || a[0].startsWith(pre)) && (!only || only.includes(a[0])))})).filter(w => w.acts.length) };
function skRange(job, s, lv, plv, wk, ak){
  const v = s.rv; if (!v) return null;
  lv = Math.min(s.max, Math.max(1, lv || s.max));
  const out = {fam: v.f, label: FAM[v.f] || "Target area", boxes: [], ext: null, poly: null, path: null, tp: null, aim: null, mob: null, facts: []};
  const box = (l, r, t, b) => ({l, r, t, b});
  if (v.L){ const g = [...v.L].reverse().find(x => x[0] <= lv) || v.L[0]; out.from = g[0]; out.boxes = g[1].map(b => box(...b)) }
  let far = null;
  if (v.b){ far = atLv(v.b[0], lv) + (v.p && plv > 0 ? atLv(v.p[2], plv) : 0); out.far = far }
  if (v.f === "ranged_corridor" && v.g){
    const [near, refY, bh, div] = v.g, nh = bh + Math.trunc(near / div), fh = bh + Math.trunc(far / div);
    out.poly = [[near, -nh], [far, -fh], [far, fh], [near, nh]]; out.aim = [near, refY, far]; out.mob = Math.round(far * .73);
    out.facts.push(["Reach", `${far} px in front`], ["Starts", `${near} px ahead`], ["Height at the far end", `${fh} px above and below your feet`]);
  } else if (v.f === "piercing_line"){
    out.boxes = [box(65, far, -72, 0)]; out.path = [23, -30, far];
    out.facts.push(["Path", `${far} px in front`]);
  } else if (v.f === "action_hitbox" || v.f === "action_extended"){
    const W = skWeapons(job, s.id), w = W.find(x => x.key === wk) || W[0];
    if (w){ const a = w.acts.find(x => x[0] === ak) || w.acts[0]; out.weapons = W; out.wk = w.key; out.ak = a[0];
      out.boxes = [box(a[1], a[2], a[3], a[4])];
      out.facts.push(["Swing box", `${a[1]} to ${a[2]} px in front`], ["Height", vert(a[3], a[4])]);
      if (v.f === "action_extended"){ const lim = Math.max(a[2], atLv(v.r, lv) || 0); out.ext = box(a[2], lim, a[3], a[4]);
        out.facts.push(["Forward limit", `${lim} px (${lim - a[2]} px past the swing)`]) }
      out.mob = (out.ext ? out.ext.r : a[2]) + 10 }
  } else if (v.f === "teleport_range"){ out.tp = atLv(v.d, lv); out.facts.push(["Distance", `up to ${out.tp} px`]) }
  if (out.boxes.length && !out.facts.length){ const b = out.boxes[0];
    out.facts.push(["In front", `${Math.max(0, b.r)} px`], ...(b.l ? [[b.l < 0 ? "Behind" : "Starts", `${Math.abs(b.l)} px${b.l < 0 ? "" : " in front"}`]] : []),
      ["Height", vert(b.t, b.b)]);
    if (out.mob == null) out.mob = b.l < 0 && b.r > 0 ? Math.max(60, b.r * .62) : (b.l + b.r) / 2 }
  if (v.f === "fixed_rectangle" && v.r != null) out.facts.push(["Stored range value", `${atLv(v.r, lv)} px (not the hit box)`]);
  if (v.t) out.facts.push(["Walls", "Needs a clear line to the target"]);
  out.lv = lv; out.plv = plv; return out;
}
// "56 px (6 to 62 px above your feet)" / "140 px (70 above to 70 below your feet)"
function vert(top, bot){ const h = bot - top;
  return bot <= 0 ? `${h} px (${-bot} to ${-top} px above your feet)` : top >= 0 ? `${h} px (${top} to ${bot} px below your feet)` : `${h} px (${-top} above to ${bot} below your feet)` }
const ACTNAME = a => { const m = /^(swing|stab)([OTP])(\d|F)$/.exec(a); return m ? `${{O: "1H", T: "2H", P: "Polearm"}[m[2]]} ${m[1]} ${m[3]}` : a };
const SKR = {lv: 0, plv: 0, wk: "", ak: "", key: ""};
const pngSize = b64 => { try { const s = atob(b64.slice(0, 32)); return [s.charCodeAt(18) * 256 + s.charCodeAt(19), s.charCodeAt(22) * 256 + s.charCodeAt(23)] } catch(e) { return [37, 26] } };
function rangeSvg(r){
  const xs = [-45, 90], ys = [-90, 30], P = [];
  for (const b of [...r.boxes, r.ext].filter(Boolean)){ xs.push(b.l, b.r); ys.push(b.t, b.b) }
  if (r.poly) for (const [x, y] of r.poly){ xs.push(x); ys.push(y) }
  if (r.tp) xs.push(r.tp + 20);
  if (r.mob != null) xs.push(r.mob + 34);
  const x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 40, y0 = Math.min(...ys) - 26, y1 = Math.max(...ys) + 22, w = x1 - x0, h = y1 - y0;
  const fs = Math.max(10, Math.round(w / 48)), T = (x, y, t, c = "") => `<text x="${x}" y="${y}" class="skr-t ${c}" font-size="${fs}">${t}</text>`;
  P.push(`<defs><pattern id="skrgrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" class="skr-grid"/></pattern></defs>`,
    `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="url(#skrgrid)"/>`, `<line x1="${x0}" y1="0" x2="${x1}" y2="0" class="skr-ground"/>`);
  const mob = D.mobimg?.["6"];   // Stump, as a size reference
  const mobAt = x => { const [mw, mh] = mob ? pngSize(mob) : [46, 46];
    return (mob ? `<image href="data:image/png;base64,${mob}" x="${x - mw / 2}" y="${-mh}" width="${mw}" height="${mh}" class="skr-spr"/>` : "") + `<rect x="${x - mw / 2}" y="${-mh}" width="${mw}" height="${mh}" class="skr-mob"/>` };
  if (r.path) for (const f of [.3, .6, .86]) P.push(mobAt(Math.round(65 + (r.far - 65) * f)));
  else if (r.mob != null && r.fam !== "effect_rectangle") P.push(mobAt(r.mob));
  if (r.poly) P.push(`<polygon points="${r.poly.map(p => p.join(",")).join(" ")}" class="skr-hit"/>`);
  for (const b of r.boxes) P.push(`<rect x="${b.l}" y="${b.t}" width="${Math.max(1, b.r - b.l)}" height="${Math.max(1, b.b - b.t)}" class="skr-hit"/>`);
  if (r.ext && r.ext.r > r.ext.l) P.push(`<rect x="${r.ext.l}" y="${r.ext.t}" width="${r.ext.r - r.ext.l}" height="${r.ext.b - r.ext.t}" class="skr-hit skr-ext"/>`);
  if (r.aim) P.push(`<line x1="${r.aim[0]}" y1="${r.aim[1]}" x2="${r.aim[2]}" y2="${r.aim[1]}" class="skr-aim"/>`);
  if (r.path) P.push(`<line x1="${r.path[0]}" y1="${r.path[1]}" x2="${r.path[2]}" y2="${r.path[1]}" class="skr-aim"/>`);
  if (r.tp) P.push(`<rect x="${r.tp - 20}" y="-66" width="39" height="66" rx="6" class="skr-you skr-ghost"/><line x1="24" y1="-80" x2="${r.tp - 4}" y2="-80" class="skr-aim"/>`);
  P.push(`<rect x="-20" y="-66" width="39" height="66" rx="6" class="skr-you"/>`, T(0, -72, "you", "skr-mid"), `<circle cx="0" cy="0" r="3" class="skr-origin"/>`);
  const right = r.ext?.r ?? r.poly?.[1][0] ?? r.boxes[0]?.r ?? r.tp;
  if (right != null) P.push(`<line x1="${right}" y1="${y1 - 14}" x2="${right}" y2="${y0 + 4}" class="skr-dim"/>`, T(right, y1 - 4, right + " px", "skr-mid"));
  return `<svg class="skr-svg" viewBox="${x0} ${y0} ${w} ${h}" role="img" aria-label="${esc(r.label)}: measured from your feet, facing right">${P.join("")}</svg>`;
}
function rangeHtml(o){
  const s = o.s; if (!s.rv) return "";
  if (SKR.key !== o.key) Object.assign(SKR, {key: o.key, lv: s.max, plv: s.rv.p ? s.rv.p[2].length : 0, wk: "", ak: ""});
  const r = skRange(o.job, s, SKR.lv, SKR.plv, SKR.wk, SKR.ak); if (!r) return "";
  const pas = s.rv.p, seg = (attr, list, cur) => `<div class="seg small" role="radiogroup">${list.map(([k, t]) => `<button role="radio" data-${attr}="${esc(k)}" aria-checked="${k === cur}">${esc(t)}</button>`).join("")}</div>`;
  const W = r.weapons || [], acts = W.find(w => w.key === r.wk)?.acts || [];
  const src = s.rv.f.startsWith("action") ? "OSMS export: the client's weapon swing boxes (Character Afterimage) for the weapon and swing picked above"
    : s.rv.L ? "OSMS export: the box stored with the skill" : s.rv.b?.[1] === "client_default" ? `OSMS export: the client's ${s.rv.b[0]} px default for this kind of attack`
    : s.rv.b?.[1] === "weapon" ? "OSMS export: the weapon's base range" : "OSMS export: the skill's stored values";
  return `<h3 class="msec">Range and hitbox</h3><div class="card skr" id="skr">
    <div class="skr-ctl">${s.max > 1 ? `<label>Skill level <b>${r.lv}</b><input type="range" data-skrlv min="1" max="${s.max}" value="${r.lv}"></label>` : ""}
      ${pas ? `<label>${esc(pas[1])} <b>${r.plv || "not learned"}</b><input type="range" data-skrplv min="0" max="${pas[2].length}" value="${r.plv}"></label>` : ""}</div>
    ${W.length > 1 ? seg("skrw", W.map(w => [w.key, w.label]), r.wk) : ""}${acts.length > 1 ? seg("skra", acts.map(a => [a[0], ACTNAME(a[0])]), r.ak) : ""}
    ${rangeSvg(r)}
    <dl class="stats mgrid"><div><dt>Shape</dt><dd>${esc(r.label)}</dd></div>${r.facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
    <p class="sub">Game pixels from your feet, facing right; the Stump shows monster size. Source: ${src}${r.from ? `, level ${r.from}+ box` : ""}.</p></div>`;
}

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
    ${rangeHtml(o)}
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
  const w = e.target.closest("[data-skrw],[data-skra]");
  if (w){ if (w.dataset.skrw) Object.assign(SKR, {wk: w.dataset.skrw, ak: ""}); else SKR.ak = w.dataset.skra; redrawRange() }
});
function redrawRange(){ const o = S.open && OPEN[S.open], el = $("#skr"); if (!o || !el) return;
  const f = document.activeElement?.matches?.("[data-skrlv],[data-skrplv]") ? (document.activeElement.hasAttribute("data-skrlv") ? "[data-skrlv]" : "[data-skrplv]") : null;
  const tmp = document.createElement("div"); tmp.innerHTML = rangeHtml(o); el.replaceWith(tmp.querySelector("#skr")); if (f) $("#skr " + f)?.focus() }
$("#skpage").addEventListener("input", e => { if (e.target.matches("[data-skrlv]")) SKR.lv = +e.target.value; else if (e.target.matches("[data-skrplv]")) SKR.plv = +e.target.value; else return; redrawRange() });
window.skRange = skRange;
openSkillPage = key => { if (!OPEN[key]) return; $("#t-skills").click(); openSkill(key) };
if (HASH.s && OPEN[HASH.s]) S.open = String(HASH.s);
show();
navReg("skills", () => S.open, v => { S.open = v; save(); show() });
})();
