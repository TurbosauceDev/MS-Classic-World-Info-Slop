/* ---------------- Crafting > Plan (was the Craft planner page): your craft levels + inventory screenshots -> what to craft for profit ---------------- */
// Also owns the craft levels card and the price helpers the other Crafting tabs use (45-crafting.js, via window.CPLAN).
(() => {
// Inventory = the Price check's screenshot reads (54-invprice.js, INVP.counts) plus items typed in by hand. Recipes, fees and
// craft EXP: OSMS export (D.craft.rec, capped at CRAFT_CAP). Prices: meso.watch median sale (PW), NPC sell price (game files),
// NPC shops (meowdb), live listings (PWNOW). Farming: meowdb drop reports (D.drops) and named-after monsters (D.craft.src),
// 5% per kill (our assumption: no drop rates exist anywhere) unless shared runs saw 100+ kills; kills/hr from mapRates.
const DISC = D.craft.disc.map(d => d[0]), RECS = D.craft.rec.map(([d, type, lvl, id, n, exp, mesos, ing], i) => ({i, d, type, lvl, id, n, exp, mesos, ing}));
const CLS = ["Warrior", "Bowman", "Thief", "Magician", "I/L Wizard", "F/P Wizard", "Cleric"];
const S = {lv: DISC.map(() => 0), cls: "Warrior", L: 25, free: 0, hand: {}};
const fresh = (() => { try { return !localStorage.getItem("cplan") } catch(e) { return true } })();
Object.assign(S, savedState("cplan", S));
S.lv = DISC.map((_, i) => { const v = Math.round(+S.lv[i]); return v >= 0 && v <= CRAFT_CAP ? v : 0 });
if (!CLS.includes(S.cls)) S.cls = "Warrior";
S.L = Math.min(MAX_LEVEL, Math.max(1, Math.round(+S.L) || 25)); S.free = S.free ? 1 : 0;
S.hand = Object.fromEntries(Object.entries(S.hand).filter(([id, n]) => D.items[id] && Number.isInteger(n) && n > 0 && n <= 99999));
if (fresh){ const t = savedState("train", {v: {}}).v || {}; if (CLS.includes(t.cls)) S.cls = t.cls; if (+t.lvl >= 1 && +t.lvl <= MAX_LEVEL) S.L = Math.round(+t.lvl) }
const save = () => { try { localStorage.setItem("cplan", JSON.stringify(S)) } catch(e) {} };

/* prices */
const shopMin = id => { const a = [...(D.ishop?.[id] || []).map(s => s[3]), D.shopsell?.[id]?.[2]].filter(v => v > 0); return a.length ? Math.min(...a) : 0 };
// what one sells for: the median player-shop sale or what an NPC pays, whichever is more. Items meso.watch prices by the set
// (flag 2) have no per-item price, so they fall back to the NPC price. No meso.watch sales: the pwPrice chain (classicmarket.kr,
// meowdb, then the shop-scan sources).
const worth = id => { const f = pwPrice(id), med = f && !f.per ? f.v : 0; return Math.max(med, D.items[id]?.p || 0) };
const rough = id => { const f = pwPrice(id); return !!(f && f.rough && f.v > (D.items[id]?.p || 0)) };
const roughWhy = id => { const f = pwPrice(id); if (!f) return "";
  if (f.src === "meso.watch") return "Under 5 sales seen";
  if (f.src === "classicmarket.kr market") return `Only classicmarket.kr market: under 5 sales (${fmt(f.n)})`;
  if (f.src === "meowdb") return `Only meowdb (${fmt(f.n)} player prices, under 5 of them sales)`;
  const what = {sale: "sales", post: "posts", listing: "listings", price: "player prices"}[f.unit] || "prices";
  return `Only ${f.src} (${fmt(f.n)} ${what}${f.unit === "sale" ? ", under 5 of them" : ": asking prices, not sales"})` };
// cheapest way to buy one: a live listing, an NPC shop or the usual price
// (no meso.watch price: the cheapest classicmarket.kr sell post)
const cmAsk = id => !PW[id] && CM[id]?.[2] ? CM[id][0] : 0;
const buyEach = id => { const n = PWNOW[id], p = PW[id], a = [n && n[0] >= 1 ? n[0] : 0, shopMin(id), p && !(p[4] & 2) ? p[0] : 0, cmAsk(id)].filter(v => v > 0); return a.length ? Math.min(...a) : Infinity };
const buyHow = id => { const v = buyEach(id), n = PWNOW[id]; return v === (n && n[0]) ? "listed now" : v === shopMin(id) ? "NPC shop" : v === cmAsk(id) ? "classicmarket.kr post" : "usual price" };

/* crafting */
let ALLOWED = [], SUB = {};   // recipes your levels allow; item id -> the recipe used to make it as a part (45-crafting.js rule)
function setLevels(){
  ALLOWED = RECS.filter(r => S.lv[r.d] >= r.lvl); SUB = {};
  for (const r of ALLOWED){ const o = SUB[r.id]; if (!o || r.lvl < o.lvl || r.lvl === o.lvl && r.n > o.n) SUB[r.id] = r }
}
// craft r `times` times out of inv (a Map, used up): parts you can make are made on the way (whole batches, extras go back).
// out: fee, exp, used {id: n from inv}, miss {id: n raw still needed}, parts [[recipe, batches]]
function make(r, times, inv, out, depth = 0){
  out.fee += r.mesos * times; out.exp += r.exp * times;
  for (const [id, k] of r.ing){
    let need = k * times; const have = inv.get(id) || 0, take = Math.min(have, need);
    if (take){ inv.set(id, have - take); out.used[id] = (out.used[id] || 0) + take; need -= take }
    if (!need) continue;
    const sub = depth < 4 && SUB[id] !== r && SUB[id];
    if (sub){ const b = Math.ceil(need / sub.n); out.parts.push([sub, b]); make(sub, b, inv, out, depth + 1); if (b * sub.n > need) inv.set(id, (inv.get(id) || 0) + b * sub.n - need) }
    else out.miss[id] = (out.miss[id] || 0) + need;
  }
  return out;
}
const run = (r, times, inv) => make(r, times, inv, {fee: 0, exp: 0, used: {}, miss: {}, parts: []});
const fits = (r, t, inv) => !Object.keys(run(r, t, new Map(inv)).miss).length;
function maxTimes(r, inv){
  if (S.lv[r.d] < r.lvl || !fits(r, 1, inv)) return 0;
  let lo = 1, hi = 2; while (hi <= 99999 && fits(r, hi, inv)){ lo = hi; hi *= 2 }
  while (hi - lo > 1){ const m = (lo + hi) >> 1; if (fits(r, m, inv)) lo = m; else hi = m }
  return lo;
}
const cost = used => S.free ? 0 : Object.entries(used).reduce((a, [id, n]) => a + worth(id) * n, 0);
const value = (r, t) => worth(r.id) * r.n * t;

/* farming: drops per hour on each map (estimate) */
let RATES = null, RKEY = "", FARM = {};
function farm(id){
  const key = S.cls + "|" + S.L;
  if (RKEY !== key){ RKEY = key; FARM = {};
    const fb = trainBuild(S.cls, S.L), aoe = classAoe(S.cls, S.L);
    RATES = mapRates(S.cls, S.L, fb.dps > 0 ? fb.dps : 20 * S.L, accFor(S.cls, S.L), Infinity, aoe && aoe.t > 1 ? aoe : null, 1) }
  if (FARM[id]) return FARM[id];
  const mobs = new Set([...(D.drops[id] || []).map(x => String(x[0])), ...(D.craft.src[id]?.mob || []).map(String)]);
  const out = [];
  if (mobs.size) for (const row of RATES){
    let hr = 0, real = false; const who = [];
    for (const [m, c] of D.maps[row.id]?.[2] || []){ if (!mobs.has(String(m))) continue;
      const sh = D.shared?.mobs?.[m], seen = sh && sh.kills >= 100, p = seen ? (sh.items?.[id] || 0) / sh.kills : 0.05;
      hr += c * row.rate / row.cyc * 3600 * p; real ||= seen; if (!who.includes(m)) who.push(m) }
    if (hr > 0) out.push({map: row.id, name: row.name, hr, real, who});
  }
  return FARM[id] = out.sort((a, b) => b.hr - a.hr).slice(0, 2);
}
const dur = h => { const m = Math.max(1, Math.round(h * 60)); return m < 60 ? `${m} min` : m < 6000 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : "100+ h" };

/* inventory */
function inventory(){
  const inv = new Map(Object.entries(window.INVP?.counts() || {}));
  for (const [id, n] of Object.entries(S.hand)) inv.set(id, (inv.get(id) || 0) + n);
  return inv;
}
const nm = id => `<span class="itname" tabindex="0" data-item="${id}">${esc(D.items[id]?.n || id)}</span>`;
const ings = (o, k = 1) => Object.entries(o).map(([id, n]) => `<span class="sning">${itemIcon(id, 1, true)} ${fmt(Math.round(n / k))} ${nm(id)}</span>`).join(" ");
const made = r => `<span class="ing">${itemIcon(r.id, r.n)}<span><button class="linkbtn crname" type="button" data-r="${r.i}">${esc(D.items[r.id]?.n || r.id)}</button>${r.n > 1 ? ` ×${r.n}` : ""}<div class="sub">${esc(DISC[r.d])} Lv ${r.lvl}${r.type === "Equipment" ? " · plain equip" : ""}${rough(r.id) ? ` <span class="pill p-warn" title="${esc(roughWhy(r.id))}">rough</span>` : ""}</div></span></span>`;
const plus = v => `<b class="${v > 0 ? "up" : "down"}">${v > 0 ? "+" : ""}${fmt(Math.round(v))}</b>`;

function draw(){
  if ($("#craft").hidden || $("#crp-plan").hidden) return;
  setLevels();
  const inv = inventory(), have = [...inv].filter(x => x[1] > 0);
  // inventory line: hand-typed items can be removed here; screenshots on the Price check
  const shots = window.INVP?.reads() || 0;
  $("#cpinv").innerHTML = have.length ? `${shots ? `${shots} screenshot${shots > 1 ? "s" : ""} read (<a href="#" data-cpgo="inv">see them on Price check</a>) · ${invPeek(window.INVP.counts())} · <button class="linkbtn" type="button" id="cpclear">clear screenshots</button>` : "No screenshots yet"}${Object.keys(S.hand).length ? ` · by hand: ${Object.entries(S.hand).map(([id, n]) => `<span class="pill">${esc(D.items[id].n)} ×${fmt(n)} <button class="linkbtn" type="button" data-cprm="${id}" aria-label="Remove ${esc(D.items[id].n)}">✕</button></span>`).join(" ")}` : ""} · ${fmt(have.length)} kind${have.length === 1 ? "" : "s"} of item in all.` : "Nothing in your inventory yet: add screenshots or type items in.";
  if (!ALLOWED.length){
    for (const s of ["#cpnow", "#cpalm"]) $(s).innerHTML = `<tr><td colspan="5" class="empty">Set a craft level above 0 for a profession you've learned.</td></tr>`;
    $("#cpnowc").textContent = ""; $("#cpnowx").textContent = "";
    $("#cptot").innerHTML = `<p class="empty">Set a craft level and add your inventory above: the best mix of crafts from what you hold shows here.</p>`; return }   // second audit #13
  const now = [], almost = []; let loss = 0, unpriced = 0;
  for (const r of ALLOWED){
    if (!worth(r.id)){ unpriced++; continue }
    const T = maxTimes(r, inv);
    if (T){ const one = run(r, 1, new Map(inv)), all = run(r, T, new Map(inv)), each = value(r, 1) - one.fee - cost(one.used), tot = value(r, T) - all.fee - cost(all.used);
      if (each > 0) now.push({r, T, one, each, tot}); else loss++; continue }
    const one = run(r, 1, new Map(inv)); if (!Object.keys(one.used).length) continue;   // none of its materials in hand
    const miss = Object.entries(one.miss).map(([id, n]) => ({id, n, f: farm(id), b: buyEach(id)}));
    if (miss.some(m => !m.f.length && !isFinite(m.b))) continue;   // no known way to get one of them
    const base = value(r, 1) - one.fee - cost(one.used), bought = miss.reduce((a, m) => a + m.n * m.b, 0);
    // farmed = free, except what can only be bought
    const farmed = base - miss.reduce((a, m) => a + (m.f.length ? 0 : m.n * m.b), 0), hrs = miss.reduce((a, m) => a + (m.f.length ? m.n / m.f[0].hr : 0), 0);
    if (Math.max(farmed, base - bought) > 0) almost.push({r, one, miss, farmed, bought: isFinite(bought) ? base - bought : null, hrs});
  }
  now.sort((a, b) => b.tot - a.tot);
  $("#cpnowc").textContent = `${fmt(now.length)} recipe${now.length === 1 ? "" : "s"}`;
  lazyRows($("#cpnow"), now.map(x => `<tr><td>${made(x.r)}</td><td class="sub">${ings(x.one.used)}${x.one.fee ? `<div>fee ${fmt(x.one.fee)}</div>` : ""}${x.one.parts.length ? `<div>crafts ${x.one.parts.map(([p, b]) => `${fmt(b * p.n)} ${esc(D.items[p.id].n)}`).join(", ")} first</div>` : ""}</td>
    <td class="num">${fmt(x.T)}<div class="sub">${fmt(x.one.exp)} EXP each</div></td><td class="num">${plus(x.each)}</td><td class="num">${plus(x.tot)}</td></tr>`),
    `<tr><td colspan="5" class="empty">${have.length ? "Nothing you hold makes a profitable craft at these levels." : "Add your inventory to see what you can craft."}</td></tr>`);
  $("#cpnowx").textContent = [loss ? `${loss} more you could make would lose mesos (hidden).` : "", unpriced ? `${unpriced} recipe${unpriced > 1 ? "s" : ""} at your levels have no price for the result (no sales seen, no NPC price) and are left out.` : ""].filter(Boolean).join(" ");
  almost.sort((a, b) => b.farmed - a.farmed);
  lazyRows($("#cpalm"), almost.slice(0, 40).map(x => `<tr><td>${made(x.r)}<div class="sub">you have ${ings(x.one.used)}</div></td>
    <td class="sub">${x.miss.map(m => `<div class="sning">${itemIcon(m.id, 1, true)} ${fmt(m.n)} ${nm(m.id)}</div>`).join("")}</td>
    <td class="sub">${x.miss.map(m => `<div>${m.f.length ? m.f.map(f => `${mapLink(f.map, f.name)} <span class="sub">(${f.who.map(w => esc(D.mobs[w]?.[0] || "")).join(", ")})</span> ~${dur(m.n / f.hr)}${f.real ? ` <span class="pill p-good" title="Drop count from grind tracker players' shared runs">players' drops</span>` : ""}`).join(" · ") : `buy: ${isFinite(m.b) ? `${fmt(m.b)} each (${buyHow(m.id)})` : "no source known"}`}</div>`).join("")}${x.miss.length > 1 && x.hrs ? `<div>about ${dur(x.hrs)} in all (est.)</div>` : ""}</td>
    <td class="num">${plus(x.farmed)}</td><td class="num">${x.bought != null ? plus(x.bought) : "–"}${x.bought != null ? `<div class="sub">${x.miss.map(m => isFinite(m.b) ? `${fmt(m.b)} ${buyHow(m.id)}` : "").filter(Boolean).join(", ")}</div>` : ""}</td></tr>`),
    `<tr><td colspan="5" class="empty">${have.length ? "No recipe at your levels is a few materials away from a profit." : "Add your inventory to see what you're close to."}</td></tr>`);
  // best mix from what you hold: best profit per craft first, each as many times as what's left allows
  const left = new Map(inv), mix = []; let items = 0, profit = 0, fees = 0, exp = 0;
  for (const x of [...now].sort((a, b) => b.each - a.each)){
    const T = maxTimes(x.r, left); if (!T) continue;
    const o = run(x.r, T, left), p = value(x.r, T) - o.fee - cost(o.used); if (p <= 0) continue;
    mix.push({r: x.r, T, p}); items += T * x.r.n; profit += p; fees += o.fee; exp += o.exp;
  }
  $("#cptot").innerHTML = mix.length ? `<p class="cpbig">Make <b>${fmt(items)} item${items === 1 ? "" : "s"}</b> for <b class="up">+${fmt(Math.round(profit))} mesos</b> ${S.free ? "over the craft fees" : "more than selling the materials"}.</p>
    <p class="sub">${fmt(fees)} mesos in fees · ${fmt(exp)} craft EXP · sold at the usual price, which isn't a promise anyone buys.</p>
    <div class="tblwrap"><table class="mini"><tbody>${mix.map(m => `<tr><td>${made(m.r)}</td><td class="num">×${fmt(m.T)}</td><td class="num">${plus(m.p)}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="empty">${have.length ? "Nothing to craft for a profit from what you hold right now." : "Add your inventory to get a plan."}</p>`;
}

/* controls */
document.querySelectorAll(".crcap").forEach(e => e.textContent = CRAFT_CAP); $("#cpdate").textContent = D.pw?.read || "?";
$("#cplv").innerHTML = DISC.map((n, i) => `<label class="lab">${esc(n)}<select data-cpd="${i}">${Array.from({length: CRAFT_CAP + 1}, (_, k) => `<option value="${k}">${k ? "Lv " + k : "not learned"}</option>`).join("")}</select></label>`).join("");
$("#cplv").querySelectorAll("select").forEach(s => s.value = S.lv[+s.dataset.cpd]);
$("#cpcls").value = S.cls; $("#cplvl").value = S.L; $("#cpfree").value = S.free;
$("#cplv").addEventListener("change", e => { const i = e.target.dataset.cpd; if (i == null) return; S.lv[+i] = +e.target.value; save(); document.dispatchEvent(new Event("craftlv")) });
$("#cpcls").addEventListener("change", e => { S.cls = CLS.includes(e.target.value) ? e.target.value : "Warrior"; save(); draw() });
$("#cplvl").addEventListener("change", e => { S.L = Math.min(MAX_LEVEL, Math.max(1, Math.round(+e.target.value) || 25)); e.target.value = S.L; save(); draw() });
$("#cpfree").addEventListener("change", e => { S.free = e.target.value === "1" ? 1 : 0; save(); draw() });
// hand entry: every item a recipe uses or makes
const BYNAME = {}; for (const r of RECS) for (const id of [r.id, ...r.ing.map(x => x[0])]) if (D.items[id]) BYNAME[D.items[id].n.toLowerCase()] ??= id;
$("#cpitems").innerHTML = Object.values(BYNAME).sort((a, b) => D.items[a].n.localeCompare(D.items[b].n)).map(id => `<option value="${esc(D.items[id].n)}">`).join("");
function addHand(){
  const id = BYNAME[$("#cpitem").value.trim().toLowerCase()], n = Math.round(+$("#cpn").value);
  if (!id){ $("#cpst").textContent = "Pick an item from the list"; $("#cpst").className = "pill p-warn"; return }
  if (!(n >= 1 && n <= 9999)){ $("#cpst").textContent = "Count: 1 to 9,999"; $("#cpst").className = "pill p-warn"; return }
  S.hand[id] = Math.min(99999, (S.hand[id] || 0) + n); save(); $("#cpitem").value = ""; $("#cpst").textContent = ""; $("#cpst").className = "pill"; draw();
}
$("#cpaddb").addEventListener("click", addHand);
$("#cpitem").addEventListener("keydown", e => { if (e.key === "Enter") addHand() });
$("#craft").addEventListener("click", e => {
  const go = e.target.closest("[data-cpgo]"); if (go){ e.preventDefault(); $("#t-" + go.dataset.cpgo).click(); return }
  if (e.target.id === "cpclear"){ window.INVP?.clear(); return }
  const rm = e.target.dataset.cprm; if (rm){ delete S.hand[rm]; save(); draw() }
});
async function shots(files){
  const f = [...files].filter(x => x.type.startsWith("image/")); if (!f.length || !window.INVP) return;
  $("#cpst").textContent = "Reading…"; $("#cpst").className = "pill";
  await window.INVP.handle(f);
  $("#cpst").textContent = $("#ivst").textContent; $("#cpst").className = $("#ivst").className;
}
const drop = $("#cpdrop");
drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over") });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); shots(e.dataTransfer.files) });
$("#cpfile").addEventListener("change", e => { shots(e.target.files); e.target.value = "" });
document.addEventListener("paste", e => { if ($("#craft").hidden || $("#crp-plan").hidden) return; const f = [...(e.clipboardData?.files || [])]; if (f.length){ e.preventDefault(); shots(f) } });
// redraws on craftlv / invupdate / tab opens come from 45-crafting.js (only the open tab draws)
window.CPLAN = {make: (r, t, inv) => (setLevels(), run(r, t, inv)), maxTimes: (r, inv) => (setLevels(), maxTimes(r, inv)), farm, worth, S,
  RECS, inventory, draw, rough, roughWhy, buyEach, buyHow};   // Crafting tabs + tests
})();
