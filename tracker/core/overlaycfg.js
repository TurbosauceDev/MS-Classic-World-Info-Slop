// Overlay settings -> the state the overlay page boots from (pure, Node-tested). main.js's `ov-state` used to hand the
// page only {edit, widgets, desk}, so the Snap/Grid preferences, the edit panel's spot and every layout profile were
// saved on each change but never restored on the next launch (found 2026-10-28).
(function (root){
  const KEYS = ["edit", "widgets", "snap", "grid", "gsize", "panel", "profile", "profiles"];
  const plain = o => o && typeof o === "object" && !Array.isArray(o);
  function state(settings){
    const o = plain(settings && settings.overlay) ? settings.overlay : {}, out = {};
    for (const k of KEYS) if (o[k] !== undefined) out[k] = o[k];
    if (!plain(out.widgets)) out.widgets = {};
    if (!plain(out.profiles)) delete out.profiles;
    if (!plain(out.panel)) delete out.panel;
    if (typeof out.profile !== "string") delete out.profile;
    return out;
  }
  const api = {state, KEYS};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindOverlayCfg = api;
})(typeof window !== "undefined" ? window : globalThis);
