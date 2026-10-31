/* Character Builder: fill the build from in-game screenshots (Character Stat, Equipment Inventory, Skill Inventory windows,
   one at a time or all in one full-screen shot). Reading happens in the page (51-shot.js). Each screenshot is applied as
   soon as it's read (Danny 10-21: no "Apply" step; Undo / Redo in 50-builder.js take a wrong one back off), and shown as a
   thumbnail with a box on everything read. */
(() => {
const STATS = ["STR", "DEX", "INT", "LUK"], PINK = [203, 79, 130], GREEN = [184, 199, 77];
const SKJOB = {}; for (const [j, list] of Object.entries(D.skills)) for (const s of list) SKJOB[s.id] = {job: j, s};
const clsOfJob = j => Object.keys(BLD.BRANCHES).find(c => BLD.BRANCHES[c].some(b => b[0] === j));
const clsOfWeapon = w => Object.keys(BLD.BRANCHES).find(c => BLD.BRANCHES[c][0][2].includes(w.type));
const WBYID = Object.fromEntries(BLD.W.map(w => [w.id, w]));
const num = s => { const m = /\d+/.exec(s || ""); return m ? +m[0] : null };
let READS = [], R = null, SEQ = 0;   // READS: one result per screenshot; R: all of them merged

// one screenshot -> whatever it shows: {name, lvl, shown, skills, gear, weapon, what}
async function readShot(f){
  const r = {id: ++SEQ, name: f.name && f.name !== "image.png" ? f.name : "", lvl: null, shown: null, skills: {}, gear: {}, weapon: [], what: [], marks: []};
  const mark = (x, y, w, h, t, kind, icon) => r.marks.push({x, y, w, h, t, kind, icon});
  await ASSETS;   // Pages: equipment icons arrive in a second file (00-core.js)
  const skIcons = Object.keys(SKJOB).filter(id => D.icons[id]).map(id => [id, D.icons[id]]);
  const eqIcons = Object.keys(BLD.ARMOR).concat(Object.keys(WBYID)).filter(id => D.iicons[id]).map(id => [id, D.iicons[id]]);
  const img = shotNative(await shotLoad(f)), ink = img.fuzzy ? SHOT_INK_FUZZY : undefined, find = img.fuzzy ? shotFindIconsFuzzy : shotFindIcons;
  // stat window: pink labels NAME, JOB (two lines tall), LEVEL...; green labels STR, DEX, INT, LUK
  const pink = shotLabels(img, PINK), green = shotLabels(img, GREEN);
  const val = b => num(shotText(img, b.x1 + (img.fuzzy ? 3 : 2), b.y0 - 2, b.x1 + 130, b.y1 + 3, ink)[0]?.s);
  if (pink.length >= 3){
    const tall = pink.slice(0, 3).reduce((a, b, i, l) => b.y1 - b.y0 > l[a].y1 - l[a].y0 ? i : a, 0);
    // LEVEL sits 96 game px above STR (Danny's stat window); the label after the two-line JOB one when STR isn't in view.
    // Smoothed shots can lose NAME/JOB, so STR wins (Turbow at 1.5x read HP as the level, 10-31)
    const lb = (green.length && pink.find(b => Math.abs(green[0].y0 - 96 - b.y0) <= 3)) || pink[Math.min(tall + 1, pink.length - 1)], lv = val(lb);
    if (lv >= 1 && lv <= 200){ r.lvl = lv; mark(lb.x0, lb.y0, lb.x1 - lb.x0 + 78, lb.y1 - lb.y0 + 1, `Level ${lv}`, "stat") }
  }
  if (green.length >= 4){
    const v = green.slice(0, 4).map(val);
    if (v.every(x => x != null)){ r.shown = Object.fromEntries(STATS.map((k, i) => [k, v[i]]));
      green.slice(0, 4).forEach((b, i) => mark(b.x0, b.y0, b.x1 - b.x0 + 78, b.y1 - b.y0 + 1, `${STATS[i]} ${v[i]}`, "stat")) }
  }
  if (r.lvl || r.shown) r.what.push("Stats");
  // skill window: an icon with its level written below-right of it
  let ns = 0;
  for (const m of await find(img, skIcons)){
    // from 60% down: skips descenders of the name above ("The Eye of Amazon" read as "??" from half way)
    const line = shotText(img, m.x + m.w + 2, Math.round(m.y + m.h * 0.6), m.x + m.w + 80, m.y + m.h + 4, ink).find(l => /^\d+$/.test(l.s));
    const lv = line && +line.s, s = SKJOB[m.key].s;
    if (lv && lv <= s.max){ r.skills[m.key] = Math.max(r.skills[m.key] || 0, lv); ns++; mark(m.x, m.y, m.w + 40, m.h, `${s.n} ${lv}`, "skill", D.icons[m.key]) }
  }
  if (ns) r.what.push(`${ns} skill${ns > 1 ? "s" : ""}`);
  // equipment window
  let ne = 0;
  for (const m of await find(img, eqIcons)){
    const ids = [m.key, ...(m.alt || [])];
    if (WBYID[m.key]) r.weapon.push(...ids.filter(id => WBYID[id] && !r.weapon.includes(id)));
    else { const sl = BLD.ARMOR[m.key][2]; r.gear[sl] = (r.gear[sl] || []).concat(ids.filter(id => BLD.ARMOR[id]?.[2] === sl && !(r.gear[sl] || []).includes(id))) }
    ne++; const nm = id => WBYID[id]?.name || BLD.ARMOR[id]?.[1];
    mark(m.x, m.y, m.w, m.h, nm(m.key) + (m.alt?.length ? ` (or ${m.alt.map(nm).join(", ")})` : ""), "item", D.iicons[m.key]);
  }
  if (ne) r.what.push(`${ne} item${ne > 1 ? "s" : ""} worn`);
  r.k = img.k; r.fuzzy = !!img.fuzzy; r.thumb = crop(img, r.marks);
  return r;
}
// the part of the screenshot that had something read in it (a full-screen shot shrinks to its windows), as a PNG data URL;
// marks move into its coordinates
function crop(img, marks){
  const P = 8, x0 = marks.length ? Math.max(0, Math.min(...marks.map(m => m.x)) - P) : 0, y0 = marks.length ? Math.max(0, Math.min(...marks.map(m => m.y)) - P) : 0;
  const x1 = marks.length ? Math.min(img.w, Math.max(...marks.map(m => m.x + m.w)) + P) : img.w, y1 = marks.length ? Math.min(img.h, Math.max(...marks.map(m => m.y + m.h)) + P) : img.h;
  const w = x1 - x0, h = y1 - y0, c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), id = g.createImageData(w, h);
  for (let y = 0; y < h; y++) id.data.set(img.d.subarray(((y0 + y) * img.w + x0) * 4, ((y0 + y) * img.w + x1) * 4), y * w * 4);
  for (let i = 3; i < id.data.length; i += 4) id.data[i] = 255;
  g.putImageData(id, 0, 0);
  for (const m of marks){ m.x -= x0; m.y -= y0; m.w = Math.min(m.w, w - m.x); m.h = Math.min(m.h, h - m.y) }
  return {src: c.toDataURL("image/png"), w, h};
}
// every screenshot read so far -> one character, in any order (equipment before stats works too; so does one full-screen
// shot with every window open)
function merge(){
  if (!READS.length){ R = null; return }
  const m = {lvl: null, shown: null, skills: {}, gear: {}, weapon: []};
  for (const r of READS){
    if (r.lvl) m.lvl = r.lvl;
    if (r.shown) m.shown = {...r.shown};
    for (const [id, v] of Object.entries(r.skills)) m.skills[id] = Math.max(m.skills[id] || 0, v);
    for (const [sl, ids] of Object.entries(r.gear)) m.gear[sl] = [...new Set((m.gear[sl] || []).concat(ids))];
    for (const id of r.weapon) if (!m.weapon.includes(id)) m.weapon.push(id);
  }
  // class: from skills, else the weapon, else the highest stat; nothing read keeps the builder's
  const jobs = Object.keys(m.skills).map(id => SKJOB[id].job), w = WBYID[m.weapon[0]];
  m.clsRead = !!(jobs.length || w || m.shown);
  m.cls = clsOfJob(jobs[0]) || (w && clsOfWeapon(w)) ||
    (m.shown && Object.keys(BLD.PRIMARY).find(c => BLD.PRIMARY[c] === STATS.reduce((a, k) => m.shown[k] > m.shown[a] ? k : a, "STR"))) || BLD.S.cls;
  const L = m.lvl || BLD.S.lvl, br = BLD.BRANCHES[m.cls];
  // job: a 2nd job skill names it; else the weapon (a bow at 30+ is a Hunter); else the builder's, if it fits
  const second = br.filter(b => b[1] >= 30 && L >= b[1]);
  m.branch = L < 30 ? br[0][0] : jobs.find(j => second.some(b => b[0] === j)) || (w && second.find(b => b[2].includes(w.type))?.[0]) ||
    (second.some(b => b[0] === BLD.S.branch) && m.cls === BLD.S.cls ? BLD.S.branch : (second[0] || br[0])[0]);
  m.branchFrom = jobs.includes(m.branch) ? "skills" : w && L >= 30 && second.find(b => b[2].includes(w.type))?.[0] === m.branch ? "weapon" : "";
  m.pick = {weapon: m.weapon[0] || "", gear: Object.fromEntries(Object.entries(m.gear).map(([sl, ids]) => [sl, ids[0]]))};
  R = m;
}

// base AP = what the stat window shows minus the picked gear's stats (the game shows totals)
function baseAP(){
  const g = {STR: 0, DEX: 0, INT: 0, LUK: 0}, w = WBYID[R.pick.weapon];
  for (const [sl, id] of Object.entries(R.pick.gear)){
    const a = BLD.ARMOR[id]; if (!a) continue;
    if (sl === "Shield" && BLD.TWO_HANDED(w?.type)) continue;
    if ((sl === "Top" || sl === "Bottom") && R.pick.gear.Overall) continue;
    for (const k of STATS) g[k] += a[7][k] || 0;
  }
  const ap = Object.fromEntries(STATS.map(k => [k, Math.max(4, (R.shown?.[k] ?? 4) - g[k])]));
  return {ap, g};
}
// the merged reads -> the builder. Only what was read changes: an equipment shot alone keeps your skills, and SP the
// screenshots don't cover (a skill tab not pasted) keep whatever you set by hand
function applyR(){ if (R) BLD.group(applyR0) }
function applyR0(){
  BLD.apply(S => {
    const clsChanged = S.cls !== R.cls, jobChanged = clsChanged || S.branch !== R.branch, w = WBYID[R.pick.weapon];
    S.cls = R.cls; S.lvl = Math.max(10, Math.min(100, R.lvl || S.lvl)); S.branch = R.branch; S.skill = null; S.ammo = null;
    if (w){ S.weapon = w.name; S.fam = BLD.kindOf(w.type) } else if (jobChanged){ S.weapon = null; S.fam = null }
    if (Object.keys(R.pick.gear).length){ S.gear = {...R.pick.gear};
      const gs = Object.values(S.gear).map(id => BLD.ARMOR[id][5]).find(Boolean); if (gs && S.gender && S.gender !== gs) S.gender = gs }
    else if (clsChanged) S.gear = {};
    if (R.shown){
      const {ap} = baseAP(), over = STATS.reduce((a, k) => a + ap[k], 0) - BLD.apTotal(S.lvl);
      if (over > 0){ const top = STATS.reduce((a, k) => ap[k] > ap[a] ? k : a, "STR"); ap[top] = Math.max(4, ap[top] - over) }
      S.ap = ap;
    } else if (jobChanged) S.ap = null;
    const read = Object.entries(R.skills).filter(([, v]) => v > 0);
    if (read.length){
      const tiers = new Set(read.map(([id]) => BLD.tierOf(SKJOB[id])));
      const kept = jobChanged ? [] : Object.entries(S.sp).filter(([id]) => SKJOB[id] && !tiers.has(BLD.tierOf(SKJOB[id])));
      S.sp = Object.fromEntries([...kept, ...read]);
    } else if (jobChanged) S.sp = {__auto: 1};
  });
  // attack: the attack skill with the most points (the builder's default looks at max levels)
  // (on a tie, the builder's own pick if it's one of them: Danny's Double Shot 15 vs Power Knockback 15)
  const atks = [...$("#pskill").options].map(o => o.value).filter(id => R.skills[id]), top = Math.max(0, ...atks.map(id => R.skills[id]));
  const atk = R.skills[BLD.S.skill] === top ? BLD.S.skill : atks.find(id => R.skills[id] === top);
  if (atk && BLD.S.skill !== atk) BLD.apply(S => { S.skill = atk });
}

function note(){
  if (!R) return "";
  const S = BLD.S, bits = [`Level ${S.lvl} ${esc(S.branch || S.cls)}${R.branchFrom === "weapon" ? " (job from your weapon)" : ""}`];
  if (R.pick.weapon) bits.push(esc(WBYID[R.pick.weapon].name));
  const ng = Object.keys(R.pick.gear).length; if (ng) bits.push(`${ng} armor piece${ng > 1 ? "s" : ""}`);
  const ns = Object.keys(R.skills).length; if (ns) bits.push(`${ns} skill${ns > 1 ? "s" : ""}`);
  const worn = Object.fromEntries([R.pick.weapon, ...Object.values(R.pick.gear)].filter(Boolean).map(id => [id, 1]));
  let t = `<b>Applied:</b> ${bits.join(" · ")}${Object.keys(worn).length ? ` (${invPeek(worn, "see the gear")})` : ""}.`;
  // smoothed shots (UI at 1.5x, 1.875x...) read worse: thin icons like bows and skill levels can be missed
  const fz = READS.find(r => r.fuzzy && r.what.length);
  if (fz) t += ` <span class="tiny">That screenshot is at ${fz.k.toFixed(2)}x game size, so it's smoothed; check the weapon and skills. 100% or 200% reads best.</span>`;
  if (!R.shown) return t + " No stat window yet, so AP is auto-filled.";
  const {ap, g} = baseAP(), tot = STATS.reduce((a, k) => a + ap[k], 0), budget = BLD.apTotal(Math.max(10, S.lvl));
  const gl = STATS.filter(k => g[k]).map(k => `${k} +${g[k]}`).join(", "), over = tot - budget, top = STATS.reduce((a, k) => ap[k] > ap[a] ? k : a, "STR");
  t += ` ${gl ? `Gear's base stats (${gl}) taken off the stat window: ` : "AP from the stat window: "}${STATS.map(k => `${k} ${ap[k]}`).join(", ")} (${tot} of ${budget}).`;
  if (over > 0) t += Object.keys(R.gear).length || R.weapon.length
    ? ` <span class="down">${over} over level ${S.lvl}'s ${budget}: scrolls or above-average gear, so ${over} came off ${top}. Fix it under Ability points if you know better.</span>`
    : ` <span class="down">${over} more than level ${S.lvl} gives: that's your gear. Add the <b>Equipment Inventory</b> and it's taken off properly (for now ${over} came off ${top}).</span>`;
  return t;
}
// SP the screenshots don't account for (Danny's Lv 30 Hunter: 1st job tab pasted, 2nd job's 1 point unknown): ask where it went
const SPDONE = new Set();
function spAsk(){
  if (!R || !Object.keys(R.skills).length) return "";
  const S = BLD.S, list = BLD.skills();
  return [1, 2].map(t => {
    const left = BLD.spPool(t) - BLD.spentIn(S.sp, t, list), job = t === 1 ? BLD.BRANCHES[S.cls][0][0] : S.branch;
    if (left <= 0 || SPDONE.has(`${S.cls}|${job}|${S.lvl}`)) return "";
    const shown = list.some(s => BLD.tierOf(s) === t && R.skills[s.id]), can = list.filter(s => BLD.tierOf(s) === t && BLD.canSP(s.id));
    if (!can.length) return "";
    return `<div class="pisp" data-k="${esc(`${S.cls}|${job}|${S.lvl}`)}"><p><b>${left} ${esc(job)} SP ${left > 1 ? "aren't" : "isn't"} in your screenshots.</b> Where did ${left > 1 ? "they" : "it"} go?${shown ? "" : ` (Or add a screenshot of the ${esc(job)} skill tab.)`}</p>
      <div class="pispbtns">${can.map(s => `<button class="btn sm" data-addsp="${s.id}">${D.icons[s.id] ? `<img src="data:image/png;base64,${D.icons[s.id]}" alt="" width="24" height="24">` : ""}${esc(s.n)} <span class="sub">${S.sp[s.id] || 0}/${s.max}</span></button>`).join("")}
        <button class="btn sm" data-spauto="1">Let the builder pick</button><button class="btn sm" data-spleave="1">Still unspent</button></div></div>`;
  }).join("");
}

// thumbnails: one per screenshot, a box on everything read; click for the big view with the list of what was read
const markBoxes = r => r.marks.map((m, i) => `<i class="pimk pimk-${m.kind}" data-mi="${i}" style="left:${m.x / r.thumb.w * 100}%;top:${m.y / r.thumb.h * 100}%;width:${m.w / r.thumb.w * 100}%;height:${m.h / r.thumb.h * 100}%" title="${esc(m.t)}"></i>`).join("");
const KIND = r => r.what.length ? r.what.join(", ") : "nothing recognized";
let shownKey = "";
function renderShots(){
  const key = READS.map(r => r.id).join();
  if (key === shownKey) return; shownKey = key;
  const old = new Set([...document.querySelectorAll("#pimpshots [data-rid]")].map(e => +e.dataset.rid));
  $("#pimpshots").innerHTML = READS.map((r, k) => `<figure class="pishot${old.has(r.id) ? "" : " new"}${r.what.length ? "" : " bad"}" data-rid="${r.id}">
    <button class="pithumb" data-piopen="${k}" title="See what was read">${r.thumb ? `<img src="${r.thumb.src}" alt="" width="${r.thumb.w}" height="${r.thumb.h}">${markBoxes(r)}` : ""}</button>
    <figcaption>${esc(KIND(r))}<button class="pix" data-pidel="${k}" title="Remove this screenshot" aria-label="Remove this screenshot">×</button></figcaption></figure>`).join("");
}
function renderStatus(){
  renderShots();
  const st = $("#pimpst");
  if (!READS.length){ st.textContent = ""; st.className = "pill"; $("#pimpnote").innerHTML = ""; $("#pimpsp").innerHTML = ""; return }
  if (!READS.some(r => r.what.length)){ st.textContent = "Nothing recognized"; st.className = "pill p-bad" }
  else { const miss = [!R.shown && "Stats", !Object.keys(R.gear).length && !R.weapon.length && "Equipment", !Object.keys(R.skills).length && "Skills"].filter(Boolean);
    st.textContent = miss.length ? "Add: " + miss.join(", ") : "Applied"; st.className = "pill " + (miss.length ? "p-warn" : "p-good") }
  $("#pimpnote").innerHTML = READS.some(r => r.what.length) ? note() : "Nothing in that screenshot matched a game window. A PNG at 100% or 200% game size reads best; at other sizes, include the Character Stat window so its scale can be measured.";
  const ask = spAsk(); if ($("#pimpsp").innerHTML !== ask) $("#pimpsp").innerHTML = ask;
}
BLD.onRender(renderStatus);
// Undo / Redo carry the screenshot list with the build
BLD.extra = {get: () => READS.slice(), key: x => x.map(r => r.id).join(), set: x => { READS = x ? x.slice() : []; SPDONE.clear(); merge(); renderStatus() }};

async function handle(files){
  files = [...files].filter(f => /^image\//.test(f.type));
  if (!files.length) return;
  $("#pimpst").textContent = "Reading…"; $("#pimpst").className = "pill p-warn"; $("#pimpdrop").classList.add("busy");
  const add = [];
  for (const f of files){
    try { add.push(await readShot(f)) }
    catch(e){ console.error(e); add.push({id: ++SEQ, name: f.name, what: [], skills: {}, gear: {}, weapon: [], marks: []}) }
  }
  $("#pimpdrop").classList.remove("busy");
  READS = READS.concat(add); merge();
  if (add.some(r => r.what.length)) applyR(); else BLD.apply(() => {});   // still one Undo step, so Ctrl+Z takes it back off
}
$("#pimpfile").addEventListener("change", e => { handle(e.target.files); e.target.value = "" });
const drop = $("#pimpdrop");
drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over") });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); handle(e.dataTransfer.files) });
document.addEventListener("paste", e => { if ($("#plan").hidden) return; const f = [...(e.clipboardData?.files || [])]; if (f.length){ e.preventDefault(); handle(f) } });
$("#pimpshots").addEventListener("click", e => {
  const del = e.target.closest("[data-pidel]"), open = e.target.closest("[data-piopen]");
  if (del){ READS.splice(+del.dataset.pidel, 1); merge(); if (R) applyR(); else BLD.apply(() => {}) }
  else if (open) view(READS[+open.dataset.piopen]);
});
$("#pimpsp").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.addsp) BLD.addSP(b.dataset.addsp, 1);
  else if (b.dataset.spauto) BLD.apply(S => { S.sp = BLD.autoSP(S.sp) });
  else if (b.dataset.spleave){ SPDONE.add(b.closest(".pisp").dataset.k); renderStatus() }
});

// big view: the read part of the screenshot at a whole-number zoom, every box labelled in the list beside it
function view(r){
  const pop = $("#pishotpop"), z = Math.max(1, Math.min(3, Math.floor(720 / r.thumb.w))) || 1;
  const groups = [["stat", "Stats"], ["item", "Worn"], ["skill", "Skills"]].map(([k, t]) => [t, r.marks.map((m, i) => [m, i]).filter(([m]) => m.kind === k)]).filter(([, l]) => l.length);
  $("#pishotbody").innerHTML = `<div class="piview"><div class="pibig" style="width:${r.thumb.w * z}px"><img src="${r.thumb.src}" alt="The screenshot" width="${r.thumb.w * z}" height="${r.thumb.h * z}">${markBoxes(r)}</div></div>
    ${groups.length ? `<div class="piinv">${groups.map(([t, l]) => `<div><h4>${t}</h4><ul>${l.map(([m, i]) => `<li data-mi="${i}">${m.icon ? `<img src="data:image/png;base64,${m.icon}" alt="">` : ""}<span>${esc(m.t)}</span></li>`).join("")}</ul></div>`).join("")}</div>`
      : `<p class="tiny">Nothing here matched a Character Stat, Equipment Inventory or Skill Inventory window.</p>`}`;
  $("#pishothd").textContent = r.name || "Pasted screenshot";
  pop.hidden = false; $("#pishotx").focus({preventScroll: true});
}
const shut = () => { const pop = $("#pishotpop"); if (pop.hidden) return; pop.hidden = true };
$("#pishotx").addEventListener("click", shut);
$("#pishotpop").addEventListener("click", e => { if (e.target.id === "pishotpop") shut() });
document.addEventListener("keydown", e => { if (e.key === "Escape") shut() });
// hovering a box lights its line in the list and the other way round
$("#pishotbody").addEventListener("mouseover", e => {
  const t = e.target.closest("[data-mi]"), i = t?.dataset.mi;
  for (const el of $("#pishotbody").querySelectorAll("[data-mi]")) el.classList.toggle("hot", el.dataset.mi === i);
});
// the first screenshot waited ~2.5 s while every skill and equipment icon was decoded: do that in idle time once the
// Builder is open (shotIcon caches; awaits between icons keep the page responsive)
let warmed = false;
const warm = () => { if (warmed) return; warmed = true; setTimeout(() => (window.requestIdleCallback || setTimeout)(async () => {
  await ASSETS;
  const ids = [...Object.keys(SKJOB).filter(id => D.icons[id]).map(id => D.icons[id]), ...Object.keys(BLD.ARMOR).concat(Object.keys(WBYID)).filter(id => D.iicons[id]).map(id => D.iicons[id])];
  for (const b64 of ids) await shotIcon(b64) }), 800) };
$("#t-plan").addEventListener("click", warm); if (!$("#plan").hidden) warm();
})();
