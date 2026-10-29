/* Journey log ("combat log", Danny 2026-10-29, WoW's combat log as the model): a timestamped, machine-parseable line per thing
   the tracker SEES on screen, whether or not a run is being tracked. Screen reading only (the same readers as a run): login,
   map changes, combat starting/ending, EXP, level-ups, deaths, mesos, pickups, potions used, inventory changes, party, job.
   Pure logic (no files, no DOM), loaded by the window and by Node tests; core/journalfile.js writes the lines to disk.

   Line:  2026-10-29T00:34:30.483Z  KIND,field,field,...
   Time is UTC ISO with milliseconds, two spaces, then CSV. Strings are "double quoted" ("" inside); numbers and bare words are
   not. Every kind and its fields are listed in KINDS (docs/ai/tracker.md has the same table). Parse a line with parse().

   createObserver(G, emit) turns the tracker's event stream ({t, type, ...}, see core/session.js) into lines. It keeps its own
   small state (map, combat, last bar, wallet, inventory) so it needs no session. Timing numbers here (COMBAT_IDLE_MS,
   BAR_EVERY_MS, JUMP) are tuning choices, not game numbers. */
(function (root){
  const VERSION = 1;
  const COMBAT_IDLE_MS = 12e3;   // no EXP for this long = combat over
  const BAR_EVERY_MS = 10e3;     // an EXP_BAR line at most this often (it changes with every kill)
  const HUD_GONE_MS = 6e3;       // no status bar for this long = HUD_LOST (char select, loading, cash shop, minimized)
  const JUMP = 0.1;              // a bar gain this share of the level that no EXP message accounts for is held as a suspect jump

  const ts = t => new Date(t).toISOString();
  const field = v => v == null ? "" : typeof v === "number" ? (Number.isInteger(v) ? String(v) : String(Math.round(v * 1e4) / 1e4))
    : /^[A-Za-z0-9_.-]+$/.test(String(v)) && v !== "" ? String(v) : '"' + String(v).replace(/"/g, '""').replace(/[\r\n]+/g, " ") + '"';
  const line = (t, kind, ...f) => ts(t) + "  " + [kind, ...f.map(field)].join(",");
  // the inverse: {t, kind, f: [...]} (numbers back as numbers; "" as null), or null for a line that isn't one
  function parse(s){
    const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)  (.*)$/.exec(String(s).replace(/\r?\n$/, ""));
    if (!m) return null;
    const out = []; let i = 0, rest = m[2];
    while (i <= rest.length){
      let v;
      if (rest[i] === '"'){ let j = i + 1, str = ""; for (; j < rest.length; j++){ if (rest[j] === '"'){ if (rest[j + 1] === '"'){ str += '"'; j++; continue } break } str += rest[j] } v = str; i = j + 2 }
      else { let j = rest.indexOf(",", i); if (j < 0) j = rest.length; const raw = rest.slice(i, j); v = raw === "" ? null : /^-?\d+(\.\d+)?$/.test(raw) ? +raw : raw; i = j + 1 }
      out.push(v);
    }
    return {t: Date.parse(m[1]), kind: out[0], f: out.slice(1)};
  }

  const KINDS = {
    JOURNAL_START: "version, app, source (first line of every file)",
    WATCH_START: "mode (run = a tracked run, watch = reading with no run)",
    WATCH_STOP: "mode, reason",
    RUN_START: "", RUN_STOP: "seconds",
    LOGIN: "level, pct, exp (the status bar showed up after the watch began)",
    HUD_LOST: "(status bar gone: char select, loading, cash shop, minimized)", HUD_BACK: "seconds_away",
    PAUSE: "by (user)", RESUME: "",
    CHARACTER: "name", JOB: "name", PARTY: "size",
    MAP_CHANGE: "map_id, name, from_id, from_name",
    COMBAT_START: "map_id, name",
    COMBAT_END: "seconds, kills, exp, map_id, why (idle|map|hud|stop)",
    EXP_GAIN: "gain, source (kill|party_bonus), combat_exp",
    EXP_BAR: "level, pct, exp, delta_exp",
    EXP_JUMP: "verdict (suspect|confirmed|rejected), level, pct, delta_exp, unexplained_exp",
    EXP_LOSS: "level, pct, lost_exp (a drop with no level-up: a death or a misread; DEATH confirms)",
    LEVEL_UP: "level, seconds_since_last",
    DEATH: "lost_exp (confirmed by the chat box line)",
    MESO_GAIN: "amount",
    WALLET: "balance",
    MESO_CHANGE: "delta, balance, cause (spent|other_income), (wallet moved with no pickup to explain it: shop, trade, fee)",
    ITEM_PICKUP: "id, name, qty, source (kill|box|?)",
    ITEM_UNREAD: "text, qty, candidates",
    ITEM_USED: "id, name, n",
    INV_READ: "tab, kinds, unknown_slots",
    INV_DELTA: "tab, id, name, delta (an item count changed between two reads of the same tab)",
    BOX_OPEN: "items",
    NOTE: "text",
  };

  function createObserver(G, emit, opts = {}){
    const idleMs = opts.combatIdleMs || COMBAT_IDLE_MS;
    const S = {map: null, mapName: null, party: null, job: null, bar: null, barLogged: 0, barLoggedExp: null, seenBar: false, hud: true, hudGoneAt: null, hudAwayAt: null,
      combat: null, lastLevelAt: null, wallet: null, pickedSinceWallet: 0, msgSinceBar: 0, inv: {}, suspect: null, held: false, lastExpT: 0};
    const out = (t, kind, ...f) => emit(t, kind, ...f);
    const mapName = id => G.mapnames?.[id] || G.maps?.[id]?.[0] || null;
    const lvExp = L => G.exp?.[L] || 0;

    function combatEnd(t, why){
      const c = S.combat; if (!c) return;
      S.combat = null;
      if (S.bar && S.bar.exp !== S.barLoggedExp) barLine(t, S.bar, S.bar.exp - (S.barLoggedExp ?? S.bar.exp), true);   // the bar as combat ended
      out(t, "COMBAT_END", Math.round((c.last - c.t0) / 100) / 10, c.kills, c.exp, S.map, why);   // stamped now (lines stay in time order); seconds run to the last EXP
    }
    function combatTouch(t, gain, kill){
      if (!S.combat){ S.combat = {t0: t, last: t, kills: 0, exp: 0}; out(t, "COMBAT_START", S.map, S.mapName) }
      const c = S.combat; c.last = t; c.exp += gain; if (kill) c.kills++;
      return c.exp;
    }
    function barLine(t, e, delta, force){
      if (!force && (t - S.barLogged < BAR_EVERY_MS || delta === 0)) return;
      S.barLogged = t; S.barLoggedExp = e.exp; out(t, "EXP_BAR", e.level, e.pct, e.exp, delta);
    }

    function bar(e){
      const t = e.t, p = S.bar;
      if (!S.seenBar){ S.seenBar = true; S.barLogged = t; S.barLoggedExp = e.exp; out(t, "LOGIN", e.level ?? null, e.pct, e.exp) }
      // a level change: +1 is a level-up (the reader already checked the number fits the %); more than +1, or a level lower, is held until
      // the next read says the same
      if (p && p.level && e.level && e.level !== p.level){
        const ok = e.level === p.level + 1;
        if (!ok){
          if (S.suspect?.kind === "level" && S.suspect.level === e.level){ S.suspect = null; out(t, "EXP_JUMP", "confirmed", e.level, e.pct, null, null) }
          else { S.suspect = {kind: "level", level: e.level}; out(t, "EXP_JUMP", "suspect", e.level, e.pct, null, null); return }   // not taken as the new bar yet
        }
        S.suspect = null;
        out(t, "LEVEL_UP", e.level, S.lastLevelAt ? Math.round((t - S.lastLevelAt) / 1e3) : null); S.lastLevelAt = t;
        combatEnd(t, "level"); S.bar = {...e}; S.barLogged = t; S.barLoggedExp = e.exp; S.msgSinceBar = 0; out(t, "EXP_BAR", e.level, e.pct, e.exp, null); return;
      }
      if (!p || !p.level && !e.level){ S.bar = {...e}; return }
      const level = e.level || p.level, delta = e.exp - p.exp;
      // a gain far bigger than the kills seen since the last read explain: hold it, let the next read confirm or reject it
      const unexplained = delta - S.msgSinceBar;
      if (delta > 0 && lvExp(level) && unexplained > JUMP * lvExp(level)){
        if (S.suspect?.kind === "exp" && Math.abs(e.exp - S.suspect.exp) <= Math.max(5, lvExp(level) * 0.001)){
          S.suspect = null; out(t, "EXP_JUMP", "confirmed", level, e.pct, delta, unexplained);
        } else {
          const had = S.suspect; S.suspect = {kind: "exp", exp: e.exp};
          out(t, "EXP_JUMP", "suspect", level, e.pct, delta, unexplained);
          if (had) out(t, "EXP_JUMP", "rejected", level, e.pct, delta, unexplained);
          return;   // the bar stays where it was: a red herring until a second read agrees
        }
      } else if (S.suspect?.kind === "exp"){ S.suspect = null; out(t, "EXP_JUMP", "rejected", level, e.pct, delta, unexplained) }
      else if (delta < 0 && !(e.level > p.level)){
        const lost = -delta;
        // a few EXP down is the last digit misread, not a loss (same cut as core/session.js)
        if (lost > Math.max(5, lvExp(level) * 0.001)) out(t, "EXP_LOSS", level, e.pct, lost);
      }
      if (delta > 0) S.msgSinceBar = 0;
      S.bar = {...e, level};
      barLine(t, S.bar, delta);
    }

    function wallet(e){
      const t = e.t, n = e.n;
      if (S.wallet == null){ S.wallet = n; S.pickedSinceWallet = 0; out(t, "WALLET", n); return }
      const d = n - S.wallet;
      if (d !== 0){
        const rest = d - S.pickedSinceWallet;   // pickups were already logged as MESO_GAIN
        if (d < 0 || rest > 0) out(t, "MESO_CHANGE", d < 0 ? d : rest, n, d < 0 ? "spent" : "other_income");
      }
      S.wallet = n; S.pickedSinceWallet = 0;
    }

    function inv(e){
      if (e.unknown && e.unknown > (Object.keys(e.items || {}).length || 0)) return;   // mostly unread: a diff would be noise
      const prev = S.inv[e.tab]; S.inv[e.tab] = {...e.items};
      out(e.t, "INV_READ", e.tab, Object.keys(e.items || {}).length, e.unknown || 0);
      if (!prev) return;
      for (const id of new Set([...Object.keys(prev), ...Object.keys(e.items || {})])){
        const d = (+e.items?.[id] || 0) - (+prev[id] || 0);
        if (d && !e.partial?.[id]) out(e.t, "INV_DELTA", e.tab, id, G.items?.[id]?.n || null, d);
      }
    }

    function event(e){
      const t = e.t ?? Date.now();
      switch (e.type){
        case "bar": hudBack(t); bar(e); break;
        case "exp": { S.msgSinceBar += e.gain; S.lastExpT = t; const tot = combatTouch(t, e.gain, true); out(t, "EXP_GAIN", e.gain, "kill", tot); break }
        case "bonus": { S.msgSinceBar += e.gain; S.lastExpT = t; const tot = combatTouch(t, e.gain, false); out(t, "EXP_GAIN", e.gain, "party_bonus", tot); break }
        case "meso": S.pickedSinceWallet += e.amount; out(t, "MESO_GAIN", e.amount); break;
        case "wallet": wallet(e); break;
        case "item": out(t, "ITEM_PICKUP", +e.id, G.items?.[e.id]?.n || null, e.qty || 1, e.src === "box" ? "box" : S.combat ? "kill" : "?"); break;
        case "itemraw": out(t, "ITEM_UNREAD", e.text, e.qty || 1, e.cands?.length || 0); break;
        case "use": out(t, "ITEM_USED", +e.id, G.items?.[e.id]?.n || null, e.n); break;
        case "inv": inv(e); break;
        case "map": {
          const id = e.id ?? null, name = e.name || (id != null ? mapName(id) : null);
          if (id === S.map && name === S.mapName) break;
          combatEnd(t, "map");
          out(t, "MAP_CHANGE", id, name, S.map, S.mapName); S.map = id; S.mapName = name; break }
        case "party": if (e.size !== S.party){ S.party = e.size; out(t, "PARTY", e.size) } break;
        case "job": if (e.name !== S.job){ S.job = e.name; out(t, "JOB", e.name) } break;
        case "pause": if (e.hold){ S.held = true; out(t, "PAUSE", "user") } break;   // a lost HUD is HUD_LOST (from hud()), not this
        case "resume": if (S.held){ S.held = false; out(t, "RESUME") } break;
      }
    }
    function hudBack(t){
      S.hudGoneAt = null;
      if (!S.hud){ S.hud = true; out(t, "HUD_BACK", S.hudAwayAt != null ? Math.round((t - S.hudAwayAt) / 1e3) : null); S.hudAwayAt = null }
    }
    // the status bar seen (or not) on a frame: gone for HUD_GONE_MS = HUD_LOST
    function hud(t, seen){
      if (seen){ if (S.seenBar) hudBack(t); S.hudGoneAt = null; return }
      if (S.hudGoneAt == null) S.hudGoneAt = t;
      if (S.hud && S.seenBar && t - S.hudGoneAt >= HUD_GONE_MS){ S.hud = false; S.hudAwayAt = S.hudGoneAt; combatEnd(t, "hud"); out(t, "HUD_LOST") }
    }
    // time passing with no event: closes a combat that went quiet
    function tick(t){ if (S.combat && t - S.combat.last >= idleMs) combatEnd(t, "idle") }
    function death(t, lost){ out(t, "DEATH", lost) }
    function note(t, kind, ...f){ out(t, kind, ...f) }
    // a watch or run starts: fresh = a new stretch (app launch, game was closed), so LOGIN and the first map/wallet read count again;
    // not fresh = handing the capture between a run and the watch, where nothing about the game changed
    function begin(t, mode, fresh = true){
      if (fresh) Object.assign(S, {seenBar: false, bar: null, map: null, mapName: null, party: null, job: null, wallet: null, pickedSinceWallet: 0, inv: {}, lastLevelAt: null});
      Object.assign(S, {hud: true, hudGoneAt: null, hudAwayAt: null, suspect: null, msgSinceBar: 0, combat: null});
      out(t, "WATCH_START", mode) }
    function end(t, mode, why){ combatEnd(t, "stop"); out(t, "WATCH_STOP", mode, why || "") }
    return {event, hud, tick, death, note, begin, end, state: S};
  }

  /* rotation: given [{name, size, mtime}] of the journal folder, which files to delete so the folder holds at most maxFiles
     and maxBytes (oldest first; the newest file is never deleted) */
  function prune(files, {maxFiles = 10, maxBytes = 40e6} = {}){
    const by = [...files].sort((a, b) => a.mtime - b.mtime || (a.name < b.name ? -1 : 1)), drop = [];
    let total = by.reduce((a, f) => a + f.size, 0), n = by.length;
    while (by.length > 1 && (n > maxFiles || total > maxBytes)){ const f = by.shift(); drop.push(f.name); total -= f.size; n-- }
    return drop;
  }
  const fileName = t => "journal-" + new Date(t).toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-") + ".log";   // journal-20261029-003430.log
  const api = {VERSION, KINDS, COMBAT_IDLE_MS, BAR_EVERY_MS, HUD_GONE_MS, JUMP, ts, field, line, parse, createObserver, prune, fileName};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindJournal = api;
})(typeof window !== "undefined" ? window : globalThis);
