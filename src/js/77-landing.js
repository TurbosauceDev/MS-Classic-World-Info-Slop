/* ---------------- section landing pages ---------------- */
// Clicking a sidebar section title (a `.sgh` button with its own data-tab) opens that section's landing page: what each
// page does, with a small live example built from D (Danny 10-22). Grind Tracker's landing page is its old Overview (#trk).
(() => {
const png = b => b ? "data:image/png;base64," + b : "";
// sprites drawn after load (the Pages copy gets item icons from ASSETS, after 00-core.js filled the Home ones)
const fillIc = root => root.querySelectorAll("img[data-ic]:not([src])").forEach(im => { const [k, id] = im.dataset.ic.split(":");
  const b = {i: D.iicons, m: D.mobimg, s: D.icons}[k]?.[id]; if (b) im.src = png(b) });
ASSETS.then(() => document.querySelectorAll(".lp").forEach(fillIc));
document.addEventListener("click", e => { const g = e.target.closest?.(".lp [data-go]:not(a)"); if (!g) return;
  $("#t-" + g.dataset.go).click(); window.scrollTo({top: $("nav").offsetTop - 8}) });
const clampLv = (el, d) => { const v = Math.round(+el.value); return v >= 1 && v <= 200 ? v : d };

/* Maple Database */
// Items: live name search, the six best matches (starts-with first, then shorter names), one row per name
const ITN = Object.entries(D.items).filter(([, it]) => it.n).map(([id, it]) => [id, it.n.toLowerCase()]);
function lpItems(){
  const q = $("#lpitq").value.trim().toLowerCase(), box = $("#lpitems");
  if (!q){ box.innerHTML = `<p class="sub">Type a few letters, or try</p><div class="lpchips">${["glove", "potion", "ore", "claw"].map(w => `<button class="btn sm" data-try="${w}">${w}</button>`).join("")}</div>`; return }
  const seen = new Set(), hits = ITN.filter(([, n]) => n.includes(q)).sort((a, b) => (b[1].startsWith(q) - a[1].startsWith(q)) || a[1].length - b[1].length)
    .filter(([, n]) => !seen.has(n) && seen.add(n)).slice(0, 6);
  box.innerHTML = hits.length ? hits.map(([id]) => { const it = D.items[id];
    return `<div class="lprow">${itemIcon(id, 1, true)}<span class="itname" tabindex="0" data-item="${id}" data-n="1">${esc(it.n)}</span><span class="sub">${esc(it.c === "Equipment" ? it.wt || it.s || "" : it.c || "")}</span></div>` }).join("")
    : `<p class="sub">No item called that.</p>`;
}
// Monsters: a random field monster near the level, as a small card (sprite, stats, top reported drops)
const MOBS = Object.entries(D.mobdb).filter(([id, m]) => D.mobimg[id] && !m.is_boss && m.maps?.length && m.maps.some(x => !x[4])).map(([id, m]) => [id, m, +m.level]);
let lpMobId = null;
function lpMob(next){
  const lv = clampLv($("#lpmlv"), 15), near = MOBS.filter(x => Math.abs(x[2] - lv) <= 3), pool = near.length ? near : MOBS;
  let pick = pool.find(x => x[0] === lpMobId);
  if (!pick || next){ const rest = pool.filter(x => x[0] !== lpMobId); pick = (rest.length ? rest : pool)[Math.floor(Math.random() * (rest.length || pool.length))] }
  const [id, m] = pick; lpMobId = id;
  const drops = (m.dr || []).slice(0, 5).map(([iid, , n]) => itemIcon(iid, 1, true)).join("");
  $("#lpmob").innerHTML = `<div class="lpmob"><img src="${png(D.mobimg[id])}" alt="">
    <div><span class="mobname" tabindex="0" data-mob="${id}">${esc(m.name)}</span>
      <div class="lpstats"><span><b>Lv</b> ${m.level}</span><span><b>HP</b> ${fmt(+m.hp)}</span><span><b>EXP</b> ${fmt(+m.exp)}</span></div>
      ${drops ? `<div class="lpdrops"><span class="sub">Reported drops</span>${drops}</div>` : ""}</div></div>`;
}
// Quests: how many quests your level can take, and the four closest to it
const QS = D.quests.filter(q => +q.lvl >= 0);
function lpQuests(){
  const lv = clampLv($("#lpqlv"), 20), ok = QS.filter(q => +q.lvl <= lv);
  $("#lpqn").textContent = `${ok.length} of ${QS.length} quests open`;
  $("#lpquests").innerHTML = ok.sort((a, b) => b.lvl - a.lvl).slice(0, 4).map(q =>
    `<div class="lprow"><span class="sub lplv">Lv ${q.lvl}</span><span class="name qname" tabindex="0" data-src="q" data-i="${D.quests.indexOf(q)}">${esc(q.name)}</span>${+q.exp ? `<span class="sub">${fmt(+q.exp)} EXP</span>` : ""}</div>`).join("");
}
// Skills: a class's 1st job skills as icons; pointing at one shows its level 1 text
const SKJ = ["Warrior", "Magician", "Archer", "Rogue"].filter(j => D.skills[j]);
let lpJob = SKJ[0];
function lpSkills(){
  $("#lpskjob").innerHTML = SKJ.map(j => `<button class="btn sm${j === lpJob ? " on" : ""}" data-job="${j}" aria-pressed="${j === lpJob}">${j}</button>`).join("");
  $("#lpskills").innerHTML = D.skills[lpJob].map(s => `<button class="lpsk" data-sk="${s.id}" aria-label="${esc(s.n)}">${D.icons[s.id] ? `<img src="${png(D.icons[s.id])}" alt="">` : esc(s.n[0])}</button>`).join("");
  $("#lpskinfo").textContent = "Point at a skill to see what it does at level 1.";
}
const skInfo = el => { const s = D.skills[lpJob].find(x => x.id === el.dataset.sk); if (!s) return;
  $("#lpskinfo").innerHTML = `<b>${esc(s.n)}</b> <span class="sub">(max ${s.max})</span> ${esc(s.st?.[0] || "")}` };
// Citizenship: quests per town
function lpCit(){
  const by = {}; for (const q of D.citq) if (q.region && q.region !== "Citizenship") by[q.region] = (by[q.region] || 0) + 1;
  $("#lpcit").innerHTML = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<div class="lprow"><b>${esc(t)}</b><span class="sub">${n} citizenship quests</span></div>`).join("")
    + `<p class="sub">From level 12, sign up in Henesys or Kerning City. Each town has its own grades, quests and shop.</p>`;
}
let dbDrawn = false;
const drawDb = async () => { if (dbDrawn) return; dbDrawn = true; await ASSETS; lpItems(); lpMob(); lpQuests(); lpSkills(); lpCit() };
$("#lpitq").addEventListener("input", lpItems);
$("#lpitems").addEventListener("click", e => { const b = e.target.closest("[data-try]"); if (b){ $("#lpitq").value = b.dataset.try; lpItems(); $("#lpitq").focus() } });
$("#lpmlv").addEventListener("change", () => lpMob(true)); $("#lpmnext").addEventListener("click", () => lpMob(true));
$("#lpqlv").addEventListener("input", lpQuests);
$("#lpskjob").addEventListener("click", e => { const b = e.target.closest("[data-job]"); if (b){ lpJob = b.dataset.job; lpSkills() } });
for (const ev of ["mouseover", "focusin"]) $("#lpskills").addEventListener(ev, e => { const b = e.target.closest(".lpsk"); if (b) skInfo(b) });
$("#lpskills").addEventListener("click", () => $("#t-skills").click());
$("#db .lpsrch").addEventListener("click", () => $("#srchopen").click());

/* Training */
// EXP/hr calculator: EXP to the next level (D.exp, game files) and the time it takes at the rate typed
function lpExp(){
  const lv = clampLv($("#lpelv"), 30), need = D.exp[lv], hr = +$("#lpehr").value;
  if (!need){ $("#lpexp").innerHTML = `<p class="sub">No level ${lv} in the game files.</p>`; return }
  const h = hr > 0 ? need / hr : 0, t = h ? (h >= 1 ? `${Math.floor(h)} h ${Math.round(h % 1 * 60)} min` : `${Math.max(1, Math.round(h * 60))} min`) : "";
  $("#lpexp").innerHTML = `<div class="lpbig">${fmt(need)} <span class="sub">EXP from level ${lv} to ${lv + 1}</span></div>`
    + (t ? `<div class="lpbig">${t} <span class="sub">at ${fmt(hr)} EXP/hr</span></div>` : `<p class="sub">Type your EXP/hr to see the time.</p>`);
}
// Kerning PQ: each stage's minimap from the game files
const KPQ = (D.kpq || []).filter(k => k.mm && !/exit/i.test(k.name));
let lpStage = 0;
function lpKpq(){
  const k = KPQ[lpStage]; if (!k) return;
  $("#lpkpqs").innerHTML = KPQ.map((x, i) => `<button class="btn sm${i === lpStage ? " on" : ""}" data-st="${i}" aria-pressed="${i === lpStage}">${esc((/<(.+)>/.exec(x.name) || [, x.name])[1].replace(/ stage$/i, ""))}</button>`).join("");
  $("#lpkpq").innerHTML = `<div class="lpmm"><img src="data:image/webp;base64,${k.mm}" alt="${esc(k.name)} minimap"></div><p class="sub">${esc(k.name)}${k.mob?.length ? ` · ${k.mob.length} monster spawns` : ""}</p>`;
}
let trainDrawn = false;
const drawTrain = () => { if (trainDrawn) return; trainDrawn = true; lpExp(); lpKpq() };
for (const id of ["#lpelv", "#lpehr"]) $(id).addEventListener("input", lpExp);
$("#lpkpqs").addEventListener("click", e => { const b = e.target.closest("[data-st]"); if (b){ lpStage = +b.dataset.st; lpKpq() } });

/* Victoria Island */
// World Map: the island's map picture; Map Navigator: town to town with the planner's trip times (60-planner.js TRAVEL)
const TOWNS = D.cabs.filter(id => D.nav[id]);
function lpNav(){
  const a = $("#lpnfrom").value, b = $("#lpnto").value, t = TRAVEL.travel(a, b);
  $("#lpnav").innerHTML = a === b ? `<p class="sub">Pick two different towns.</p>` : !t ? `<p class="sub">No route found.</p>`
    : `<div class="lpbig">about ${Math.max(1, Math.round(t.sec / 60))} min <span class="sub">(estimate)</span></div><p class="sub">${t.walk} map${t.walk === 1 ? "" : "s"} on foot${t.taxi ? `, ${t.taxi} taxi ride${t.taxi === 1 ? "" : "s"}` : ""}.</p>
      <button class="btn sm" id="lpnroute">Show the route →</button>`;
}
let worldDrawn = false;
const drawWorld = () => { if (worldDrawn) return; worldDrawn = true;
  const w = D.wmap.find(x => x[1] === "Victoria Island") || D.wmap[0];
  if (w){ $("#lpwmimg").src = "data:image/webp;base64," + w[4]; $("#lpwmimg").alt = w[1] + " world map"; $("#lpwmn").textContent = `${w[1]}. Click the map to open it.` }
  const opts = TOWNS.map(id => `<option value="${id}">${esc(D.mapnames[id] || id)}</option>`).join("");
  $("#lpnfrom").innerHTML = $("#lpnto").innerHTML = opts; $("#lpnto").selectedIndex = Math.min(1, TOWNS.length - 1); lpNav() };
for (const id of ["#lpnfrom", "#lpnto"]) $(id).addEventListener("change", lpNav);
$("#lpnav").addEventListener("click", e => { if (!e.target.closest("#lpnroute")) return;
  $(`#navtowns button[data-id="${$("#lpnfrom").value}"]`)?.click(); navTo($("#lpnto").value) });

/* Mesos and Trade */
// FM Sniper: the live listings furthest under their meso.watch median sale price; Price check: one item's median sale
function lpSnipe(){
  const now = D.pw?.now || {}, rows = Object.entries(now).map(([id, x]) => [id, x, pwSolid(id)]).filter(([id, x, m]) => D.items[id] && m >= 1000 && x[0] > 0 && x[0] < m)
    .sort((a, b) => a[1][0] / a[2] - b[1][0] / b[2]).slice(0, 4);
  $("#lpsnn").textContent = D.pw?.listed ? `Furthest under their usual sale price in the listings read ${D.pw.listed}:` : "";
  $("#lpsnipe").innerHTML = rows.length ? rows.map(([id, x, m]) => `<div class="lprow">${itemIcon(id, 1, true)}<span class="itname" tabindex="0" data-item="${id}" data-n="1">${esc(D.items[id].n)}</span>`
    + `<span class="sub">${fmt(x[0])} <s>${fmt(m)}</s></span></div>`).join("") : `<p class="sub">No listings under their usual price right now.</p>`;
}
const PRICED = ITN.filter(([id]) => pwSolid(id));
function lpPrice(){
  const q = $("#lppq").value.trim().toLowerCase(), box = $("#lpprice");
  if (!q){ box.innerHTML = `<p class="sub">Type a few letters, or try</p><div class="lpchips">${["ore", "scroll", "potion"].map(w => `<button class="btn sm" data-try="${w}">${w}</button>`).join("")}</div>`; return }
  const hits = PRICED.filter(([, n]) => n.includes(q)).sort((a, b) => (b[1].startsWith(q) - a[1].startsWith(q)) || a[1].length - b[1].length).slice(0, 5);
  box.innerHTML = hits.length ? hits.map(([id]) => `<div class="lprow">${itemIcon(id, 1, true)}<span class="itname" tabindex="0" data-item="${id}" data-n="1">${esc(D.items[id].n)}</span>`
    + `<span class="sub">${pwSpark(id)} ${fmt(pwSolid(id))} ${pwTrend(id)}</span></div>`).join("") + `<p class="sub">Median player-shop sale price (meso.watch).</p>`
    : `<p class="sub">No sale prices for an item called that.</p>`;
}
let townDrawn = false;
const drawTown = async () => { if (townDrawn) return; townDrawn = true; await ASSETS; lpSnipe(); lpPrice() };
$("#lppq").addEventListener("input", lpPrice);
$("#lpprice").addEventListener("click", e => { const b = e.target.closest("[data-try]"); if (b){ $("#lppq").value = b.dataset.try; lpPrice(); $("#lppq").focus() } });

/* Grind Tracker: live lines on its page links */
function drawTrk(){
  const sh = D.shared, best = sh?.kpq?.board?.Rush?.[0]?.best;
  if (sh?.runs > 0) $("#lptruns").textContent = `${fmt(+sh.runs)} runs, ${sh.hours} hours from ${sh.players} player${sh.players == 1 ? "" : "s"} so far.`;
  if (best > 0) $("#lptkpq").textContent = `Fastest Rush clear so far: ${Math.floor(best / 60)}:${String(best % 60).padStart(2, "0")}.`;
}

const DRAW = {db: drawDb, trk: drawTrk, train: drawTrain, world: drawWorld, town: drawTown};
for (const [id, f] of Object.entries(DRAW)) $("#t-" + id).addEventListener("click", () => f());
for (const [id, f] of Object.entries(DRAW)) if (!$("#" + id).hidden) f();
})();
