/* Skill range and hitbox maths (pure): D.skills[..].rv + D.hitact, both from the OSMS export (scripts/skill_range.py).
   Shared by the site's skill pages (src/js/53-skills.js, inlined by scripts/build.py at the SKRANGE marker) and the tracker's
   Skill range overlay (app/overlay.js, data from app/skilldata.js). D is passed in: the site hands its whole D, the tracker
   the small SKILLDATA {skills, hitact} (no items, so weapon-name facts are left out there).
   Game pixels, facing right: x > 0 in front of you, y < 0 above your feet. tests/golden.js checks skRange on the site. */
(function (root){
  const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]);
  const atLv = (v, lv) => Array.isArray(v) ? v[Math.min(v.length, Math.max(1, lv)) - 1] : v;
  const FAM = {fixed_rectangle: "Stored attack rectangle", effect_rectangle: "Stored party-effect rectangle", ranged_corridor: "Widening ranged corridor",
    action_hitbox: "Weapon swing area", action_extended: "Weapon swing area + forward extension", piercing_line: "Piercing arrow path", teleport_range: "Teleport distance"};
  // One row per weapon type AND swing family: the box belongs to the item (items.json after_image), so a Gladius (short swing)
  // reaches less than a Sword (long swing). H.sk = the client's weapon codes per skill (Final Attack: Sword = swords only).
  const skWeapons = (D, job, id) => { const H = D.hitact; if (!H) return [];
    const keys = H.sk[String(id)] || H.cls[job] || [], only = H.anim[String(id)];
    return H.weap.filter(w => keys.includes(w[4])).map(([key, label, set, acts, base, v, items]) => {
      const box = Object.fromEntries((H.sets[set] || []).map(a => [a[0], a]));
      return {key, label, base, v, items, acts: acts.filter(a => box[a] && (!only || only.includes(a))).map(a => box[a])} }).filter(w => w.acts.length) };
  function skRange(D, job, s, lv, plv, wk, ak){
    const v = s.rv; if (!v) return null;
    lv = Math.min(s.max, Math.max(1, lv || s.max));
    const out = {fam: v.f, label: FAM[v.f] || "Target area", boxes: [], ext: null, poly: null, path: null, tp: null, aim: null, mob: null, facts: []};
    const box = (l, r, t, b) => ({l, r, t, b});
    if (v.L){ const g = [...v.L].reverse().find(x => x[0] <= lv) || v.L[0]; out.from = g[0]; out.boxes = g[1].map(b => box(...b)) }
    let far = null;
    if (v.b){ far = atLv(v.b[0], lv) + (v.p && plv > 0 ? atLv(v.p[2], plv) : 0); out.far = far }
    if (v.f === "ranged_corridor" && v.g){
      const [near, refY, bh, div] = v.g, nh = bh + Math.trunc(near / div), fh = bh + Math.trunc(far / div);
      out.poly = [[near, -nh], [far, -fh], [far, fh], [near, nh]]; out.aim = [near, refY, far]; out.mob = Math.round(far * .73);
      out.facts.push(["Reach", `${far} px in front`], ["Starts", `${near} px ahead`], ["Height at the far end", `${fh} px above and below your feet`]);
    } else if (v.f === "piercing_line"){
      out.boxes = [box(65, far, -72, 0)]; out.path = [23, -30, far];
      out.facts.push(["Path", `${far} px in front`]);
    } else if (v.f === "action_hitbox" || v.f === "action_extended"){
      const W = skWeapons(D, job, s.id), w = W.find(x => x.key === wk) || W[0];
      if (w){ const a = w.acts.find(x => x[0] === ak) || w.acts[0]; out.weapons = W; out.wk = w.key; out.base = w.base; out.ak = a[0];
        out.boxes = [box(a[1], a[2], a[3], a[4])];
        out.facts.push(["Swing box", `${a[1]} to ${a[2]} px in front`], ["Height", vert(a[3], a[4])]);
        if (w.v){ const n = w.items.map(i => D.items?.[i]?.n).filter(Boolean);
          out.facts.push([`${w.v} weapons`, esc(n.slice(0, 4).join(", ")) + (n.length > 4 ? ` +${n.length - 4} more` : "")]) }
        if (v.f === "action_extended"){ const lim = Math.max(a[2], atLv(v.r, lv) || 0); out.ext = box(a[2], lim, a[3], a[4]);
          out.facts.push(["Forward limit", `${lim} px (${lim - a[2]} px past the swing)`]) }
        out.mob = (out.ext ? out.ext.r : a[2]) + 10 }
    } else if (v.f === "teleport_range"){ out.tp = atLv(v.d, lv); out.facts.push(["Distance", `up to ${out.tp} px`]) }
    // Explosion around the first target (client: the hidden follow-up skill's lt/rb, e.g. Arrow Bomb 3101005; meowdb agrees).
    // Anchored on the target's feet, like its position; which point the client centres it on is unconfirmed.
    const X = D.hitact?.ex?.[String(s.id)];
    if (X && out.mob != null){ const [l, r, t, b] = ([...X.L].reverse().find(x => x[0] <= lv) || X.L[0])[1][0];
      out.blast = box(out.mob + l, out.mob + r, t, b);
      out.facts.push(["Explosion", `${r - l} × ${b - t} px around the first target, up to ${atLv(s.mob, lv)} monsters`]) }
    if (out.boxes.length && !out.facts.length){ const b = out.boxes[0];
      out.facts.push(["In front", `${Math.max(0, b.r)} px`], ...(b.l ? [[b.l < 0 ? "Behind" : "Starts", `${Math.abs(b.l)} px${b.l < 0 ? "" : " in front"}`]] : []),
        ["Height", vert(b.t, b.b)]);
      if (out.mob == null) out.mob = b.l < 0 && b.r > 0 ? Math.max(60, b.r * .62) : (b.l + b.r) / 2 }
    if (v.f === "fixed_rectangle" && v.r != null) out.facts.push(["Stored range value", `${atLv(v.r, lv)} px (not the hit box)`]);
    if (v.t) out.facts.push(["Walls", "Needs a clear line to the target"]);
    out.lv = lv; out.plv = plv; return out;
  }
  // "56 px (6 to 62 px above your feet)" / "140 px (70 above to 70 below your feet)"
  function vert(top, bot){ const h = bot - top;
    return bot <= 0 ? `${h} px (${-bot} to ${-top} px above your feet)` : top >= 0 ? `${h} px (${top} to ${bot} px below your feet)` : `${h} px (${-top} above to ${bot} below your feet)` }

  // 1st-job skills a 2nd job also has (the overlay's skill list for a Hunter is Archer + Hunter)
  const FIRST = {Fighter: "Warrior", Page: "Warrior", Spearman: "Warrior", "F/P Wizard": "Magician", "I/L Wizard": "Magician", Cleric: "Magician",
    Hunter: "Archer", Crossbowman: "Archer", Assassin: "Rogue", Bandit: "Rogue"};
  const api = {skRange, skWeapons, vert, atLv, FAM, FIRST};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindSkr = api;
})(typeof window !== "undefined" ? window : globalThis);
