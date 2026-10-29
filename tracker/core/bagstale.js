// Bag check reminders (pure, Node-tested; also loaded by the window and the overlay page). Each inventory tab (Equip, Use,
// Etc) has a "last read" time from the CV inventory reader; this turns its age into a stage and a colour.
// Danny's ramp (2026-10-29): green while fresh -> yellow when a check is due -> orange after 30 s of yellow -> redder as
// it gets staler -> a gentle glow at the end of the 2-minute ramp. "Fresh for" (EVERY, minutes) is the player's own
// setting; 5 min is a starting guess, not a game number.
(function (root){
  const EVERY = 5, SOON = 30e3, RAMP = 120e3;
  const TABS = [["equip", "Equip"], ["use", "Use"], ["etc", "Etc"]];
  const every = m => { const n = +m; return Number.isFinite(n) && m !== "" && m !== null ? Math.min(30, Math.max(1, Math.round(n))) : EVERY };
  // overdue = ms past the "fresh for" window. Hue: green 130 -> yellow 50 (held 30 s) -> orange -> red 0 at 2 min, then glow.
  function level(ageMs, everyMin){
    const over = ageMs - every(everyMin) * 60e3;
    if (!(over >= 0)) return {stage: "ok", over: 0, hue: 130, pulse: false};
    const hue = over < SOON ? 50 : Math.round(50 - 50 * Math.min(1, (over - SOON) / (RAMP - SOON)));
    return {stage: over < SOON ? "soon" : over < RAMP ? "late" : "now", over, hue, pulse: over >= RAMP};
  }
  // tabs: [{k, name, last, age, ...level}] — a tab never read counts from the run start t0; not tracking = idle (grey)
  function tabs(invTabs, t0, now, everyMin, on){
    return TABS.map(([k, name]) => {
      const last = invTabs && invTabs[k] && invTabs[k].last || null, base = last || t0;
      if (!on || !base) return {k, name, last, age: null, stage: "idle", over: 0, hue: null, pulse: false};
      const age = Math.max(0, now - base);
      return {k, name, last, age, ...level(age, everyMin)};
    });
  }
  const color = l => l.hue == null ? "currentColor" : `hsl(${l.hue} 72% ${l.stage === "ok" ? 48 : 52}%)`;
  // small line icons, stroke = currentColor (the caller sets it to the stage colour)
  const ICONS = {
    equip: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g transform="rotate(45 12 12)"><path d="M12 1.5l2.2 3.2V14h-4.4V4.7z"/><path d="M7 14h10"/><path d="M12 14v5.2"/><circle cx="12" cy="21" r="1.1"/></g></svg>`,
    use: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 3h5M10.5 3v5L5.5 18a2 2 0 0 0 1.8 3h9.4a2 2 0 0 0 1.8-3l-5-10V3"/><path d="M7.5 15h9"/></svg>`,
    etc: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/></svg>`,
  };
  const api = {EVERY, SOON, RAMP, TABS, every, level, tabs, color, ICONS};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindBag = api;
})(typeof window !== "undefined" ? window : globalThis);
