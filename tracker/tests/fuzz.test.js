// node tests/fuzz.test.js — random event streams into the session + slicer: no NaN/Infinity/negative anywhere, no crash, runs well-formed
const G = require("../app/gamedata.json"), {createSession, createRunSlicer, speedCheck} = require("../core/session.js");
let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)];
const maps = Object.keys(G.maps), items = Object.keys(G.items), bad = [];
const check = (o, path) => { for (const [k, v] of Object.entries(o || {})){ const p = path + "." + k;
  if (typeof v === "number" && (!isFinite(v) || (v < 0 && !/dueIn|wallet/.test(k)))) bad.push(p + "=" + v);
  else if (v && typeof v === "object") check(v, p) } };
for (let trial = 0; trial < 300; trial++){
  const runs = [], s = createSession(G, {goalLevel: pick([0, 5, 30, 250])}), sl = createRunSlicer(G, {onRun: r => runs.push(r)});
  let t = 1.7e12, lv = 1 + Math.floor(rnd() * 60), exp = 0;
  for (let i = 0; i < 2000; i++){
    t += pick([0, 50, 500, 1000, 5000, 70000, -3000, 3.6e6]);
    const r = rnd(); let e;
    if (r < .05) e = {type: "map", id: pick([...maps, null, "123"]), name: pick([null, "X", ""])};
    else if (r < .08) e = {type: "party", size: pick([1, 2, 6, 0, -1, 7.5])};
    else if (r < .10) e = {type: "job", name: pick([null, "Archer", ""])};
    else if (r < .45) e = {type: "exp", gain: pick([1, 7, 15, 26, 41, 0, 99999, 2.5])};
    else if (r < .5) e = {type: "bonus", gain: pick([2, 0, 50])};
    else if (r < .7){ const need = G.exp[lv] || 1e6; exp += pick([10, 50, -200, 0, need]); if (exp >= need){ exp -= need; lv++ } if (exp < 0) exp = 0;
      e = {type: "bar", exp, pct: Math.round(exp / (G.exp[lv] || 1e6) * 1e4) / 100, level: pick([lv, null, lv + 1])} }
    else if (r < .85) e = {type: "meso", amount: pick([1, 30, 0, 100000])};
    else if (r < .95) e = {type: "item", id: pick([...items.slice(0, 50), "999"]), qty: pick([1, 3, undefined])};
    else if (r < .97) e = {type: "itemraw", text: "?"};
    else if (r < .985) e = {type: pick(["pause", "resume", "useseen"])};
    else if (rnd() < .3) e = {type: "wallet", n: pick([0, 4685, 100000, -5, NaN])};
    else e = {type: "use", id: pick(["2000000", "2060000", "999", "2000004"]), n: pick([1, 3, 0, -2, 2.5])};
    e.t = t;
    try { s.add(e); sl.add(e) } catch (err){ bad.push("crash " + err.message + " " + JSON.stringify(e)); break }
  }
  const st = s.stats(), S = s.state;
  if (S.last !== null && st.activeMin * 6e4 > Math.max(0, S.last - S.start) + 1) bad.push("active time longer than the session " + st.activeMin);
  for (let i = 1; i < st.levelUps.length; i++) if (st.levelUps[i].level <= st.levelUps[i - 1].level) bad.push("level-up log not rising");
  check(st, "stats"); check(s.shareable(), "share"); check(s.respawns(t), "respawns");
  for (const r of runs){ check(r, "run"); if (!(r.minutes >= 15)) bad.push("short run " + r.minutes); speedCheck(r, {rows: [{map: r.map, level: r.level, party: 1, expHr: 5, group: "a"}]}, G) }
  if (bad.length) { console.log("trial", trial, bad.slice(0, 8)); break }
}
// misreads: a steady climb with 1 in 10 readings garbled the way the KPQ run showed (EXP number wrong, a digit dropped or
// doubled, the % wrong). The EXP counted may not run ahead of the real gain, and no garble may count as a death.
for (let trial = 0; trial < 200 && !bad.length; trial++){
  const s = createSession(G); let t = 1.7e12, lv = 10 + Math.floor(rnd() * 50), exp = Math.floor(rnd() * G.exp[lv] * 0.8), gain = 0;
  for (let i = 0; i < 600; i++){
    t += 2000;
    if (rnd() < 0.3){ const d = Math.ceil(rnd() * G.exp[lv] * 0.003); exp += d; gain += d; if (exp >= G.exp[lv]){ exp -= G.exp[lv]; lv++ } }
    const pct = Math.round(exp / G.exp[lv] * 1e4) / 100, good = {t, type: "bar", exp, pct, level: pct > 0.5 ? lv : null};
    const g = String(exp), garble = pick([{exp: 1}, {exp: 20}, {exp: +g.slice(1) || 0}, {exp: +(g + g.at(-1))}, {pct: Math.round(rnd() * 1e4) / 100}]);
    const ev = rnd() < 0.1 ? {...good, ...garble, level: null} : good, d0 = s.state.deaths, b0 = s.state.bar;
    s.add(ev);
    if (process.env.V && s.state.deaths > d0) console.log("death on", JSON.stringify(ev), "after", JSON.stringify(b0), "true", exp, lv);
  }
  const st = s.stats();
  if (st.deaths) bad.push("misread fuzz: " + st.deaths + " fake deaths (trial " + trial + ")");
  if (st.exp > gain * 1.02 + 50) bad.push("misread fuzz: counted " + st.exp + " for a real " + gain + " (trial " + trial + ")");
}
if (bad.length){ console.error(bad.slice(0, 4).join("\n")); console.error("fuzz found " + bad.length + " problems"); process.exit(1) }
console.log("fuzz test passed (300 random sessions)");
