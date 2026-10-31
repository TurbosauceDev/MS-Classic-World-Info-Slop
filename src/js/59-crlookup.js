/* "Load by IGN": one character from classicrank.com's keyless API (CORS open, 30 requests/min per IP; classicrank.com/developer).
   User-initiated only. Sets class, 2nd job and level in the Character Builder or Where to train; the badge cites the profile. */
let CRL;
(() => {
// OFF 2026-10-31 (Danny): classicrank is offline, so lookup, census and profile links are parked. Flip to true if it returns.
const ON = false;
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
// Windia job census (D.crank, scripts/fetch_classicrank.py, daily): players per job, for the builder card and "of N" on the badge
const CR = D.crank?.jobs?.length ? D.crank : null, NJOB = Object.fromEntries((CR?.jobs || []).map(j => [j[0], j[3]]));
const BR2JOB = {}; for (const [j, [, b]] of Object.entries(JOB)) if (!(b in BR2JOB)) BR2JOB[b] = j;   // 1st/2nd job names come first
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
    + [c.rank ? `Overall #${fmt(c.rank)}` : "", c.jrank && c.job ? `${esc(c.job)} #${fmt(c.jrank)}${NJOB[c.job] >= c.jrank ? " of " + fmt(NJOB[c.job]) : ""}` : "", c.when ? `level up ${ago(c.when)}` : ""].filter(Boolean).join(" · ")
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
// one lookup: {c} or {note}. Replies are kept a minute (classicrank caches 30 s; the search box asks as you type)
const SEEN = new Map();
async function lookup(name){
  if (!ON) return {note: "Character lookup is offline."};
  if (!/^[A-Za-z0-9]{1,13}$/.test(name)) return {note: "Names are letters and numbers, up to 13."};
  const k = name.toLowerCase(), hit = SEEN.get(k); if (hit && Date.now() - hit.t < 6e4) return hit.v;
  let v;
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(API + encodeURIComponent(name) + "?fields=" + FIELDS, {signal: ctl.signal}); clearTimeout(t);
    if (r.status === 404) v = {note: `${name} isn't on classicrank.com yet.`};
    else if (r.status === 429) return {note: "classicrank.com is busy, try again in a minute."};
    else if (!r.ok) return {note: "classicrank.com didn't answer (HTTP " + r.status + ")."};
    else { const c = clean(await r.json()); v = c ? {c} : {note: "classicrank.com sent something unexpected."} }
  } catch(e) { return {note: "Couldn't reach classicrank.com."} }
  SEEN.set(k, {t: Date.now(), v}); return v;
}
// make c "your character": remembered, applied to that page, badges redrawn
function use(where, c){
  CUR = c; try { localStorage.setItem("cr_char", JSON.stringify({c})) } catch(e) {}
  const note = applyTo(where, c);
  if (BOX[where]) BOX[where].inp.value = c.name;
  draw(where, note); for (const w in BOX) if (w !== where) draw(w);
  census();
}
async function load(where){
  const b = BOX[where], name = b.inp.value.trim();
  b.btn.disabled = true; b.out.innerHTML = `<span class="tiny">Looking up ${esc(name)}…</span>`;
  const r = await lookup(name);
  b.btn.disabled = false;
  if (r.c) use(where, r.c); else draw(where, r.note);
}
for (const where of ["plan", "maps"]){
  const host = document.querySelector(`.crl[data-for="${where}"]`); if (!host || !ON) continue;
  host.innerHTML = `<label>Load by IGN<input type="text" maxlength="13" placeholder="Character name" spellcheck="false" autocomplete="off"></label>`
    + `<button class="btn sm" type="button">Load</button><div class="crlout" aria-live="polite"></div>`;
  const b = BOX[where] = {inp: host.querySelector("input"), btn: host.querySelector("button"), out: host.querySelector(".crlout")};
  if (CUR) b.inp.value = CUR.name;
  b.btn.addEventListener("click", () => load(where));
  b.inp.addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); load(where) } });
  draw(where);
}
const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
const TIER = ["Beginner", "1st job", "2nd job"];
function census(){
  const el = $("#pcensusbody"); if (!el) return;
  const card = $("#pcensus"); if (card) card.hidden = !ON;
  if (!ON) return;
  if (!CR){ el.innerHTML = `<p class="tiny">No census in this build.</p>`; return }
  const rows = CR.jobs.filter(j => j[3] > 0 && j[1] <= 2).sort((a, b) => b[1] - a[1] || b[3] - a[3]);
  const tierN = t => rows.reduce((a, j) => a + (j[1] === t ? j[3] : 0), 0), share = j => Math.round(100 * j[3] / tierN(j[1]));
  const mine = BR2JOB[BLD.S.branch], m = rows.find(j => j[0] === mine);
  let line = "";
  if (m && m[1] > 0){ const peers = rows.filter(j => j[1] === m[1]), r = peers.filter(j => j[3] > m[3]).length + 1;
    line = `<p><b>${esc(m[0])}</b> is the ${r === 1 ? "" : ord(r) + " "}most played ${TIER[m[1]]} of ${peers.length}: ${fmt(m[3])} characters (${share(m)}%).`
      + (m[5] ? ` Job rank #100 is Lv ${m[5]};` : "") + (m[4] ? ` the top ${esc(m[0])} is Lv ${m[4]}.` : "") + `</p>` }
  const lv = Object.entries(CR.levels || {}).filter(([L]) => +L >= 30).map(([L, n]) => `Lv ${L}+ <b>${fmt(n)}</b> (${+(100 * n / CR.chars).toFixed(n < CR.chars / 100 ? 1 : 0)}%)`).join(" · ");
  el.innerHTML = line + `<div class="tblwrap"><table class="mini"><thead><tr><th>Job</th><th class="num">Characters</th><th class="num">Share</th><th class="num">Top Lv</th><th class="num" title="Level of the 100th character in that job">#100 Lv</th></tr></thead><tbody>`
    + rows.map(j => `<tr${j[0] === mine ? ' class="vrow"' : ""}><td>${esc(j[0].replace("Fire/Poison", "F/P").replace("Ice/Lightning", "I/L"))}${j[1] < 2 ? ` <span class="sub">${TIER[j[1]]}</span>` : ""}</td><td class="num">${fmt(j[3])}</td><td class="num">${j[1] ? share(j) + "%" : "–"}</td><td class="num">${j[4] ?? "–"}</td><td class="num">${j[5] ?? "–"}</td></tr>`).join("")
    + `</tbody></table></div><p class="tiny">${fmt(CR.chars)} Windia characters on <a href="https://classicrank.com" target="_blank" rel="noopener">classicrank.com</a>, read ${esc(CR.read)}. ${lv}. Share = of the same job tier. Only characters someone scanned or uploaded there, so it leans to active players. Pirates aren't out yet.</p>`;
}
if (typeof BLD !== "undefined" && BLD) BLD.onRender(census);
census();
CRL = {on: ON, jobOf, clean, lookup, use, badge, get cur(){ return CUR }};
})();
