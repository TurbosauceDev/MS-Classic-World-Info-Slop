// Bug-report flight recorder (0.3.42): the pure parts. Three things live here so core.test.js can check them:
//  - the state block ("now") every report's log.json carries, and the settings diff inside it;
//  - the confusion detector that decides when the tracker saves a report by itself (local files only, nothing is sent);
//  - pickFrames, which chooses the ring frames that cover a confused window.
// The frames themselves are the renderer's RECENT ring (renderer.js keepFrame, one picture every 3 s, RING_MAX deep).
(function (root){
  const RING_MAX = 60;   // pictures kept: one per 3 s, so about 3 minutes back
  // what a fresh install has for the keys that have a stated default; any other key that is present counts as changed
  const DEFAULTS = {share: false, idleSec: 60, pruneFrames: true, pruneFramesDays: 30, autoReport: true, onTop: true, fit: true, snap: true, opacity: 1, armRule: true, armKills: 5, armWindowSec: 60};
  // nothing that identifies the player (main.js save-report strips the same three); big saved blobs are summarised, not copied
  const PRIVATE = new Set(["install", "partyCode", "nick"]);
  const BIG = 300;

  const clean = v => { try { const s = JSON.stringify(v); return s && s.length > BIG ? "(" + s.length + " chars)" : v } catch { return null } };
  // only the keys that differ from the defaults, never the identifying ones
  function settingsDiff(settings, defaults = DEFAULTS){
    const out = {};
    for (const [k, v] of Object.entries(settings || {})){
      if (PRIVATE.has(k) || v === undefined) continue;
      if (k in defaults && JSON.stringify(defaults[k]) === JSON.stringify(v)) continue;
      out[k] = clean(v);
    }
    return out;
  }
  const round = n => typeof n === "number" && isFinite(n) ? Math.round(n) : null;
  // the compact "what state was the tracker in" object: one place to look first in a report
  function stateBlock(i){
    const k = i.kpq || null;
    const reason = i.reason || null;   // GrindPauses.current(): hand | kpq | gone | idle | null
    const state = !i.running ? "stopped" : i.wrap ? "wrapping" : reason && reason !== "idle" ? "paused" : "tracking";
    const left = k && k.left != null ? round(k.left - ((i.t || 0) - (k.leftT || 0)) / 1000) : null;
    const now = {
      version: i.version || null,
      at: i.t ? new Date(i.t).toISOString() : null,
      state,
      pause: reason ? {reason, label: i.pauseLabel || null} : null,
      kpq: k ? {on: !!k.on, hold: !!k.hold, rounds: k.rounds || 0, phase: k.phase || null, stage: k.stage?.id || null, epoch: round(k.epoch), left} : {on: false},
      map: {now: i.mapNow ?? null, seen: i.mapSeen ?? null, why: i.mapWhy || null},
      perf: i.perf || null,
      video: i.video ? {w: i.video.w || 0, h: i.video.h || 0} : null,
    };
    if (i.auto) now.auto = i.auto;
    if (i.settings) now.settings = settingsDiff(i.settings, i.defaults || DEFAULTS);
    return now;
  }

  const GAIN = /^(exp|bonus|meso|item|itemraw)$/;
  // The confusion detector. The renderer feeds it what happened (gain(), clock(), mapOk(), minimap()) and asks check() once a
  // second from the existing tick; it never reads a frame itself. A fire is rate-limited: coolMs between two, maxFires a launch.
  function createConfusion(o = {}){
    const c = Object.assign({gainMs: 30e3, gainGapMs: 15e3, mapMs: 60e3, clockMs: 10e3, clockGapMs: 6e3, coolMs: 600e3, maxFires: 6}, o);
    let a, b, clk, mapOkT, miniT, fires = 0, lastFire = -Infinity;
    const reset = () => { a = b = clk = null; mapOkT = miniT = 0 };
    reset();
    const streak = (s, t, gap) => s && t - s.last <= gap ? (s.last = t, s.n++, s) : {since: t, last: t, n: 1};
    const out = {
      cfg: c,
      reset,   // a new Start: the streaks go, the rate limit stays (it is per launch)
      /* an EXP/bar or pickup line was read. reason is the pause reason live at that moment (GrindPauses.current): only a
         screen-gone or between-KPQ-rounds state arms it - a hand pause is the player's call, idle is not a pause. */
      gain(t, reason){ a = reason === "gone" || reason === "kpq" ? Object.assign(streak(a, t, c.gainGapMs), {reason}) : null },
      // the KPQ clock was read; hold = the between-rounds hold is up (and not paused by hand)
      clock(t, hold){ clk = hold ? streak(clk, t, c.clockGapMs) : null },
      mapOk(t){ mapOkT = t; b = null },
      minimap(t){ if (!miniT) miniT = t },
      // ctx: {on: a run is up and not wrapping, held: paused by hand, reason}
      check(t, ctx){
        if (!ctx || !ctx.on || fires >= c.maxFires || t - lastFire < c.coolMs) return null;
        if (!ctx.reason || (ctx.reason !== "gone" && ctx.reason !== "kpq")) a = null;
        let hit = null;
        if (a && a.last - a.since >= c.gainMs && t - a.last <= c.gainGapMs && a.n >= 3)
          hit = {kind: "gain", since: a.since, reason: `EXP or pickups kept arriving for ${Math.round((a.last - a.since) / 1000)} s while the tracker was paused (${a.reason === "kpq" ? "between KPQ rounds" : "game screen gone"})`};
        else if (clk && clk.last - clk.since >= c.clockMs && t - clk.last <= c.clockGapMs && !ctx.held)
          hit = {kind: "clock", since: clk.since, reason: `the KPQ clock was on screen for ${Math.round((clk.last - clk.since) / 1000)} s but the between-rounds pause did not lift`};
        else if (miniT && !ctx.held && ctx.reason !== "gone" && t - Math.max(mapOkT, miniT) > c.mapMs)
          hit = {kind: "map", since: Math.max(mapOkT, miniT), reason: `the map name was not read for ${Math.round((t - Math.max(mapOkT, miniT)) / 1000)} s although the minimap had been found`};
        if (!hit) return null;
        fires++; lastFire = t; a = clk = null; mapOkT = t;   // the map clock starts over so a long outage can fire again only after coolMs
        return hit;
      },
      fires: () => fires,
    };
    return out;
  }
  // the ring frames worth saving: those from fromT on, at most max, and never fewer than minKeep from the tail
  function pickFrames(frames, fromT, max = RING_MAX, minKeep = 10){
    const f = frames || [], from = f.filter(x => x.t >= fromT);
    return (from.length >= minKeep ? from : f.slice(-minKeep)).slice(-max);
  }
  const Flight = {RING_MAX, DEFAULTS, GAIN, settingsDiff, stateBlock, createConfusion, pickFrames};
  root.GrindFlight = Flight;
  if (typeof module !== "undefined") module.exports = Flight;
})(typeof window !== "undefined" ? window : globalThis);
