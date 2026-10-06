/* client formulas */
function hitProb(acc, avoid, diff){
  const base = acc * 100 / ((Math.max(0, diff) * 2 + 51) * 5);
  if (base <= 0) return 0;
  if (avoid <= 0) return 1;
  const spread = 0.15 + 0.2 / (1 + Math.exp((base - avoid) / 12));
  return Math.max(0, Math.min(1, (1 + spread - avoid / base) / (2 * spread)));
}
const lvlPen = d => d <= 0 ? 1 : d < 10 ? 1 / (d * d * 0.005 + 1) : 1 / (d * 0.05 + 1);
const MAGIC = new Set(["Magician","I/L Wizard","F/P Wizard","Cleric"]);
const ELEMS = {"I/L Wizard":["Ice","Lightning"],"F/P Wizard":["Fire","Poison"],"Cleric":["Holy"]};
const EMULT = {Weak:1.25, Strong:0.75, Immune:0};
function classAcc(cls, L){
  const prim = 5*L + 20 - L - 8, sec = L;
  if (cls === "Warrior") return (sec*1.2 + L*2 + 2.4)/2.5 + 10 + (L >= 15 ? 50 : 0);
  if (cls === "Bowman")  return (prim*1.2 + L*2 + 2.4)/4.8 + 20;
  if (cls === "Thief")   return (sec*1.2 + L*2 + prim*0.6)/4 + 15 + (L >= 15 ? 20 : 0);
  return (prim*1.2 + L*2 + sec*0.6)/5.1 + 20;
}

function rankMaps(){
  let cls = $("#cls").value, L = +$("#lvl").value || 25, dps = +$("#dps").value || 20*L;
  const magic = MAGIC.has(cls), acc = classAcc(magic ? "Magician" : cls, L), els = ELEMS[cls] || [];
  const rows = [];
  for (const [mid, [name, open, spawns]] of Object.entries(D.maps)){
    if (!open) continue;
    let exp = 0, time = 0, n = 0, lvSum = 0, hitSum = 0, ok = true, names = new Set();
    for (const [id, c] of spawns){
      const m = D.mobs[id]; if (!m) continue;
      const [nm, lv, hp, ex, eva, pdd, mdd, el] = m;
      const diff = lv - L, hit = hitProb(acc, eva, diff);
      if (hit < 0.05){ ok = false; break }
      let em = 1; if (els.length){ em = Math.max(...els.map(e => EMULT[el[e]] ?? 1)); if (em === 0) em = 1 }
      const df = magic ? mdd : pdd;
      const eff = hp / (hit * lvlPen(diff) * em * 100 / (df + 100));
      exp += ex * c; time += (eff / dps + 1) * c; n += c; lvSum += lv * c; hitSum += hit * c; names.add(nm);
    }
    if (!ok || !n) continue;
    const avg = lvSum / n; if (avg < L - 12) continue;
    const rate = Math.min(exp / time, exp * 0.75 / 7.56);
    rows.push({name, open, mobs:[...names].join(", "), n, avg, hit: hitSum / n, rate});
  }
  rows.sort((a,b) => b.rate - a.rate);
  const top = rows.slice(0, 15), best = top[0]?.rate || 1, need = D.exp[L];
  $("#maprows").innerHTML = top.length ? top.map((r,i) => `<tr>
    <td class="num">${i+1}</td>
    <td><span class="name">${esc(r.name)}</span>${r.open ? "" : ' <span class="pill p-warn">opens later</span>'}</td>
    <td class="sub">${esc(r.mobs)}</td>
    <td class="num">${r.n}</td><td class="num">${r.avg.toFixed(1)}</td>
    <td class="num">${r.hit < .9 ? `<span class="pill p-warn">${Math.round(r.hit*100)}%</span>` : Math.round(r.hit*100) + "%"}</td>
    <td><span class="bar"><i style="width:${Math.round(100*r.rate/best)}%"></i></span><span class="mono">${Math.round(100*r.rate/best)}</span></td>
    <td class="num">${fmt(r.rate*3600)}</td>
    <td class="num">${need ? (need/(r.rate*3600)).toFixed(1) : "–"}</td></tr>`).join("")
    : `<tr><td colspan="9" class="empty">No map fits this level and class. Try a different level.</td></tr>`;
  $("#mapnote").innerHTML = `Assumed accuracy at level ${L}: <b>${Math.round(acc)}</b> (all AP in your main stat, secondary stat equal to your level, no accuracy gear${cls==="Warrior"&&L>=15?", Precise Strikes maxed":cls==="Thief"&&L>=15?", Nimble Body maxed":""}). Level ${L}→${L+1} needs <b>${fmt(need)}</b> EXP. EXP/hr is a model estimate, solo, single-target.`;
}
["#cls","#lvl","#dps"].forEach(s => $(s).addEventListener("input", rankMaps));
$("#lvl").addEventListener("change", () => { $("#dps").value = Math.max(50, 20 * (+$("#lvl").value || 25)); rankMaps() });
$("#dps").value = 20 * +$("#lvl").value;
rankMaps();

