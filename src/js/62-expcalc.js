/* ---------------- EXP/hr calculator ---------------- */
// two EXP readings + elapsed time -> measured EXP/hr, time to level, and the Where to train estimate for that map
// (mapRates with the default build, × EXP card). Saved sessions live in localStorage "expc". Two screenshots fill it in:
// EXP bar via the tracker's readers (readers.js, inlined in 54-invprice.js), time from EXIF / file name / file time.
// "Save as image" draws a result card. The live screen reader (63-expclive.js) saves its runs here through window.EXPC.
(() => {
const MAPS = {}, BYLABEL = {}, seen = {};
for (const [id, [name, open]] of Object.entries(D.maps).sort((a, b) => a[1][0].localeCompare(b[1][0]))){
  if (!open) continue;
  let l = name; seen[l] = (seen[l] || 0) + 1; if (seen[l] > 1) l += ` #${seen[l]}`;
  MAPS[id] = l; BYLABEL[l.toLowerCase()] = id;
}
$("#ecmaps").innerHTML = Object.values(MAPS).map(l => `<option value="${esc(l)}">`).join("");

let S = {cls: "Warrior", l0: 25, l1: 25, e0: "", e1: "", min: "", map: "", pty: "1", card: "1", goal: "", t0: null, sort: "t", rec: []};
try { Object.assign(S, savedState("expc", S)) } catch(e) {}
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

// ---- screenshots: EXP bar + when each was taken (10-18 branch karuzk, Danny OK'd) ----
// JPEG camera time (EXIF DateTimeOriginal, else DateTimeDigitized / DateTime), as a local time; null if none
function exifTime(buf){
  try {
    const v = new DataView(buf); if (v.getUint16(0) !== 0xFFD8) return null;
    let o = 2;
    while (o + 4 < v.byteLength && v.getUint8(o) === 0xFF){
      const mk = v.getUint8(o + 1), len = v.getUint16(o + 2);
      if (mk === 0xE1 && v.getUint32(o + 4) === 0x45786966){
        const t = o + 10, le = v.getUint16(t) === 0x4949, u16 = i => v.getUint16(t + i, le), u32 = i => v.getUint32(t + i, le);
        const tag = (ifd, id) => { const n = u16(ifd); for (let k = 0; k < n; k++){ const e = ifd + 2 + k * 12; if (u16(e) === id) return e } return -1 };
        const str = e => { let s = ""; for (let k = 0; k < 19; k++) s += String.fromCharCode(v.getUint8(t + u32(e + 8) + k)); return s };
        const ifd0 = u32(4), ex = tag(ifd0, 0x8769);
        let e = ex >= 0 ? tag(u32(ex + 8), 0x9003) : -1;
        if (e < 0 && ex >= 0) e = tag(u32(ex + 8), 0x9004);
        if (e < 0) e = tag(ifd0, 0x0132);
        const m = e >= 0 && str(e).match(/(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/);
        return m ? new Date(m[1], m[2] - 1, m[3], m[4], m[5], m[6]).getTime() : null;
      }
      o += 2 + len;
    }
  } catch(e) {}
  return null;
}
// a date and time in the file name: 2026-10-17 21.05.33, 20261017_210533, 261017_210533 ...
function nameTime(name){
  const m = name.match(/(?:^|\D)((?:20)?\d\d)[-_.]?(\d\d)[-_.]?(\d\d)[ _T-]*(\d\d)[-_.:h]?(\d\d)[-_.:m]?(\d\d)(?!\d)/);
  if (!m) return null;
  const y = +m[1] < 100 ? 2000 + +m[1] : +m[1], d = new Date(y, m[2] - 1, m[3], m[4], m[5], m[6]);
  return m[2] >= 1 && m[2] <= 12 && m[3] >= 1 && m[3] <= 31 && m[4] < 24 && m[5] < 60 && m[6] < 60 ? d.getTime() : null;
}
// EXP bar of one screenshot: pixel-exact first, else any scale; level = the EXP table entry EXP / % works out to
function barOf(img){
  const R = window.GrindReaders, b = R.readBar(R.native(img)) || R.readBarAny(img);
  if (!b) return null;
  let level = null;
  if (b.pct > 0.5) for (const [L, need] of Object.entries(D.exp)) if (Math.abs(b.exp / (b.pct / 100) - need) / need < 0.004){ level = +L; break }
  return {exp: b.exp, pct: b.pct, level};
}
let SHOTS = [];   // [{t, how, bar}] this visit only
async function addShots(files, pasted){
  files = [...files].filter(f => f.type.startsWith("image/")); if (!files.length) return;
  $("#ecshot").textContent = "Reading…";
  for (const f of files){
    let t = null, how = "pasted";
    if (!pasted){ t = exifTime(await f.slice(0, 131072).arrayBuffer()); how = "camera time";
      if (t == null){ t = nameTime(f.name); how = "file name" }
      if (t == null){ t = f.lastModified; how = "file time" } }
    else t = Date.now();
    let bar = null; try { bar = barOf(await shotLoad(f)) } catch(e) {}
    SHOTS.push({t, how, bar});
  }
  SHOTS.sort((a, b) => a.t - b.t); if (SHOTS.length > 2) SHOTS = [SHOTS[0], SHOTS[SHOTS.length - 1]];
  const [a, b] = SHOTS, put = (sel, v) => { if (v != null) $(sel).value = v };
  const said = s => s.bar ? `${fmt(s.bar.exp)} [${s.bar.pct.toFixed(2)}%]${s.bar.level ? ` at level ${s.bar.level}` : ""}` : "EXP bar not found (type it in)";
  const when = s => `${new Date(s.t).toLocaleTimeString([], {hour: "numeric", minute: "2-digit", second: "2-digit"})} (${s.how})`;
  put("#ecl0", a.bar?.level); put("#ece0", a.bar?.exp);
  if (b){
    put("#ecl1", b.bar?.level ?? (a.bar?.level && Math.max(+$("#ecl1").value, a.bar.level))); put("#ece1", b.bar?.exp);
    $("#ecmin").value = +((b.t - a.t) / 60000).toFixed(1);
    if (S.t0 != null){ S.t0 = null; timerUi() }
    $("#ecshot").innerHTML = `Start: ${esc(said(a))}, ${esc(when(a))}<br>End: ${esc(said(b))}, ${esc(when(b))}${b.t - a.t < 60000 ? '<br><b>Under a minute apart:</b> check the times, or type the minutes.' : ""}`;
    SHOTS = [];
  } else {
    if (+$("#ecl1").value < +$("#ecl0").value) $("#ecl1").value = $("#ecl0").value;
    $("#ece1").value = ""; $("#ecshot").innerHTML = `Start: ${esc(said(a))}, ${esc(when(a))}. Now add the end screenshot.`;
  }
  calc();
}
const drop = $("#ecdrop");
drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over") });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); addShots(e.dataTransfer.files) });
$("#ecfile").addEventListener("change", e => { addShots(e.target.files); e.target.value = "" });
document.addEventListener("paste", e => { if ($("#expc").hidden) return; const f = [...(e.clipboardData?.files || [])]; if (f.length){ e.preventDefault(); addShots(f, true) } });

// ---- result as a picture: r {t, L, cls, map, gain, min, rate, party, card, next?, mesosHr?} ----
function shareCard(r){
  const W = 720, H = 360, c = document.createElement("canvas"), g = c.getContext("2d"), css = getComputedStyle(document.documentElement);
  c.width = W * 2; c.height = H * 2; g.scale(2, 2);
  const col = k => css.getPropertyValue(k).trim() || "#888", ff = k => css.getPropertyValue(k).trim() || "sans-serif";
  g.fillStyle = col("--panel"); g.fillRect(0, 0, W, H);
  g.fillStyle = col("--accent"); g.fillRect(0, 0, 8, H);
  const txt = (s, x, y, font, color) => { g.font = font; g.fillStyle = col(color); g.fillText(s, x, y) };
  txt(`Level ${r.L} ${r.cls}${r.map && D.maps[r.map] ? " · " + D.maps[r.map][0] : ""}`, 40, 56, `600 22px ${ff("--f-body")}`, "--ink");
  txt(fmt(r.rate), 40, 150, `800 84px ${ff("--f-display")}`, "--ink");
  g.font = `800 84px ${ff("--f-display")}`; const w = g.measureText(fmt(r.rate)).width;
  txt("EXP/hr", 52 + w, 150, `500 24px ${ff("--f-body")}`, "--muted");
  txt(`${fmt(r.gain)} EXP in ${+(+r.min).toFixed(1)} min · ${+(r.rate / D.exp[r.L] * 100).toFixed(1)}% of a level per hour`, 40, 200, `500 20px ${ff("--f-body")}`, "--ink");
  txt([r.mesosHr ? `${fmt(r.mesosHr)} mesos/hr` : "", r.party > 1 ? `Party of ${r.party}` : "Solo", r.card > 1 ? `${r.card}x EXP card` : "", r.next ? `next level in ${r.next}` : ""].filter(Boolean).join(" · "), 40, 234, `500 20px ${ff("--f-body")}`, "--muted");
  txt(new Date(r.t).toLocaleString([], {year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"}), 40, 300, `500 16px ${ff("--f-body")}`, "--muted");
  txt("MS Classic World Data Slop · EXP/hr calculator", 40, 328, `600 16px ${ff("--f-body")}`, "--accent");
  return c;
}
// shows the picture under btn's card (copy / long-press where downloads are blocked) and downloads or shares it
function saveImage(r, out){
  const c = shareCard(r), name = `exp-hr-${r.L}-${new Date(r.t).toISOString().slice(0, 10)}.png`;
  out.innerHTML = `<img src="${c.toDataURL("image/png")}" alt="EXP/hr result picture" style="display:block;width:100%;max-width:520px;margin-top:12px;border-radius:8px;border:1px solid var(--line)"><p class="note">Right-click or long-press the picture to copy it.</p>`;
  c.toBlob(b => { if (!b) return; const f = new File([b], name, {type: "image/png"});
    if (navigator.canShare?.({files: [f]}) && matchMedia("(pointer:coarse)").matches){ navigator.share({files: [f]}).catch(() => {}); return }
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000) });
}

let cur = null;
function calc(){
  for (const [k, sel] of Object.entries(F)) S[k] = $(sel).value;
  save();
  const L0 = lvl(S.l0), L1 = Math.max(L0, lvl(S.l1)), e0 = readExp(S.e0, L0), e1 = readExp(S.e1, L1), min = +S.min;
  const mid = BYLABEL[String(S.map).trim().toLowerCase()] || null, party = +S.pty || 1, card = +S.card || 1;
  cur = null;
  if (e0 == null || e1 == null || !(min > 0)){
    $("#ecout").innerHTML = ""; $("#echint").innerHTML = S.t0 != null ? "Timer running. Train, then press <b>Stop</b> and type your new EXP." : "Type your start and end EXP and the minutes (or use the timer).";
    return;
  }
  const gain = expBetween(L0, e0, L1, e1);
  if (gain <= 0){ $("#ecout").innerHTML = ""; $("#echint").innerHTML = "End EXP is below the start. If you leveled up, raise <b>End level</b>."; return }
  $("#echint").innerHTML = "";
  const rate = gain / min * 60, perSec = rate / 3600, goal = Math.min(MAX_LEVEL, Math.max(L1 + 1, +S.goal || L1 + 1));
  const model = modelRate(S.cls, L1, mid, party), est = model != null ? model * card : null;
  cur = {t: Date.now(), cls: S.cls, L: L1, map: mid, party, card, min, gain, rate, est};
  const next = hrs(toLevel(L1, e1, L1 + 1) / perSec);
  const pct = rate / D.exp[L1] * 100, unsure = L1 >= EXP_SURE ? ' <span class="pill p-warn">estimated EXP table</span>' : "";
  $("#ecout").innerHTML = `<div class="card">
    <div class="big">${fmt(rate)} <small>EXP/hr</small></div>
    <p>${fmt(gain)} EXP in ${min < 1 ? Math.round(min * 60) + " s" : +min.toFixed(1) + " min"} · ${pct >= 10 ? Math.round(pct) : pct.toFixed(1)}% of level ${L1} per hour${card > 1 ? ` · ${fmt(rate / card)}/hr without the ${card}x card` : ""}</p>
    <p>Next level: <b>${next}</b>${goal > L1 + 1 ? ` · Level ${goal}: <b>${hrs(toLevel(L1, e1, goal) / perSec)}</b>` : ""}${unsure}</p>
    ${mid ? `<p>${mapLink(mid, D.maps[mid][0])}: our estimate ${est != null ? `<b>${fmt(est)}</b>/hr (default ${esc(S.cls)} build${party > 1 ? `, party of ${party}` : ""}${card > 1 ? `, ×${card} card` : ""}). You got <b>${Math.round(rate / est * 100)}%</b> of it.` : "none (your build can't hit these monsters reliably by our model)."}</p>` : ""}
    <button class="btn primary" id="ecsave" type="button">Save session</button> <button class="btn" id="ecimg" type="button">Save as image</button>
    <div id="ecimgout"></div></div>`;
  $("#ecsave").addEventListener("click", () => { S.rec.unshift(cur); save(); rows(); $("#ecsave").textContent = "Saved"; $("#ecsave").disabled = true });
  $("#ecimg").addEventListener("click", () => saveImage({...cur, next}, $("#ecimgout")));
}
function rows(){
  const list = S.rec.map((r, i) => ({...r, i})).sort(S.sort === "rate" ? (a, b) => b.rate - a.rate : (a, b) => b.t - a.t);
  $("#ecrows").innerHTML = list.length ? list.map(r => `<tr>
    <td class="sub">${new Date(r.t).toLocaleString([], {month: "short", day: "numeric", hour: "numeric", minute: "2-digit"})}</td>
    <td>${esc(r.cls)}</td><td class="num">${r.L}</td><td>${r.map && D.maps[r.map] ? mapLink(r.map, D.maps[r.map][0]) : "–"}</td>
    <td class="num">${r.party}</td><td class="num">${r.card > 1 ? r.card + "x" : "–"}</td><td class="num">${+(+r.min).toFixed(1)}</td>
    <td class="num">${fmt(r.gain)}</td><td class="num"><b>${fmt(r.rate)}</b></td><td class="num">${r.mesosHr != null ? fmt(r.mesosHr) : "–"}</td><td class="num">${r.est ? Math.round(r.rate / r.est * 100) + "%" : "–"}</td>
    <td><button class="btn" data-ecdel="${r.i}" type="button" style="padding:3px 9px" aria-label="Delete">✕</button></td></tr>`).join("")
    : "";
  $("#ecempty").hidden = !!list.length; $("#ecsaved").hidden = $("#ectbl").hidden = !list.length;   // short empty state, not an empty table (second audit #11)
}
$("#ecrows").addEventListener("click", e => { const b = e.target.closest("[data-ecdel]"); if (!b) return; S.rec.splice(+b.dataset.ecdel, 1); save(); rows() });
$("#ecclear").addEventListener("click", () => { if (S.rec.length && confirm("Delete all saved sessions?")){ S.rec = []; save(); rows() } });
$("#ecsort").addEventListener("change", () => { S.sort = $("#ecsort").value; save(); rows() });
$("#ecl0").addEventListener("input", () => { if (+$("#ecl1").value < +$("#ecl0").value) $("#ecl1").value = $("#ecl0").value });
for (const sel of Object.values(F)) if (sel !== "#ecsort") $(sel).addEventListener("input", calc);
timerUi(); calc(); rows();
// for the live reader (63-expclive.js): the picked class/map/party/card/goal, a finished run into the saved sessions
window.EXPC = {
  pick: () => ({cls: $("#eccls").value, map: BYLABEL[$("#ecmap").value.trim().toLowerCase()] || null, party: +$("#ecpty").value || 1, card: +$("#eccard").value || 1, goal: +$("#ecgoalL").value || null}),
  modelRate, saveImage,
  addRec(r){ S.rec.unshift(r); save(); rows() }
};
})();
