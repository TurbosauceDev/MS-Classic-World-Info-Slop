/* ---------------- Character Builder: compare two jobs side by side ---------------- */
(() => {
// each side is the builder's default build for a job at one level (buildAt: best weapon that level can use, auto AP and
// skill build, same as Where to train), or "This build" = the one set up above. Saved per viewer under "bcmp".
const JOBS = Object.entries(BLD.BRANCHES).flatMap(([cls, list]) => list.map(([br, from]) => ({cls, br, from, v: cls + "|" + br})));
const DEF = {a: "Warrior|Fighter", b: "Warrior|Page", lvl: 45, aoe: ""};
const S = Object.assign({...DEF}, savedState("bcmp", DEF));
const okJob = v => v === "me" || JOBS.some(j => j.v === v);
if (!okJob(S.a)) S.a = DEF.a; if (!okJob(S.b)) S.b = DEF.b; if (S.aoe !== "" && S.aoe !== "1") S.aoe = "";
S.lvl = Math.min(MAX_LEVEL, Math.max(10, Math.round(+S.lvl) || DEF.lvl));
const save = () => { try { localStorage.setItem("bcmp", JSON.stringify(S)) } catch(e) {} };
const opts = (sel, me) => (me ? `<option value="me"${sel === "me" ? " selected" : ""}>This build (above)</option>` : "")
  + JOBS.map(j => `<option value="${esc(j.v)}"${j.v === sel ? " selected" : ""}>${esc(j.br)}${j.from ? ` (Lv ${j.from}+)` : ""}</option>`).join("");
$("#pcmpa").innerHTML = opts(S.a, true); $("#pcmpb").innerHTML = opts(S.b, true);
$("#pcmplvl").value = S.lvl; $("#pcmpaoe").value = S.aoe;
const skillName = () => $("#pskill").selectedOptions[0]?.textContent || "";
function side(v){
  if (v === "me"){ const s = BLD.S;
    return {name: `This build: ${s.branch} Lv ${s.lvl}`, lvl: s.lvl, weapon: s.weapon, skill: skillName(), dps: s.dps, targets: s.area?.t || 1, acc: s.acc,
      hp: s.def?.hp, wdef: s.def?.wdef, avoid: s.def?.avoid, cost: s.cost?.mesoHr} }
  const j = JOBS.find(x => x.v === v), L = S.lvl, br = L >= j.from ? j.br : BLD.BRANCHES[j.cls][0][0];
  let b = {}; try { b = buildAt(j.cls, br, null, L, S.aoe === "1") } catch(e) {}
  return {name: `${br} Lv ${L}` + (br !== j.br ? ` (${j.br} opens at ${j.from})` : ""), lvl: L, weapon: b.weapon, skill: b.skill, dps: b.dps, targets: b.targets || 1,
    acc: b.acc, hp: b.hp, wdef: b.wdef, avoid: b.avoid, cost: b.cost?.mesoHr};
}
const ROWS = [["Weapon", "weapon"], ["Attack skill", "skill"], ["Damage / sec", "dps", 1], ["Monsters per attack", "targets", 1], ["Accuracy", "acc", 1],
  ["Max HP", "hp", 1], ["Weapon DEF", "wdef", 1], ["Avoid", "avoid", 1], ["Potions + ammo, mesos/hr", "cost", -1]];
const num = x => typeof x === "number" && isFinite(x);
function render(){
  if ($("#plan").hidden) return;
  const A = side(S.a), B = side(S.b);
  $("#pcmphead").innerHTML = `<th></th><th>${esc(A.name)}</th><th>${esc(B.name)}</th>`;
  $("#pcmprows").innerHTML = ROWS.map(([lab, k, better]) => {
    const a = A[k], b = B[k], win = better && num(a) && num(b) && a !== b ? ((a > b) === (better > 0) ? 0 : 1) : -1;
    const cell = (x, i) => `<td class="${better ? "num" : ""}">${i === win ? "<b>" : ""}${better ? (num(x) ? fmt(x) : "–") : esc(x || "–")}${i === win ? "</b>" : ""}</td>`;
    return `<tr><th scope="row">${lab}</th>${cell(a, 0)}${cell(b, 1)}</tr>` }).join("")
    + (num(A.dps) && num(B.dps) && A.dps > 0 && B.dps > 0 ? `<tr><th scope="row">Damage difference</th><td colspan="2">${A.dps === B.dps ? "the same" : `${esc((A.dps > B.dps ? A : B).name)} hits ${Math.round((Math.max(A.dps, B.dps) / Math.min(A.dps, B.dps) - 1) * 100)}% harder`}</td></tr>` : "");
}
let raf = 0; const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render() }) };
$("#pcmpa").addEventListener("change", e => { S.a = e.target.value; save(); render() });
$("#pcmpb").addEventListener("change", e => { S.b = e.target.value; save(); render() });
$("#pcmpaoe").addEventListener("change", e => { S.aoe = e.target.value; save(); render() });
$("#pcmplvl").addEventListener("change", e => { S.lvl = Math.min(MAX_LEVEL, Math.max(10, Math.round(+e.target.value) || DEF.lvl)); e.target.value = S.lvl; save(); render() });
// "This build" follows the builder: any change above redraws once per frame
for (const ev of ["input", "change", "click"]) $("#plan").addEventListener(ev, e => { if ((S.a === "me" || S.b === "me") && !e.target.closest("#pcmp")) later() });
$("#t-plan").addEventListener("click", render); render();
})();
