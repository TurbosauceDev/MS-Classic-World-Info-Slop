/* ---------------- item database ---------------- */
(() => {
// every item in the launch game files (D.items: equipment, use, etc, setup, scrolls). Clicking an item (here, or any item
// icon / .iname anywhere on the page) opens its own page: stats, where to get it (meowdb drop reports, NPC shops, crafting,
// quest rewards) and what wants it (quests, recipes).
const CAT = {Equipment: "Equip", Consumable: "Use", Etc: "Etc", Setup: "Setup", Scroll: "Scroll"};
const MAKE = {}, USE = {}; for (const r of D.craft.rec){ (MAKE[r[3]] = MAKE[r[3]] || []).push(r); for (const [id] of r[7]) (USE[id] = USE[id] || []).push(r) }
const DISC = D.craft.disc.map(d => d[0]);
const REW = {}, WANT = {};
for (const [src, list] of [["q", QLAUNCH], ["cit", D.citq]]) for (const r of list){
  for (const g of r.ri || []) for (const [id, n, ch] of g.it) (REW[id] = REW[id] || []).push([src, r, n, ch, g.k === "pick" ? "pick one" : g.k === "rand" ? "random" : "", g.job]);
  for (const [name, n] of r.il || []) (WANT[name] = WANT[name] || []).push([src, r, n]);
}
// names shared by several items (male/female versions, quest copies): quests ask by name, so give WANT to the non-equipment one
const BYNAME = {}; for (const [id, it] of Object.entries(D.items)) (BYNAME[it.n] = BYNAME[it.n] || []).push(id);
const wantsOf = (id, it) => { const ids = BYNAME[it.n]; return ids.length > 1 && it.c === "Equipment" && ids.some(x => D.items[x].c !== "Equipment") ? [] : WANT[it.n] || [] };
const WSRC_BY_ID = {}; for (const w of D.weapons) if (D.wsrc[w[0]]) WSRC_BY_ID[w[12]] = D.wsrc[w[0]];
const mobId = name => Object.keys(D.mobdb).find(k => D.mobdb[k].name === name);

const I = Object.entries(D.items).map(([id, it]) => {
  const drops = (D.drops[id] || []).filter(([m]) => D.mobdb[m]), named = (D.craft.src[id]?.mob || []).filter(m => D.mobdb[m] && !drops.some(x => x[0] === m));
  const wdrop = (WSRC_BY_ID[id]?.drops || []).map(([n, lv]) => [mobId(n), n, lv]);
  const shop = [...(D.ishop[id] || [])], ss = D.shopsell[id]; if (ss && !shop.some(s => s[0] === ss[0])) shop.push([ss[0], "", ss[1], ss[2]]);
  const o = {id, it, cat: CAT[it.c] || it.c || "Other", lv: it.st?.reqLevel || 0, drops, named, wdrop, shop, make: MAKE[id] || [], rew: REW[id] || []};
  o.src = [drops.length || named.length || wdrop.length ? "drop" : "", shop.length ? "shop" : "", o.make.length ? "craft" : "", o.rew.length ? "quest" : ""].filter(Boolean);
  o.hay = [it.n, it.wt || it.s, ...drops.map(([m]) => D.mobdb[m].name), ...named.map(m => D.mobdb[m].name), ...wdrop.map(x => x[1])].join("|").toLowerCase();
  return o;
});
const OPEN = {}; for (const o of I) OPEN[o.id] = o;
const SLOTS = [...new Set(I.filter(o => o.it.c === "Equipment").map(o => o.it.s === "Weapon" ? o.it.wt : o.it.s))].sort();
$("#itslot").innerHTML += SLOTS.map(s => `<option>${esc(s)}</option>`).join("");

let S = {q: "", cat: "", slot: "", job: "", src: true, sort: "name", dir: 1, open: null, all: false};
try { Object.assign(S, JSON.parse(localStorage.getItem("items") || "{}"), {q: "", open: null, all: false}) } catch(e) {}
const save = () => { try { localStorage.setItem("items", JSON.stringify(S)) } catch(e) {} };
for (const [k, el] of [["cat", "#itcat"], ["slot", "#itslot"], ["job", "#itjob"]]) $(el).value = S[k];
$("#itsrc").checked = S.src;

const qn = ([src, r]) => `<span class="name qname" tabindex="0" data-src="${src}" data-i="${(src === "cit" ? D.citq : D.quests).indexOf(r)}">${esc(r.name)}</span>`;
const mob = id => `<span class="mobname" tabindex="0" data-mob="${id}">${esc(D.mobdb[id].name)}</span> <span class="sub">Lv ${D.mobdb[id].level}</span>`;
const place = ([npc, mid, map]) => `${npcLink(npc)} <span class="sub">in</span> ${mid && (D.mapnames[mid] != null || D.maps[mid]) ? mapLink(mid, map) : esc(map)}`;
const iname = (id, n) => D.items[id] ? `<span class="iname">${itemIcon(id, n || 1, true)}<span class="itname" tabindex="0" data-item="${id}" data-n="${n || 1}">${esc(D.items[id].n)}</span>${n > 1 ? ` <span class="sub">×${fmt(n)}</span>` : ""}</span>` : "";
const typeOf = it => it.c === "Equipment" ? (it.s === "Weapon" ? it.wt : it.s) : it.c === "Scroll" ? `Scroll for ${it.s}` : CAT[it.c] || it.c;
const jobOk = (it, j) => !j || (j === "Beginner" ? !it.job || it.job === "All" : (it.job || "All") === "All" || it.job.split("/").includes(j));
const keyStats = it => { const s = it.st || {};
  return [s.incPAD && `ATK ${s.incPAD}`, s.incMAD && `M.ATK ${s.incMAD}`, s.incPDD && `DEF ${s.incPDD}`, s.incMDD && `M.DEF ${s.incMDD}`,
    ...["STR", "DEX", "INT", "LUK"].filter(k => s["inc" + k]).map(k => `${k} +${s["inc" + k]}`), s.incMHP && `HP +${s.incMHP}`, s.incMMP && `MP +${s.incMMP}`,
    s.incACC && `ACC +${s.incACC}`, s.incEVA && `AVOID +${s.incEVA}`, s.incSpeed && `Speed +${s.incSpeed}`, s.incJump && `Jump +${s.incJump}`,
    ...Object.entries(it.sp || {}).filter(([k]) => SPEC[k]).map(([k, v]) => SPEC[k].replace("{}", fmt(v)))].filter(Boolean).join(" · ") };
const SRCPILL = {drop: ["drops", "p-warn"], shop: ["shop", "p-good"], craft: ["craft", "p-hot"], quest: ["quest", "p-hot"]};

function page(o){
  const it = o.it, s = it.st || {}, st = (k, v, t) => v == null || v === "" ? "" : `<div${t ? ` title="${esc(t)}"` : ""}><dt>${k}</dt><dd>${v}</dd></div>`;
  const isEq = it.c === "Equipment";
  const flags = [`<span class="pill p-hot">${esc(typeOf(it))}</span>`, isEq && it.job && it.job !== "All" && `<span class="pill p-warn">${esc(it.job)} only</span>`,
    isEq && (!it.job || it.job === "All") && `<span class="pill p-good">any job</span>`, it.g && `<span class="pill p-warn">${esc(it.g)} only</span>`,
    !o.src.length && `<span class="pill p-bad" title="No drop report, shop, recipe or quest reward we know of">no known source</span>`].filter(Boolean).join(" ");
  const stats = isEq ? [st("Required level", s.reqLevel ?? 0), ...["STR", "DEX", "INT", "LUK"].map(k => st("Req " + k, s["req" + k] || null)),
      ...Object.entries(STATNAME).map(([k, l]) => st(l, s[k] ? "+" + s[k] : null)), st("Attack speed", it.spd), st("Upgrade slots", s.tuc, "Scrolls you can use on it")].join("")
    : [...Object.entries(it.sp || {}).filter(([k]) => SPEC[k]).map(([k, v]) => st("Effect", SPEC[k].replace("{}", fmt(v)))),
      st("Lasts", it.sp?.time ? Math.round(it.sp.time / 60000) + " min" : null), st("Stack size", s.slotMax)].join("");
  const sell = it.p ? `${fmt(it.p)} mesos` : `<span class="sub">can't be sold to NPCs (or no price in the game files)</span>`;
  const sure = o.drops.filter(x => x[1] >= 1);
  const drops = [...sure.sort((a, b) => b[1] - a[1]).map(([m, v]) => `<li>${mob(m)} <span class="sub">+${v}</span></li>`),
    ...o.named.map(m => `<li>${mob(m)} <span class="sub">${D.craft.src[o.id]?.meow?.includes(m) ? "meowdb farming guide" : "named after it in the game files"}</span></li>`),
    ...o.wdrop.filter(x => !sure.some(y => y[0] === x[0])).map(([m, n, lv]) => `<li>${m ? mob(m) : `${esc(n)} <span class="sub">Lv ${lv}</span>`} <span class="sub">${WSRC_BY_ID[o.id].dropsFrom === "msea" ? "old MapleSEA list, likely" : "player report"}</span></li>`)].join("");
  const shops = o.shop.sort((a, b) => a[3] - b[3]).map(x => `<li>${place(x)} <span class="sub">${fmt(x[3])} mesos</span></li>`).join("");
  const recipe = r => `<li><b>${esc(DISC[r[0]])}</b> <span class="sub">craft Lv ${r[2]} · ${fmt(r[6])} mesos${r[4] > 1 ? ` · makes ${r[4]}` : ""}</span><div class="ilist">${r[7].map(([id, n]) => iname(id, n)).join("")}</div></li>`;
  const rew = o.rew.map(([src, r, n, ch, k, job]) => `<li>${qn([src, r])} <span class="sub">${[n > 1 && "×" + fmt(n), k, ch != null && ch + "% chance", job && job !== "Any Class" && job].filter(Boolean).map(esc).join(" · ")}</span></li>`).join("");
  const want = wantsOf(o.id, it), uses = USE[o.id] || [];
  const wants = want.map(x => `<li>${qn(x)} <span class="sub">×${fmt(x[2])}${x[1].lvl ? ` · Lv ${x[1].lvl}` : ""}</span></li>`).join("");
  const makes = uses.map(r => `<li>${iname(r[3], r[4])} <span class="sub">${esc(DISC[r[0]])} Lv ${r[2]} · needs ${r[7].find(x => x[0] === o.id)[1]}</span></li>`).join("");
  const others = BYNAME[it.n].filter(x => x !== o.id).map(x => `<button class="linkbtn" data-iopen="${x}">${D.items[x].g ? esc(D.items[x].g) + " version" : D.items[x].c === it.c ? "ID " + x : esc(typeOf(D.items[x]))}</button>`).join(", ");
  // equipment: the same slot and job, nearest required level
  const like = isEq ? I.filter(x => x.id !== o.id && x.it.c === "Equipment" && typeOf(x.it) === typeOf(it) && (x.it.job || "All") === (it.job || "All") && (!it.g || !x.it.g || x.it.g === it.g))
    .sort((a, b) => Math.abs(a.lv - o.lv) - Math.abs(b.lv - o.lv) || a.lv - b.lv).slice(0, 8).sort((a, b) => a.lv - b.lv) : [];
  const card = (h, body, empty) => `<div><h4>${h}</h4>${body ? `<ul class="mlist">${body}</ul>` : `<p class="sub">${empty}</p>`}</div>`;
  return `<div class="mpage">
    <div class="mpbar"><button class="btn" id="itback">← All items</button><button class="btn" id="itshare">Copy link</button></div>
    <div class="mtop">${D.iicons[o.id] ? `<img class="sprite" src="data:image/png;base64,${D.iicons[o.id]}" alt="">` : ""}<div><h2>${esc(it.n)}</h2>
      <p class="sub">${esc(typeOf(it))}${isEq ? ` · level ${s.reqLevel || 0}+` : ""} · sells for ${it.p ? fmt(it.p) + " mesos" : "–"} · item ID ${o.id}${others ? ` · same name: ${others}` : ""}</p><p class="mflags">${flags}</p></div></div>
    ${it.d ? `<p class="idesc">${esc(it.d).replace(/\n/g, "<br>")}</p>` : ""}
    ${stats ? `<h3 class="msec">Stats</h3><dl class="stats mgrid">${stats}</dl>` : ""}
    <h3 class="msec">Where to get it</h3>
    <div class="mcols">
      ${card(`Monster drops <span class="sub">(meowdb player reports, + = net votes)</span>`, drops, "No drop reports yet.")}
      ${card("Sold by", shops, "No NPC shop sells it (meowdb shop list).")}
      ${card("Crafted", (o.make).map(recipe).join(""), "No recipe makes it.")}
      ${card("Quest reward", rew, "No quest gives it.")}
    </div>
    <h3 class="msec">What it's for</h3>
    <div class="mcols">
      ${card("Quests that want it", wants, "No quest asks for it.")}
      ${card("Crafting recipes that use it", makes, "No recipe uses it.")}
      <div><h4>Selling</h4><p>${sell}</p></div>
    </div>
    ${like.length ? `<h3 class="msec">Similar ${esc(typeOf(it))} for ${esc(it.job && it.job !== "All" ? it.job : "any job")}</h3><div class="tblwrap"><table class="mini"><thead><tr><th>Item</th><th class="num">Lv</th><th>Stats</th><th>Get it</th></tr></thead>
      <tbody>${like.map(x => `<tr><td><button class="linkbtn" data-iopen="${x.id}">${esc(x.it.n)}</button>${x.it.g ? ` <span class="sub">${esc(x.it.g)}</span>` : ""}</td><td class="num">${x.lv}</td><td class="sub">${esc(keyStats(x.it))}</td><td>${srcPills(x)}</td></tr>`).join("")}</tbody></table></div>` : ""}
  </div>`;
}
const srcPills = o => o.src.map(k => `<span class="pill ${SRCPILL[k][1]}">${SRCPILL[k][0]}</span>`).join(" ") || `<span class="sub">–</span>`;

const COLS = {name: o => o.it.n, type: o => typeOf(o.it), lv: o => o.lv, price: o => o.it.p || 0};
function render(){
  const q = S.q.trim().toLowerCase(), f = COLS[S.sort] || COLS.name;
  const rows = I.filter(o => (!S.cat || o.cat === S.cat) && (!S.slot || typeOf(o.it) === S.slot) && jobOk(o.it, S.job) && (!S.src || o.src.length) && (!q || o.hay.includes(q)))
    .sort((a, b) => { const x = f(a), y = f(b); return (typeof x === "string" ? x.localeCompare(y) : x - y) * S.dir || a.it.n.localeCompare(b.it.n) });
  document.querySelectorAll("#ithead th[data-k]").forEach(th => { const on = th.dataset.k === S.sort;
    th.setAttribute("aria-sort", on ? (S.dir > 0 ? "ascending" : "descending") : "none");
    th.querySelector("button").dataset.arrow = on ? (S.dir > 0 ? "▲" : "▼") : "" });
  $("#itcount").textContent = `${fmt(rows.length)} item${rows.length === 1 ? "" : "s"}`;
  const cap = S.all ? rows.length : 150;
  $("#itrows").innerHTML = rows.slice(0, cap).map(o => `<tr data-id="${o.id}"><td><button class="mbtn ibtn">${D.iicons[o.id] ? `<img src="data:image/png;base64,${D.iicons[o.id]}" alt="">` : "<i></i>"}<span><b>${esc(o.it.n)}</b>${o.it.g ? ` <span class="sub">${esc(o.it.g)}</span>` : ""}</span></button></td>
      <td>${esc(typeOf(o.it))}</td><td class="num">${o.it.c === "Equipment" ? o.lv : ""}</td><td class="sub">${o.it.c === "Equipment" ? esc(o.it.job || "All") : ""}</td>
      <td class="sub">${esc(keyStats(o.it))}</td><td class="num">${o.it.p ? fmt(o.it.p) : "–"}</td><td>${srcPills(o)}</td></tr>`).join("")
    || `<tr><td colspan="7" class="sub">No item matches.</td></tr>`;
  $("#itmore").hidden = rows.length <= cap; $("#itmore").textContent = `Show all ${fmt(rows.length)}`;
}
function show(){
  const o = S.open && OPEN[S.open];
  $("#itlist").hidden = !!o; $("#itpage").hidden = !o;
  if (!o){ render(); return }
  $("#itpage").innerHTML = page(o);
}
function openItem(id, scroll = true){ S.open = String(id); save(); show(); if (scroll) $("#items").scrollIntoView({block: "start"}) }
$("#itsearch").addEventListener("input", e => { S.q = e.target.value; S.all = false; render() });
for (const [k, el] of [["cat", "#itcat"], ["slot", "#itslot"], ["job", "#itjob"]]) $(el).addEventListener("change", e => { S[k] = e.target.value; S.all = false; save(); render() });
$("#itsrc").addEventListener("change", e => { S.src = e.target.checked; save(); render() });
$("#itmore").addEventListener("click", () => { S.all = true; render() });
document.querySelectorAll("#ithead th[data-k] button").forEach(b => b.addEventListener("click", () => {
  const k = b.parentElement.dataset.k; S.dir = S.sort === k ? -S.dir : (k === "name" || k === "type" ? 1 : -1); S.sort = k; save(); render();
}));
$("#itrows").addEventListener("click", e => { const b = e.target.closest(".ibtn"); if (b) openItem(b.closest("tr").dataset.id) });
$("#itpage").addEventListener("click", e => {
  if (e.target.id === "itback"){ S.open = null; save(); show(); return }
  if (e.target.id === "itshare") return copyShare(e.target, shareUrl("i", S.open));
  const l = e.target.closest("[data-iopen]"); if (l) openItem(l.dataset.iopen);
});
// any item icon or item name on the page (quests, monsters, crafting, keep or sell...) opens its page here; not when the
// icon sits inside a control that does something else
document.addEventListener("click", e => { const el = e.target.closest && e.target.closest(".ri, .itname");
  if (!el || !OPEN[el.dataset.item] || el.closest("button, label, a, summary, select")) return;
  hideQtip(); $("#t-items").click(); openItem(el.dataset.item) });
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches && e.target.matches(".ri, .itname")) e.target.click() });
if (HASH.i && OPEN[HASH.i]) S.open = String(HASH.i);
show();
})();
