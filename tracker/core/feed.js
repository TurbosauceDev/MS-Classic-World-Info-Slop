/* The run log (Danny, 2026-10-18: "like World of Warcraft's combat log", batched every second or few). Pure: it looks at the
   session's state (core/session.js createSession().state) every few seconds and turns what changed into lines, so a
   busy map gives one line per kind per batch instead of a line per kill or pickup. No DOM; core.test.js runs it in Node.

   step(S, t, who) -> [{t, kind, text, who?, n?, detail?, parts?, unread?}]   kind: exp | meso | loot | level | death | map
     text is the whole line; the other fields let the window style it (parts: [{id, n, name}] for item icons) */
(function (root){
  const EVERY = 2000;
  const fmt = n => Math.round(n).toLocaleString("en-US");
  function createFeed(G, opts = {}){
    const every = opts.every || EVERY;
    let prev = null, lastT = 0;
    const snap = S => ({exp: S.msgExp, kills: S.kills, mob: Object.fromEntries(Object.entries(S.byMob).map(([k, m]) => [k, m.kills])),
      mesos: S.mesos, items: {...S.items}, unread: S.unreadItems, level: S.level, deaths: S.deaths, map: S.map, mapName: S.mapName});
    const mobName = id => G.mobs[id]?.[0] || "Monster " + id, itemName = id => G.items[id]?.n || "Item " + id;
    // "5 Blue Snails, 3 Snails, 1 more": at most three names, most killed first
    const list = (pairs, name) => { pairs.sort((a, b) => b[1] - a[1]); const shown = pairs.slice(0, 3).map(([id, n]) => n + " " + name(id)), more = pairs.slice(3).reduce((a, p) => a + p[1], 0);
      return shown.join(", ") + (more ? `, ${more} more` : "") };
    function step(S, t, who = "You", force = false){   // force: now, whatever the batch time (at Stop)
      if (!prev){ prev = snap(S); lastT = t; return [] }
      if (!force && t - lastT < every) return [];
      const now = snap(S), out = [], you = who === "You", has = you ? "have" : "has";
      lastT = t;
      // a map change first: what follows happened on the new map
      if (now.map !== prev.map && (now.map || now.mapName)) out.push({t, kind: "map", text: `${who} entered ${G.mapnames?.[now.map] || G.maps[now.map]?.[0] || now.mapName || "a new map"}`});
      const exp = now.exp - prev.exp, kills = now.kills - prev.kills;
      if (exp > 0){
        const ks = Object.entries(now.mob).map(([id, n]) => [id, n - (prev.mob[id] || 0)]).filter(p => p[1] > 0), named = ks.reduce((a, p) => a + p[1], 0);
        if (kills > named) ks.push(["?", kills - named]);
        // monsters named when known (an unknown map, or a party member's kill, has none)
        const detail = kills > 0 ? `from ${kills} kill${kills > 1 ? "s" : ""}` + (named ? ` (${list(ks, id => id === "?" ? "other" : mobName(id))})` : "") : "";
        out.push({t, kind: "exp", who, n: exp, detail, text: `${who} gained ${fmt(exp)} EXP` + (detail ? " " + detail : "")});
      }
      const mesos = now.mesos - prev.mesos;
      if (mesos > 0) out.push({t, kind: "meso", who, n: mesos, text: `${who} picked up ${fmt(mesos)} mesos`});
      const got = Object.entries(now.items).map(([id, n]) => [id, n - (prev.items[id] || 0)]).filter(p => p[1] > 0), unread = now.unread - prev.unread;
      if (got.length || unread > 0){
        const parts = got.sort((a, b) => b[1] - a[1]).map(([id, n]) => ({id, n, name: itemName(id)}));
        out.push({t, kind: "loot", who, parts, unread: Math.max(0, unread), text: `${who} looted ` + [...parts.map(p => p.n + " " + p.name), ...(unread > 0 ? [unread + " item" + (unread > 1 ? "s" : "") + " that didn't read"] : [])].join(", ")});
      }
      if (now.level > prev.level && prev.level) out.push({t, kind: "level", text: `${who} ${has} reached level ${now.level}!`});
      if (now.deaths > prev.deaths) out.push({t, kind: "death", text: `${who} died` + (now.deaths - prev.deaths > 1 ? ` (${now.deaths - prev.deaths} times)` : "")});
      prev = now;
      return out;
    }
    return {step, reset(){ prev = null }};
  }
  const api = {createFeed, EVERY};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindFeed = api;
})(typeof window !== "undefined" ? window : globalThis);
