// One pause model (0.3.41): every way the tracker stops counting — the Pause button, the screen-gone auto-pause,
// the KPQ between-rounds hold and the idle break — maps to one of these reasons. The state pill (renderState)
// shows the current reason so the status line isn't the only place it lives. Pure, so core.test.js can check it.
(function (root){
  const LABELS = {
    hand: "Paused: by you",
    gone: "Paused: the game screen is gone",
    kpq: "Paused: between KPQ rounds",
    town: "In town: time not counted",
    waiting: "Waiting: starts when you start farming",
    idle: "Idle: time not counted"
  };
  const GrindPauses = {
    LABELS,
    label(k){ return LABELS[k] || "Paused" },
    /* which reason is live right now. Precedence: a hand pause wins (only Go on lifts it), then the KPQ hold
       (only the next stage or clock lifts it), then the screen-gone auto-pause (pausedAt set, neither of those),
       then the town note (0.3.46: on a no-monster map nothing is credited — not a pause, the session keeps reading),
       then waiting to arm (0.3.46: counting starts at the KPQ round or a real farming rate), then the idle break —
       which is not a pause at all (the session keeps running, the slicer just breaks the 15-minute runs), so it only
       shows while tracking and nothing else is holding. */
    current(s){
      if (s.held) return "hand";
      if (s.kpqHold) return "kpq";
      if (s.paused) return "gone";
      if (s.town) return "town";
      if (s.waiting) return "waiting";
      if (s.idleMs && s.lastExpT && s.now - s.lastExpT >= s.idleMs) return "idle";
      return null;
    }
  };
  root.GrindPauses = GrindPauses;
  if (typeof module !== "undefined") module.exports = GrindPauses;
})(typeof window !== "undefined" ? window : globalThis);
