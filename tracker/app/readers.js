/* Screen readers: one game frame (RGBA, already un-doubled by shotNative from shot.js) -> tracker events.
   Each reader finds its own UI element, so window size and position don't matter. Pickup messages stay on screen for a
   few seconds, so readFrame() remembers what it already reported and only emits new lines.

   Status: the frame pipeline and dedupe are here; the four element finders still need real game frames to be built and
   tested against (record some with "Save sample frames"). Until then they return nothing. */
(function (root){
  function createReaders(G){
    const seen = new Map();   // pickup line text -> last time seen, so a message on screen for 5 s counts once
    const fresh = (key, t) => { const prev = seen.get(key); seen.set(key, t); return !prev || t - prev > 1500 };

    // TODO(frames): find the bottom status bar, read "EXP <n>[<pct>%]" with shotText and the level digits
    function readBar(img){ return null }
    // TODO(frames): find the pickup/system message lines (white text) and read them:
    //   "You have gained experience (+N)", "You have gained mesos (+N)", "You have gained an item (<name>)"
    // Item names need a letter font (SHOT_FONT only has digits); names map to ids via G.items.
    function readPickups(img){ return [] }
    // TODO(frames): match the minimap to D.mmaps thumbnails or read the map name above it
    function readMap(img){ return null }
    // TODO(frames): count party member HP bars
    function readParty(img){ return null }

    let lastMap = null, lastParty = null, lastBar = null;
    function readFrame(img, t){
      const ev = [];
      const map = readMap(img); if (map && map !== lastMap){ ev.push({t, type: "map", id: map}); lastMap = map }
      const party = readParty(img); if (party && party !== lastParty){ ev.push({t, type: "party", size: party}); lastParty = party }
      for (const p of readPickups(img)) if (fresh(p.key, t)) ev.push({t, ...p.event});
      const bar = readBar(img); if (bar && (!lastBar || bar.exp !== lastBar.exp)){ ev.push({t, type: "bar", ...bar}); lastBar = bar }
      return ev;
    }
    return {readFrame};
  }
  const api = {createReaders};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindReaders = api;
})(typeof window !== "undefined" ? window : globalThis);
