/* ---------------- monster database ---------------- */
(() => {
// every monster you can meet at launch (D.mobdb, straight from the export): stats, attacks, skills, spawn maps, meowdb
// player drop reports and mesos, plus the quests and recipes that want it. Click a row for the full card.
const M = Object.entries(D.mobdb).map(([id, m]) => {
  const kind = m.maps.every(x => x[4] === "KPQ") ? "kpq" : m.maps.every(x => x[4] === "2nd job test") ? "job"
    : m.special === "Jump Quest" ? "jq" : m.is_boss ? "boss" : "field";
  return {id, m, kind, ratio: m.exp / m.hp};
});
const KIND = {boss: ["Boss", "p-bad"], jq: ["Jump quest", "p-warn"], kpq: ["KPQ", "p-hot"], job: ["2nd job test", "p-hot"], field: ["", ""]};
// quests that want a kill or an item from this monster (by id when the game data says so)
const QK = {}, QI = {};
for (const [src, list] of [["q", QLAUNCH], ["cit", D.citq]]) for (const r of list){
  for (const [mid, n] of r.kl || []) (QK[mid] = QK[mid] || []).push([src, r, n]);
  for (const [name, n, mid] of r.il || []) if (mid) (QI[mid] = QI[mid] || []).push([src, r, n, name]);
}
const MAT = {}; for (const [iid, s] of Object.entries(D.craft.src)) for (const mid of s.mob || []) (MAT[mid] = MAT[mid] || []).push(iid);
for (const o of M) o.hay = [o.m.name, ...o.m.maps.map(x => x[1]), ...o.m.dr.map(x => x[1])].join("|").toLowerCase();

let S = {q: "", kind: "", sort: "level", dir: 1, open: null};
try { Object.assign(S, JSON.parse(localStorage.getItem("mobs") || "{}"), {q: ""}) } catch(e) {}
const save = () => { try { localStorage.setItem("mobs", JSON.stringify(S)) } catch(e) {} };
$("#mbkind").value = S.kind;

const qn = ([src, r]) => `<span class="name qname" tabindex="0" data-src="${src}" data-i="${(src === "cit" ? D.citq : D.quests).indexOf(r)}">${esc(r.name)}</span>`;
const icon = (id, n) => D.items[id]
  ? `<span class="ri" tabindex="0" data-item="${id}" data-n="${n || 1}">${D.iicons[id] ? `<img src="data:image/png;base64,${D.iicons[id]}" alt="${esc(D.items[id].n)}">` : "<i></i>"}</span>` : "";
const secs = t => { const [lo, hi] = String(t).split(/[-\s]/); const f = s => { s = +s; return s >= 120 ? `${+(s / 60).toFixed(1)} min` : `${+s.toFixed(1)} s` };
  return hi && hi !== lo && !hi.startsWith("[") ? `${f(lo)} – ${f(hi)}` : f(lo) };
const EL = (e, v) => `<span class="pill ${v === "Weak" ? "p-good" : v === "Immune" ? "p-bad" : "p-warn"}">${v === "Weak" ? "weak to" : v === "Immune" ? "immune to" : "resists"} ${esc(e)}</span>`;

function card(o){
  const m = o.m, st = (k, v, t) => v == null ? "" : `<div${t ? ` title="${esc(t)}"` : ""}><dt>${k}</dt><dd>${v}</dd></div>`;
  const flags = [o.kind !== "field" && `<span class="pill ${KIND[o.kind][1]}">${KIND[o.kind][0]}</span>`,
    m.is_boss && o.kind !== "boss" && `<span class="pill p-bad">boss</span>`,
    m.special && o.kind !== "jq" && o.kind !== "kpq" && `<span class="pill p-hot">${esc(m.special)}</span>`,
    m.aggro && `<span class="pill p-bad" title="Attacks on sight">aggressive</span>`, m.undead && `<span class="pill p-warn">undead</span>`,
    m.invincible && `<span class="pill p-warn" title="Can't be damaged">invincible</span>`, m.passive && `<span class="pill p-good">never attacks</span>`,
    ...Object.entries(m.elements || {}).map(([e, v]) => EL(e, v))].filter(Boolean).join(" ");
  const atk = (m.attacks || []).map(a => `<li><b>Attack ${a.index}</b> ${[a.magic ? "magic" : "physical", a.element, a.status && `${a.status}${a.status_level ? " Lv " + a.status_level : ""}`,
    a.jump && "jumps", a.ratio && `${a.ratio}% of its ${a.magic ? "magic" : "touch"} attack`, a.mp && `${a.mp} MP`, a.delay && `${secs(a.delay / 1000)} recovery`].filter(Boolean).map(esc).join(" · ")}</li>`).join("");
  const skill = (s, what) => `<li>${D.mskill[s.id] ? `<img class="mskill" src="data:image/png;base64,${D.mskill[s.id]}" alt="">` : ""}<b>${esc(/^Skill \d+$/.test(s.name) ? `${what} #${s.id}` : s.name)}</b> Lv ${s.level} ${[s.x != null && (what === "Self buff" ? `+${s.x}%` : `${s.x}% effect`), s.prop != null && `${s.prop}% chance`, s.time != null && `lasts ${secs(s.time)}`, s.interval != null && `every ${secs(s.interval)}`].filter(Boolean).join(" · ")}</li>`;
  const skills = (m.self_buffs || []).map(s => skill(s, "Self buff")).join("") + (m.debuffs || []).map(s => skill(s, "Debuff")).join("");
  const rev = (m.revives || []).map(r => `${r.count} × ${D.mobdb[r.id] ? `<button class="linkbtn" data-open="${r.id}">${esc(r.name)}</button>` : esc(r.name)}`).join(", ");
  const maps = m.maps.map(([mid, name, n, t, k]) => `<li>${D.mapnames[mid] != null || D.maps[mid] ? mapLink(mid, name) : esc(name)}${k ? ` <span class="pill p-hot">${esc(k)}</span>` : ""} <span class="sub">×${n}${t ? ` · respawn ${esc(secs(t))}${/\[/.test(t) ? " (varies by spot)" : ""}` : ""}</span></li>`).join("");
  const sure = m.dr.filter(x => x[2] >= 1), maybe = m.dr.filter(x => x[2] < 1);
  const drop = x => D.items[x[0]] ? `<span class="mdrop">${icon(x[0])}<span>${esc(x[1])}${x[2] >= 1 ? ` <span class="sub">+${x[2]}</span>` : ""}</span></span>` : `<span class="mdrop"><span>${esc(x[1])}${x[2] >= 1 ? ` <span class="sub">+${x[2]}</span>` : ""}</span></span>`;
  const qk = QK[o.id] || [], qi = QI[o.id] || [], mats = MAT[o.id] || [];
  const quests = [...qk.map(x => `<li>${qn(x)} <span class="sub">hunt ${fmt(x[2])}</span></li>`), ...qi.map(x => `<li>${qn(x)} <span class="sub">${esc(x[3])} ×${fmt(x[2])}</span></li>`)].join("");
  const meso = m.meso ? `${fmt(m.meso[0])} <span class="sub">avg per kill (${m.meso[2]}–${m.meso[3]} mesos, ${m.meso[4]}% of kills, ${m.meso[1]} report${m.meso[1] > 1 ? "s" : ""})</span>` : `<span class="sub">no player reports yet</span>`;
  return `<div class="mcard">
    <div class="mtop">${D.mobimg[o.id] ? `<img class="sprite" src="data:image/png;base64,${D.mobimg[o.id]}" alt="">` : ""}<div><h3>${esc(m.name)} <span class="sub">Lv ${m.level} · id ${o.id}</span></h3>${flags ? `<p class="mflags">${flags}</p>` : ""}</div></div>
    <dl class="stats mgrid">${st("HP", fmt(m.hp))}${st("MP", m.mp != null ? fmt(m.mp) : null)}${st("EXP", fmt(m.exp))}${st("EXP per 100 HP", (o.ratio * 100).toFixed(1))}
      ${st("Touch attack", m.PADamage)}${st("Magic attack", m.MADamage)}${st("Weapon DEF", m.PDDamage ?? 0)}${st("Magic DEF", m.MDDamage ?? 0)}
      ${st("Accuracy", m.acc)}${st("Avoid", m.eva ?? 0)}${st("Speed", m.speed != null ? (m.speed > 0 ? "+" : "") + m.speed : null, "Movement speed modifier from the game files")}
      ${st("Knockback at", m.pushed != null ? fmt(m.pushed) : null, "A hit must do at least this much damage to knock it back")}
      ${st("Stagger", m.stagger ? (m.stagger / 1000).toFixed(2) + " s" : null, "How long it can't move or attack after being hit (length of its hit animation)")}
      ${st("HP regen", m.hp_recovery, "Per regen tick")}${st("MP regen", m.mp_recovery, "Per regen tick")}</dl>
    <div class="mcols">
      <div><h4>Where it spawns</h4><ul class="mlist">${maps}</ul></div>
      <div><h4>Drops <span class="sub">(meowdb player reports, + = net votes)</span></h4>
        ${sure.length ? `<div class="mdrops">${sure.map(drop).join("")}</div>` : `<p class="sub">No confirmed drops reported yet.</p>`}
        ${maybe.length ? `<p class="sub">Reported, not confirmed yet:</p><div class="mdrops dim">${maybe.map(drop).join("")}</div>` : ""}
        ${mats.length ? `<p class="sub">Crafting materials it's known for:</p><div class="ricons">${mats.map(i => icon(i)).join("")}</div>` : ""}
        <h4>Mesos</h4><p>${meso}</p></div>
      ${atk || skills || rev ? `<div><h4>Attacks and skills</h4><ul class="mlist">${atk}${skills}${rev ? `<li><b>When it dies</b> splits into ${rev}</li>` : ""}</ul>${!atk ? `<p class="sub">No special attacks: it only hurts on touch.</p>` : ""}</div>` : ""}
      ${quests ? `<div><h4>Quests that want it</h4><ul class="mlist">${quests}</ul></div>` : ""}
    </div></div>`;
}

const COLS = {name: o => o.m.name, level: o => o.m.level, hp: o => o.m.hp, exp: o => o.m.exp, ratio: o => o.ratio, eva: o => o.m.eva || 0,
  pdd: o => o.m.PDDamage || 0, mdd: o => o.m.MDDamage || 0, atk: o => o.m.PADamage || 0, acc: o => o.m.acc || 0};
function render(){
  const q = S.q.trim().toLowerCase(), f = COLS[S.sort] || COLS.level;
  const rows = M.filter(o => (!S.kind || o.kind === S.kind) && (!q || o.hay.includes(q)))
    .sort((a, b) => { const x = f(a), y = f(b); return (typeof x === "string" ? x.localeCompare(y) : x - y) * S.dir || a.m.level - b.m.level });
  document.querySelectorAll("#mbhead th[data-k]").forEach(th => { const on = th.dataset.k === S.sort;
    th.setAttribute("aria-sort", on ? (S.dir > 0 ? "ascending" : "descending") : "none");
    th.querySelector("button").dataset.arrow = on ? (S.dir > 0 ? "▲" : "▼") : "" });
  $("#mbcount").textContent = `${rows.length} monster${rows.length === 1 ? "" : "s"}`;
  $("#mbrows").innerHTML = rows.map(o => { const m = o.m, open = S.open === o.id, top = m.maps[0];
    return `<tr class="mrow${open ? " open" : ""}" data-id="${o.id}"><td><button class="mbtn" aria-expanded="${open}">${D.mobimg[o.id] ? `<img src="data:image/png;base64,${D.mobimg[o.id]}" alt="">` : "<i></i>"}<span><b>${esc(m.name)}</b>${KIND[o.kind][0] ? ` <span class="pill ${KIND[o.kind][1]}">${KIND[o.kind][0]}</span>` : ""}<span class="sub">${esc(top[1])}${m.maps.length > 1 ? ` +${m.maps.length - 1}` : ""}</span></span></button></td>
      <td class="num">${m.level}</td><td class="num">${fmt(m.hp)}</td><td class="num">${fmt(m.exp)}</td><td class="num">${(o.ratio * 100).toFixed(1)}</td>
      <td class="num">${m.eva || 0}</td><td class="num">${m.PDDamage || 0}</td><td class="num">${m.MDDamage || 0}</td><td class="num">${m.PADamage || 0}</td><td class="num">${m.acc || 0}</td></tr>
      ${open ? `<tr class="mdetail"><td colspan="10">${card(o)}</td></tr>` : ""}` }).join("") || `<tr><td colspan="10" class="sub">No monster matches.</td></tr>`;
}
function openMob(id){ S.open = S.open === id ? null : id; save(); render() }
$("#mbsearch").addEventListener("input", e => { S.q = e.target.value; render() });
$("#mbkind").addEventListener("change", e => { S.kind = e.target.value; save(); render() });
document.querySelectorAll("#mbhead th[data-k] button").forEach(b => b.addEventListener("click", () => {
  const k = b.parentElement.dataset.k; S.dir = S.sort === k ? -S.dir : (k === "name" || k === "level" ? 1 : -1); S.sort = k; save(); render();
}));
$("#mbrows").addEventListener("click", e => {
  const b = e.target.closest(".mbtn"); if (b) return openMob(b.closest("tr").dataset.id);
  const l = e.target.closest("[data-open]"); if (l){ S.open = null; openMob(l.dataset.open); document.querySelector(`#mbrows tr[data-id="${l.dataset.open}"]`)?.scrollIntoView({block: "nearest"}) }
});
render();
})();
