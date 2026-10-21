/* "Load by IGN": one character from classicrank.com's keyless API (CORS open, 30 requests/min per IP; classicrank.com/developer).
   User-initiated only. Sets class, 2nd job and level in the Character Builder or Where to train; the badge cites the profile. */
let CRL;
(() => {
const API = "https://classicrank.com/api/v1/characters/", SITE = /^https:\/\/classicrank\.com\/[^\s"<>]*$/;
const FIELDS = "name,display_name,level,job,job_tier,family,overall_rank,job_rank,level_updated,photo,profile_url";
// classicrank job names (GET /api/v1/jobs) -> builder [class, branch]. 3rd jobs (not in the launch) fall back to their 2nd job.
const JOB = {Swordsman: ["Warrior", "Warrior"], Fighter: ["Warrior", "Fighter"], Page: ["Warrior", "Page"], Spearman: ["Warrior", "Spearman"],
  Crusader: ["Warrior", "Fighter"], "White Knight": ["Warrior", "Page"], "Dragon Knight": ["Warrior", "Spearman"],
  Magician: ["Magician", "Magician"], "Wizard (Fire/Poison)": ["Magician", "F/P Wizard"], "Wizard (Ice/Lightning)": ["Magician", "I/L Wizard"], Cleric: ["Magician", "Cleric"],
  "Mage (Fire/Poison)": ["Magician", "F/P Wizard"], "Mage (Ice/Lightning)": ["Magician", "I/L Wizard"], Priest: ["Magician", "Cleric"],
  Archer: ["Bowman", "Archer"], Hunter: ["Bowman", "Hunter"], Crossbowman: ["Bowman", "Crossbowman"], Ranger: ["Bowman", "Hunter"], Sniper: ["Bowman", "Crossbowman"],
  Thief: ["Thief", "Rogue"], Assassin: ["Thief", "Assassin"], Bandit: ["Thief", "Bandit"], Hermit: ["Thief", "Assassin"], "Chief Bandit": ["Thief", "Bandit"]};
const FAMILY = {Warrior: "Warrior", Magician: "Magician", Bowman: "Bowman", Thief: "Thief"};
// -> {cls, branch} for the builder, or {cls: null} (Beginner / Pirate / unknown job: keep the picked class, set the level only)
function jobOf(c){
  const j = JOB[c.job];
  if (j && (!c.family || FAMILY[c.family] === j[0])) return {cls: j[0], branch: j[1]};
  return {cls: null, branch: null, why: c.family === "Pirate" ? "Pirates aren't in the planner yet" : c.family === "Beginner" || c.job === "Beginner" ? "Beginner: pick your class" : "job unknown on classicrank"};
}
const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi ? x : null;
const str = (x, n) => typeof x === "string" ? x.slice(0, n) : null;
// the API reply, checked field by field (it's outside data): only known types, only classicrank.com URLs
function clean(d){
  d = d && typeof d === "object" ? d.data : null;
  if (!d || typeof d !== "object" || typeof d.name !== "string" || !/^[A-Za-z0-9]{1,13}$/.test(d.name)) return null;
  const t = str(d.level_updated, 30), when = t && !isNaN(Date.parse(t)) ? t : null;
  return {name: d.name, display: str(d.display_name, 20) || d.name, level: int(d.level, 1, 250), job: str(d.job, 30), tier: int(d.job_tier, 0, 4),
    family: str(d.family, 20), rank: int(d.overall_rank, 1, 1e7), jrank: int(d.job_rank, 1, 1e7), when,
    photo: SITE.test(d.photo || "") ? d.photo : null,
    url: SITE.test(d.profile_url || "") ? d.profile_url : "https://classicrank.com/user/" + encodeURIComponent(d.name)};
}
const ago = t => { const m = Math.max(0, (Date.now() - Date.parse(t)) / 6e4);
  return m < 60 ? Math.round(m) + " min ago" : m < 2880 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " days ago" };
let CUR = (() => { const o = savedState("cr_char", {c: {}}); return o.c?.name && clean({data: {...o.c, display_name: o.c.display, overall_rank: o.c.rank,
  job_rank: o.c.jrank, level_updated: o.c.when, job_tier: o.c.tier, profile_url: o.c.url}}) })();
function badge(c, note){
  const j = jobOf(c);
  return (c.photo ? `<img class="crlimg" src="${esc(c.photo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : "")
    + `<div><b>${esc(c.display)}</b> <span class="sub">Lv ${c.level ?? "?"} ${esc(c.job || "?")}</span><br><span class="tiny">`
    + [c.rank ? `Overall #${fmt(c.rank)}` : "", c.jrank && c.job ? `${esc(c.job)} #${fmt(c.jrank)}` : "", c.when ? `level up ${ago(c.when)}` : ""].filter(Boolean).join(" · ")
    + ` · <a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">classicrank.com</a></span>`
    + (note || !j.cls ? `<br><span class="tiny">${esc(note || j.why)}</span>` : "") + `</div>`;
}
// put c into the builder (BLD) or Where to train (#cls/#lvl); returns a note for the badge
function applyTo(where, c){
  const j = jobOf(c), lvl = Math.max(10, Math.min(MAX_LEVEL, c.level || 10));
  if (where === "plan"){
    BLD.group(() => BLD.apply(S => {
      if (j.cls && (S.cls !== j.cls || S.branch !== j.branch)){ if (S.cls !== j.cls) S.gear = {}; S.cls = j.cls; S.branch = j.branch; S.fam = null; S.weapon = null }
      S.lvl = lvl; S.skill = null; S.ammo = null; S.ap = null; S.sp = {__auto: 1};
    }));
  } else {
    const cls = j.cls === "Magician" ? (lvl < 30 || j.branch === "Magician" ? "Magician" : j.branch) : j.cls, el = $("#cls");
    if (cls && el.value !== cls){ el.value = cls; el.dispatchEvent(new Event("change")) }
    $("#lvl").value = lvl; $("#lvl").dispatchEvent(new Event("input"));
  }
  return c.level < 10 ? "Planner starts at Lv 10" : "";
}
const BOX = {};
function draw(where, note){ const b = BOX[where]; if (!b) return; b.out.innerHTML = CUR ? badge(CUR, note) : note ? `<span class="tiny">${esc(note)}</span>` : "" }
async function load(where){
  const b = BOX[where], name = b.inp.value.trim();
  if (!/^[A-Za-z0-9]{1,13}$/.test(name)){ draw(where, "Names are letters and numbers, up to 13."); return }
  b.btn.disabled = true; b.out.innerHTML = `<span class="tiny">Looking up ${esc(name)}…</span>`;
  let note = "";
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(API + encodeURIComponent(name) + "?fields=" + FIELDS, {signal: ctl.signal}); clearTimeout(t);
    if (r.status === 404) note = `${name} isn't on classicrank.com yet.`;
    else if (r.status === 429) note = "classicrank.com is busy, try again in a minute.";
    else if (!r.ok) note = "classicrank.com didn't answer (HTTP " + r.status + ").";
    else { const c = clean(await r.json()); if (!c) note = "classicrank.com sent something unexpected.";
      else { CUR = c; try { localStorage.setItem("cr_char", JSON.stringify({c})) } catch(e) {} note = applyTo(where, c) } }
  } catch(e) { note = "Couldn't reach classicrank.com." }
  b.btn.disabled = false;
  draw(where, note);
  for (const w in BOX) if (w !== where) draw(w);
}
for (const where of ["plan", "maps"]){
  const host = document.querySelector(`.crl[data-for="${where}"]`); if (!host) continue;
  host.innerHTML = `<label>Load by IGN<input type="text" maxlength="13" placeholder="Character name" spellcheck="false" autocomplete="off"></label>`
    + `<button class="btn sm" type="button">Load</button><div class="crlout" aria-live="polite"></div>`;
  const b = BOX[where] = {inp: host.querySelector("input"), btn: host.querySelector("button"), out: host.querySelector(".crlout")};
  if (CUR) b.inp.value = CUR.name;
  b.btn.addEventListener("click", () => load(where));
  b.inp.addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); load(where) } });
  draw(where);
}
CRL = {jobOf, clean, get cur(){ return CUR }};
})();
