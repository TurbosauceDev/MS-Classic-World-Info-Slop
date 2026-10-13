/* Character Builder: fill the build from in-game screenshots (Character Stat, Equipment Inventory, Skill Inventory windows).
   Reading happens in the page (51-shot.js); the result is shown for review and only applied on "Apply". */
(() => {
const STATS = ["STR", "DEX", "INT", "LUK"], PINK = [203, 79, 130], GREEN = [184, 199, 77];
const SKJOB = {}; for (const [j, list] of Object.entries(D.skills)) for (const s of list) SKJOB[s.id] = {job: j, s};
const clsOfJob = j => Object.keys(BLD.BRANCHES).find(c => BLD.BRANCHES[c].some(b => b[0] === j));
const clsOfWeapon = w => Object.keys(BLD.BRANCHES).find(c => BLD.BRANCHES[c][0][2].includes(w.type));
const WBYID = Object.fromEntries(BLD.W.map(w => [w.id, w]));
const num = s => { const m = /\d+/.exec(s || ""); return m ? +m[0] : null };
let R = null;   // what was read, edited in the review form

async function readShots(files){
  const r = {lvl: null, shown: null, skills: {}, gear: {}, weapon: [], seen: []};
  const skIcons = Object.keys(SKJOB).filter(id => D.icons[id]).map(id => [id, D.icons[id]]);
  const eqIcons = Object.keys(BLD.ARMOR).concat(Object.keys(WBYID)).filter(id => D.iicons[id]).map(id => [id, D.iicons[id]]);
  for (const f of files){
    const img = shotNative(await shotLoad(f)), seen = [];
    // stat window: pink labels NAME, JOB (two lines tall), LEVEL...; green labels STR, DEX, INT, LUK
    const pink = shotLabels(img, PINK), green = shotLabels(img, GREEN);
    const val = b => num(shotText(img, b.x1 + 2, b.y0 - 2, b.x1 + 130, b.y1 + 3)[0]?.s);
    if (pink.length >= 3){
      const tall = pink.slice(0, 3).reduce((a, b, i, l) => b.y1 - b.y0 > l[a].y1 - l[a].y0 ? i : a, 0);
      const lv = val(pink[Math.min(tall + 1, pink.length - 1)]);
      if (lv >= 1 && lv <= 200){ r.lvl = lv; seen.push("level") }
    }
    if (green.length >= 4){
      const v = green.slice(0, 4).map(val);
      if (v.every(x => x != null)){ r.shown = Object.fromEntries(STATS.map((k, i) => [k, v[i]])); seen.push("stats") }
    }
    // skill window: an icon with its level written below-right of it
    let ns = 0;
    for (const m of await shotFindIcons(img, skIcons)){
      const line = shotText(img, m.x + m.w + 2, m.y + m.h / 2, m.x + m.w + 80, m.y + m.h + 4).find(l => /^\d+$/.test(l.s));
      const lv = line && +line.s, s = SKJOB[m.key].s;
      if (lv && lv <= s.max){ r.skills[m.key] = Math.max(r.skills[m.key] || 0, lv); ns++ }
    }
    if (ns) seen.push(`${ns} skill${ns > 1 ? "s" : ""}`);
    // equipment window
    let ne = 0;
    for (const m of await shotFindIcons(img, eqIcons)){
      const ids = [m.key, ...(m.alt || [])];
      if (WBYID[m.key]) r.weapon.push(...ids.filter(id => WBYID[id] && !r.weapon.includes(id)));
      else { const sl = BLD.ARMOR[m.key][2]; r.gear[sl] = (r.gear[sl] || []).concat(ids.filter(id => BLD.ARMOR[id]?.[2] === sl && !(r.gear[sl] || []).includes(id))) }
      ne++;
    }
    if (ne) seen.push(`${ne} item${ne > 1 ? "s" : ""}`);
    r.seen.push(`${esc(f.name || "pasted image")}: ${seen.length ? seen.join(", ") : "nothing recognized"}${img.k > 1 ? ` (UI at ${img.k}×)` : ""}`);
  }
  // class: from skills, else the weapon, else the highest stat
  const jobs = Object.keys(r.skills).map(id => SKJOB[id].job);
  r.cls = clsOfJob(jobs[0]) || (r.weapon[0] && clsOfWeapon(WBYID[r.weapon[0]])) ||
    (r.shown && Object.keys(BLD.PRIMARY).find(c => BLD.PRIMARY[c] === STATS.reduce((a, k) => r.shown[k] > r.shown[a] ? k : a, "STR"))) || BLD.S.cls;
  r.branch = jobs.find(j => BLD.BRANCHES[r.cls].some(b => b[0] === j && b[1] >= 30)) || null;
  r.lvl = r.lvl || BLD.S.lvl;
  return r;
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
function reviewNote(){
  if (!R.shown) return "No stat window found: AP will be auto-filled.";
  const {ap, g} = baseAP(), tot = STATS.reduce((a, k) => a + ap[k], 0), budget = BLD.apTotal(Math.max(10, R.lvl));
  const gl = STATS.filter(k => g[k]).map(k => `${k} +${g[k]}`).join(", ");
  const over = tot - budget, top = STATS.reduce((a, k) => ap[k] > ap[a] ? k : a, "STR");
  return `${gl ? `Gear adds ${gl}, taken off. ` : ""}AP for the builder: ${STATS.map(k => `${k} ${ap[k]}`).join(", ")} (${tot} of ${budget}).` +
    (over > 0 ? ` <span class="down">${over} over the budget for level ${R.lvl}: probably gear or scroll bonuses not seen. Upload the Equipment window too, or ${over} comes off ${top}.</span>` : "");
}
const sel = (id, opts, cur) => `<select id="${id}">${opts.map(([v, t]) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
function renderReview(){
  const el = $("#pimprev");
  if (!R){ el.innerHTML = ""; return }
  const br = BLD.BRANCHES[R.cls].filter(b => R.lvl >= b[1]);
  if (!br.some(b => b[0] === R.branch)) R.branch = (br.find(b => b[1] >= 30) || br[0])[0];
  const wname = id => `${WBYID[id].name} · Lv ${WBYID[id].lvl}`, aname = id => `${BLD.ARMOR[id][1]} · Lv ${BLD.ARMOR[id][3]}`;
  const skills = Object.entries(R.skills).sort((a, b) => a[0] - b[0]);
  el.innerHTML = `<p class="tiny">${R.seen.join("<br>")}</p>
    <div class="row2"><label class="lab">Level<input id="pilvl" type="number" min="10" max="100" value="${R.lvl}"></label>
      <label class="lab">Class${sel("picls", Object.keys(BLD.BRANCHES).map(c => [c, c]), R.cls)}</label></div>
    <div class="row2"><label class="lab">Job${sel("pibranch", br.map(b => [b[0], b[0]]), R.branch)}</label>
      <label class="lab">Weapon${sel("piweapon", [["", R.weapon.length ? "keep current" : "none found: keep current"], ...R.weapon.map(id => [id, wname(id)])], R.pick.weapon)}</label></div>
    ${R.shown ? `<div class="apgrid" style="margin-top:12px">${STATS.map(k => `<label class="lab">${k} shown<input data-st="${k}" type="number" min="4" value="${R.shown[k]}"></label>`).join("")}</div>` : ""}
    <p class="tiny" id="pinote">${reviewNote()}</p>
    ${Object.keys(R.gear).length ? `<div class="geargrid">${BLD.SLOTS.filter(([sl]) => R.gear[sl]).map(([sl, label]) =>
      `<label class="lab">${label}${sel("pig-" + sl, [["", "skip"], ...R.gear[sl].map(id => [id, aname(id)])], R.pick.gear[sl] || "")}</label>`).join("")}</div>` : ""}
    ${skills.length ? `<div class="pigrid">${skills.map(([id, v]) => `<label class="lab">${esc(SKJOB[id].s.n)}<input data-sk="${id}" type="number" min="0" max="${SKJOB[id].s.max}" value="${v}"></label>`).join("")}</div>` :
      `<p class="tiny">No skill window found: skills will be auto-built.</p>`}
    <div class="btnrow"><button class="btn primary" id="piapply">Apply to builder</button><button class="btn" id="picancel" style="margin-top:12px">Discard</button></div>`;
}
async function handle(files){
  files = [...files].filter(f => /^image\//.test(f.type));
  if (!files.length) return;
  $("#pimpst").textContent = "Reading…"; $("#pimpst").className = "pill p-warn";
  try {
    R = await readShots(files);
    R.pick = {weapon: R.weapon[0] || "", gear: Object.fromEntries(Object.entries(R.gear).map(([sl, ids]) => [sl, ids[0]]))};
    const any = R.shown || Object.keys(R.skills).length || R.weapon.length || Object.keys(R.gear).length;
    $("#pimpst").textContent = any ? "Check, then apply" : "Nothing recognized"; $("#pimpst").className = "pill " + (any ? "p-good" : "p-bad");
  } catch(e){ console.error(e); R = null; $("#pimpst").textContent = "Couldn't read that image"; $("#pimpst").className = "pill p-bad" }
  renderReview();
}
$("#pimpfile").addEventListener("change", e => { handle(e.target.files); e.target.value = "" });
const drop = $("#pimpdrop");
drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over") });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); handle(e.dataTransfer.files) });
document.addEventListener("paste", e => { if ($("#plan").hidden) return; const f = [...(e.clipboardData?.files || [])]; if (f.length){ e.preventDefault(); handle(f) } });
$("#pimprev").addEventListener("change", e => {
  const t = e.target;
  if (t.id === "pilvl") R.lvl = Math.max(10, Math.min(100, +t.value || 10));
  else if (t.id === "picls"){ R.cls = t.value; R.branch = null }
  else if (t.id === "pibranch") R.branch = t.value;
  else if (t.id === "piweapon") R.pick.weapon = t.value;
  else if (t.id.startsWith("pig-")){ const sl = t.id.slice(4); if (t.value) R.pick.gear[sl] = t.value; else delete R.pick.gear[sl] }
  else if (t.dataset.st) R.shown[t.dataset.st] = Math.max(4, +t.value || 4);
  else if (t.dataset.sk) R.skills[t.dataset.sk] = Math.max(0, Math.min(SKJOB[t.dataset.sk].s.max, +t.value || 0));
  if (t.id === "pilvl" || t.id === "picls") renderReview(); else $("#pinote").innerHTML = reviewNote();
});
$("#pimprev").addEventListener("click", e => {
  if (e.target.id === "picancel"){ R = null; renderReview(); $("#pimpst").textContent = ""; return }
  if (e.target.id !== "piapply") return;
  BLD.apply(S => {
    const clsChanged = S.cls !== R.cls, w = WBYID[R.pick.weapon];
    S.cls = R.cls; S.lvl = Math.max(10, Math.min(100, R.lvl)); S.branch = R.branch; S.skill = null; S.ammo = null;
    if (w){ S.weapon = w.name; S.fam = BLD.kindOf(w.type) } else if (clsChanged) S.weapon = null;
    if (Object.keys(R.pick.gear).length){ S.gear = {...R.pick.gear};
      const gs = Object.values(S.gear).map(id => BLD.ARMOR[id][5]).find(Boolean); if (gs && S.gender && S.gender !== gs) S.gender = gs }
    else if (clsChanged) S.gear = {};
    if (R.shown){
      const {ap} = baseAP(), over = STATS.reduce((a, k) => a + ap[k], 0) - BLD.apTotal(S.lvl);
      if (over > 0){ const top = STATS.reduce((a, k) => ap[k] > ap[a] ? k : a, "STR"); ap[top] = Math.max(4, ap[top] - over) }
      S.ap = ap;
    } else S.ap = null;
    const sp = Object.fromEntries(Object.entries(R.skills).filter(([, v]) => v > 0));
    S.sp = Object.keys(sp).length ? sp : {__auto: 1};
  });
  // attack: the attack skill with the most points (the builder's default looks at max levels)
  const atk = [...$("#pskill").options].map(o => o.value).filter(id => R.skills[id]).sort((a, b) => R.skills[b] - R.skills[a])[0];
  if (atk) BLD.apply(S => { S.skill = atk });
  R = null; renderReview(); $("#pimpst").textContent = "Applied"; $("#pimpst").className = "pill p-good";
});
})();
