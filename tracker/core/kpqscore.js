/* core/kpqscore.js — KPQ round scoring (Rush + Bonus). One module for the tracker (live preview, event log) and the server
   (recomputes every score from the raw numbers a round sends, so a formula change re-scores old rounds). Pure maths.

   Every weight below is OUR OWN scoring design (Danny asked for it, 2026-10-29), not game data; game numbers it reads are
   NPC sell prices (OSMS export, items.p) and the stage times/EXP/mesos the tracker measured.

   RAW ROUND (what a tracker sends): {stages: {stageId: sec}, clear, rush: {loot}, bonus: {sec, exp, mesos, kills, loot}|null}
   loot = {etc, use, scroll, equip, pan, npc}: item counts per tab, Pan Lid count, and the NPC sell value of everything picked up
   REF (from recorded runs, server summary kpq.ref): {n, med: {stageId: sec}, best: {stageId: sec}, bonusMed, perPoint}|null
     — null until REF_MIN rounds exist: then speed points are 0 and the round is flagged provisional (no made-up averages)

   RUSH  = CLEAR_BASE + sum over the 5 Rush stages of STAGE_W * z + PERFECT (every stage z >= PERFECT_Z) + loot points
     z = (median - time) / (median - best), clamped to [-1, 1.5]: 0 = average pace, 1 = as fast as the record, 1.5 = a new
     record by half the gap again; -1 = as far over average as the record is under (can take points away, never below 0 total)
   BONUS = (EXP + mesos + NPC value of drops) * perPoint + loot points
     perPoint = 1000 / median bonus gain of recorded rounds (an average Bonus is worth 1000, like an average Rush); until REF_MIN
     rounds exist, DEFAULT_PER_POINT (provisional)
   loot points = ETC_PTS/USE_PTS/SCROLL_PTS/EQUIP_PTS per item, PAN_PTS per Pan Lid (Danny's 1/2/30/5/200, x5 so they are
     visible next to ~1000-point sections), plus NPC value * perPoint for Rush loot (Bonus counts it inside its gain)
   TOTAL = Rush + Bonus; "what could have been" = a player's best Rush + best Bonus; MMR-style rating = mean of totals */
(function (root){
  const RUSH_STAGES = ["80000000", "80000100", "80000200", "80000300", "80000400"], BONUS_STAGE = "80000500";
  const REF_MIN = 10, CLEAR_BASE = 1000, STAGE_W = 100, PERFECT = 500, PERFECT_Z = 0.8, Z_MIN = -1, Z_MAX = 1.5;
  const ETC_PTS = 5, USE_PTS = 10, SCROLL_PTS = 150, EQUIP_PTS = 25, PAN_PTS = 1000, PAN_ID = "1092002";
  const DEFAULT_PER_POINT = 1 / 100;   // provisional: 100 meso-equivalents = 1 point, until recorded rounds set it
  const CAT = {Etc: "etc", Setup: "etc", Consumable: "use", Scroll: "scroll", Equipment: "equip"};
  const emptyLoot = () => ({etc: 0, use: 0, scroll: 0, equip: 0, pan: 0, npc: 0});

  // items picked up (id -> count) -> loot summary. items: G.items / D.items shape {id: {c: category, p: NPC sell price}}
  function lootSummary(items, counts){
    const l = emptyLoot();
    for (const [id, n] of Object.entries(counts || {})){
      if (!(n > 0)) continue;
      const it = items?.[id]; if (!it) continue;
      const k = CAT[it.c]; if (k) l[k] += n;
      if (String(id) === PAN_ID) l.pan += n;
      l.npc += n * (it.p || 0);
    }
    return l;
  }
  const lootBonus = l => (l.etc || 0) * ETC_PTS + (l.use || 0) * USE_PTS + (l.scroll || 0) * SCROLL_PTS + (l.equip || 0) * EQUIP_PTS + (l.pan || 0) * PAN_PTS;
  const zOf = (ref, id, sec) => {
    const m = ref?.med?.[id], b = ref?.best?.[id];
    if (!(m > 0) || !(sec >= 0)) return null;
    if (!(b > 0) || b >= m) return 0;
    return Math.max(Z_MIN, Math.min(Z_MAX, (m - sec) / (m - b)));
  };
  const perPoint = ref => ref?.perPoint > 0 ? ref.perPoint : DEFAULT_PER_POINT;

  function rush(raw, ref){
    const st = raw.stages || {}, zs = {};
    let speed = 0, have = 0;
    for (const id of RUSH_STAGES){ const z = zOf(ref, id, st[id]); if (z === null) continue; zs[id] = Math.round(z * 100) / 100; speed += STAGE_W * z; have++ }
    const perfect = have === RUSH_STAGES.length && Object.values(zs).every(z => z >= PERFECT_Z) ? PERFECT : 0;
    const l = raw.rush?.loot || emptyLoot(), loot = lootBonus(l) + (l.npc || 0) * perPoint(ref);
    const pts = Math.max(0, Math.round(CLEAR_BASE + speed + perfect + loot));
    return {pts, speed: Math.round(speed), perfect, loot: Math.round(loot), z: zs, provisional: have < RUSH_STAGES.length};
  }
  function bonus(raw, ref){
    const b = raw.bonus; if (!b) return null;
    const l = b.loot || emptyLoot(), gain = (b.exp || 0) + (b.mesos || 0) + (l.npc || 0), pp = perPoint(ref);
    const loot = lootBonus(l);
    return {pts: Math.max(0, Math.round(gain * pp + loot)), gain, loot, provisional: !(ref?.perPoint > 0)};
  }
  function score(raw, ref){
    const r = rush(raw, ref), b = bonus(raw, ref);
    return {rush: r, bonus: b, total: r.pts + (b ? b.pts : 0), provisional: r.provisional || !!b?.provisional};
  }

  // reference from recorded rounds: rounds = [{stages: {id: sec}, bonus: {exp, mesos, loot: {npc}}|null}] (counted ones only)
  function medianOf(a){ const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : null }
  function buildRef(rounds){
    const med = {}, best = {};
    for (const id of RUSH_STAGES){
      const v = rounds.map(r => r.stages?.[id]).filter(x => x > 0);
      if (v.length >= REF_MIN){ med[id] = medianOf(v); best[id] = Math.min(...v) }
    }
    const gains = rounds.filter(r => r.bonus).map(r => (r.bonus.exp || 0) + (r.bonus.mesos || 0) + (r.bonus.loot?.npc || 0)).filter(x => x > 0);
    const pp = gains.length >= REF_MIN ? 1000 / medianOf(gains) : null;
    return {n: rounds.length, med, best, perPoint: pp, bonusMed: gains.length >= REF_MIN ? Math.round(medianOf(gains)) : null};
  }

  const api = {RUSH_STAGES, BONUS_STAGE, REF_MIN, PAN_ID, DEFAULT_PER_POINT, lootSummary, lootBonus, emptyLoot, zOf, rush, bonus, score, buildRef, medianOf,
    WEIGHTS: {CLEAR_BASE, STAGE_W, PERFECT, PERFECT_Z, ETC_PTS, USE_PTS, SCROLL_PTS, EQUIP_PTS, PAN_PTS}};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindKpq = api;
})(typeof window !== "undefined" ? window : globalThis);
