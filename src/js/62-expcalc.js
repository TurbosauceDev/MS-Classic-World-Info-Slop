/* ---------------- EXP/hr calculator ---------------- */
// two EXP readings + elapsed time -> measured EXP/hr, time to level, and the Where to train estimate for that map
// (mapRates with the default build, × EXP card). Saved sessions live in localStorage "expc".
(() => {
const MAPS = {}, BYLABEL = {}, seen = {};
for (const [id, [name, open]] of Object.entries(D.maps).sort((a, b) => a[1][0].localeCompare(b[1][0]))){
  if (!open) continue;
  let l = name; seen[l] = (seen[l] || 0) + 1; if (seen[l] > 1) l += ` #${seen[l]}`;
  MAPS[id] = l; BYLABEL[l.toLowerCase()] = id;
}
$("#ecmaps").innerHTML = Object.values(MAPS).map(l => `<option value="${esc(l)}">`).join("");

let S = {cls: "Warrior", l0: 25, l1: 25, e0: "", e1: "", min: "", map: "", pty: "1", card: "1", goal: "", t0: null, sort: "t", rec: []};
try { Object.assign(S, JSON.parse(localStorage.getItem("expc") || "{}")) } catch(e) {}
const save = () => { try { localStorage.setItem("expc", JSON.stringify(S)) } catch(e) {} };
const F = {cls: "#eccls", l0: "#ecl0", l1: "#ecl1", e0: "#ece0", e1: "#ece1", min: "#ecmin", map: "#ecmap", pty: "#ecpty", card: "#eccard", goal: "#ecgoalL", sort: "#ecsort"};
for (const [k, sel] of Object.entries(F)) $(sel).value = S[k] ?? "";

const lvl = v => Math.min(99, Math.max(1, Math.trunc(+v) || 1));
// "123456", "45.67%", or the bar text "123456[45.67%]" -> EXP into the level (null if unreadable)
function readExp(txt, L){
  const t = String(txt).replace(/[,\s]/g, ""); if (!t) return null;
  const m = t.match(/^(\d+(?:\.\d+)?)(%?)/); if (!m) return null;
  const e = m[2] ? +m[1] / 100 * D.exp[L] : +m[1];
  return D.exp[L] && e >= D.exp[L] ? null : e;   // EXP into a level is always below what the level needs
}
const expBetween = (L0, e0, L1, e1) => { let g = e1 - e0; for (let l = L0; l < L1; l++) g += D.exp[l]; return g };
const toLevel = (L, e, goal) => { let need = D.exp[L] - e; for (let l = L + 1; l < goal; l++) need += D.exp[l]; return need };
const hrs = s => s == null || !isFinite(s) ? "–" : dur(s);
// our Where to train estimate (EXP/hr, no card) for the default build of this class and level
function modelRate(cls, L, mid, party){
  if (!mid || !D.maps[mid]) return null;
  const b = trainBuild(cls, L), dps = b.dps > 0 ? b.dps : 20 * L, aoe = classAoe(cls, L);
  const r = mapRates(cls, L, dps, accFor(cls, L), Infinity, aoe && aoe.t > 1 ? aoe : null, party).find(r => r.id === mid);
  return r ? r.rate * 3600 : null;
}

let tick = null;
function timerUi(){
  const run = S.t0 != null;
  $("#ectimer").textContent = run ? `Stop (${dur((Date.now() - S.t0) / 1000)})` : "Start timer";
  $("#ectimer").setAttribute("aria-pressed", run);
  clearInterval(tick); tick = run ? setInterval(() => $("#ectimer").textContent = `Stop (${dur((Date.now() - S.t0) / 1000)})`, 1000) : null;
}
$("#ectimer").addEventListener("click", () => {
  if (S.t0 == null){ S.t0 = Date.now(); S.e1 = ""; $("#ece1").value = ""; }
  else { S.min = +((Date.now() - S.t0) / 60000).toFixed(1); $("#ecmin").value = S.min; S.t0 = null; $("#ece1").focus() }
  save(); timerUi(); calc();
});

let cur = null;
function calc(){
  for (const [k, sel] of Object.entries(F)) S[k] = $(sel).value;
  save();
  const L0 = lvl(S.l0), L1 = Math.max(L0, lvl(S.l1)), e0 = readExp(S.e0, L0), e1 = readExp(S.e1, L1), min = +S.min;
  const mid = BYLABEL[String(S.map).trim().toLowerCase()] || null, party = +S.pty || 1, card = +S.card || 1;
  cur = null;
  if (e0 == null || e1 == null || !(min > 0)){
    $("#ecout").innerHTML = `<p class="note">${S.t0 != null ? "Timer running. Train, then press <b>Stop</b> and type your new EXP." : "Type your start and end EXP and the minutes (or use the timer)."}</p>`;
    return;
  }
  const gain = expBetween(L0, e0, L1, e1);
  if (gain <= 0){ $("#ecout").innerHTML = `<p class="note">End EXP is below the start. If you leveled up, raise <b>End level</b>.</p>`; return }
  const rate = gain / min * 60, perSec = rate / 3600, goal = Math.min(MAX_LEVEL, Math.max(L1 + 1, +S.goal || L1 + 1));
  const model = modelRate(S.cls, L1, mid, party), est = model != null ? model * card : null;
  cur = {t: Date.now(), cls: S.cls, L: L1, map: mid, party, card, min, gain, rate, est};
  const pct = rate / D.exp[L1] * 100, unsure = L1 >= EXP_SURE ? ' <span class="pill p-warn">estimated EXP table</span>' : "";
  $("#ecout").innerHTML = `<div class="card">
    <div class="big">${fmt(rate)} <small>EXP/hr</small></div>
    <p>${fmt(gain)} EXP in ${min < 1 ? Math.round(min * 60) + " s" : +min.toFixed(1) + " min"} · ${pct >= 10 ? Math.round(pct) : pct.toFixed(1)}% of level ${L1} per hour${card > 1 ? ` · ${fmt(rate / card)}/hr without the ${card}x card` : ""}</p>
    <p>Next level: <b>${hrs(toLevel(L1, e1, L1 + 1) / perSec)}</b>${goal > L1 + 1 ? ` · Level ${goal}: <b>${hrs(toLevel(L1, e1, goal) / perSec)}</b>` : ""}${unsure}</p>
    ${mid ? `<p>${mapLink(mid, D.maps[mid][0])}: our estimate ${est != null ? `<b>${fmt(est)}</b>/hr (default ${esc(S.cls)} build${party > 1 ? `, party of ${party}` : ""}${card > 1 ? `, ×${card} card` : ""}). You got <b>${Math.round(rate / est * 100)}%</b> of it.` : "none (your build can't hit these monsters reliably by our model)."}</p>` : ""}
    <button class="btn primary" id="ecsave" type="button">Save session</button></div>`;
  $("#ecsave").addEventListener("click", () => { S.rec.unshift(cur); save(); rows(); $("#ecsave").textContent = "Saved"; $("#ecsave").disabled = true });
}
function rows(){
  const list = S.rec.map((r, i) => ({...r, i})).sort(S.sort === "rate" ? (a, b) => b.rate - a.rate : (a, b) => b.t - a.t);
  $("#ecrows").innerHTML = list.length ? list.map(r => `<tr>
    <td class="sub">${new Date(r.t).toLocaleString([], {month: "short", day: "numeric", hour: "numeric", minute: "2-digit"})}</td>
    <td>${esc(r.cls)}</td><td class="num">${r.L}</td><td>${r.map && D.maps[r.map] ? mapLink(r.map, D.maps[r.map][0]) : "–"}</td>
    <td class="num">${r.party}</td><td class="num">${r.card > 1 ? r.card + "x" : "–"}</td><td class="num">${+(+r.min).toFixed(1)}</td>
    <td class="num">${fmt(r.gain)}</td><td class="num"><b>${fmt(r.rate)}</b></td><td class="num">${r.est ? Math.round(r.rate / r.est * 100) + "%" : "–"}</td>
    <td><button class="btn" data-ecdel="${r.i}" type="button" style="padding:3px 9px" aria-label="Delete">✕</button></td></tr>`).join("")
    : `<tr><td colspan="11" class="sub">No saved sessions yet.</td></tr>`;
}
$("#ecrows").addEventListener("click", e => { const b = e.target.closest("[data-ecdel]"); if (!b) return; S.rec.splice(+b.dataset.ecdel, 1); save(); rows() });
$("#ecclear").addEventListener("click", () => { if (S.rec.length && confirm("Delete all saved sessions?")){ S.rec = []; save(); rows() } });
$("#ecsort").addEventListener("change", () => { S.sort = $("#ecsort").value; save(); rows() });
$("#ecl0").addEventListener("input", () => { if (+$("#ecl1").value < +$("#ecl0").value) $("#ecl1").value = $("#ecl0").value });
for (const sel of Object.values(F)) if (sel !== "#ecsort") $(sel).addEventListener("input", calc);
timerUi(); calc(); rows();
})();
