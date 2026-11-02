// Quest log (Danny 10-21, Training › Quest log): read the in-game QUEST window from a recording (scroll slowly through
// the Completed tab, then In Progress) or screenshots, list what's done / on / open, and plan the picked quests.
// Reading: category bars by colour (tan groups, blue-grey regions), the open tab by its pink highlight, each row's text by
// width + ink shape against the quest-log names (`ln`: questline name, else the quest's own) of the bar it sits under,
// rendered in Arial (the game's UI font; Liberation Sans/Arimo have the same widths). Names cut with "..." match by prefix.
// Planning: one route for every picked quest (and the earlier quests they need): accept, hunt each monster once for all
// quests that want it (kill counts count for every accepted quest at once; drops add up), buy shop items, turn in, in the
// order with the least travel + kill time (greedy nearest task, two starting rules, the faster kept). Travel, kill spots
// and your character come from the Path Planner (60-planner.js: travel, killSpot, charAt, X). window.QLOG for tests.
const QLOG = (() => {
  const {charAt, killSpot, tripSec, routeText, npcSpot, okMob, mapName, hm, OPENMAP, JOBTOWN, QUEST_SEC} = PLANNER, X = () => PLANNER.X;
  // the reading core (bars, rows, votes, settle) lives in 60b-questread.js, shared with the grind tracker's Quests
  // card (P1-7): it gets the quest rows and the class tie-breaker, the reader comes back out
  const {readFrame, reader, settle, matchLine, matchBar, rend, l1, dtw, CAT, CATS, BYLN, BYID, ALLQ, lnOf, curStep} =
    QuestRead.create([...D.quests.map(r => ["q", r]), ...D.citq.map(r => ["cit", r])]
      .filter(([, r]) => !["El Nath", "Orbis", "Forgotten Hollow"].includes(r.region)), {cls: () => X().cls});
  // (the file-ingest wrapper stays here: it decodes dropped/pasted recordings, which only a page does)

  async function readFiles(files, onProg = () => {}){
    const rd = reader(); let frames = 0, used = 0;
    const take = c => { const fr = readFrame(c.getContext("2d", {willReadFrequently: true}).getImageData(0, 0, c.width, c.height)); frames++; if (rd.add(fr)) used++ };
    const list = [...files].sort((a, b) => (a.type.startsWith("video") ? 1 : 0) - (b.type.startsWith("video") ? 1 : 0));
    for (let fi = 0; fi < list.length; fi++){
      const f = list[fi], c = document.createElement("canvas");
      if (f.type.startsWith("image")){
        const bm = await createImageBitmap(f); c.width = bm.width; c.height = bm.height; c.getContext("2d").drawImage(bm, 0, 0); take(c); onProg((fi + 1) / list.length);
      } else if (f.type.startsWith("video")){
        const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = URL.createObjectURL(f);
        await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = () => no(new Error("video")) });
        c.width = v.videoWidth; c.height = v.videoHeight; const cc = c.getContext("2d", {willReadFrequently: true});
        for (let t = 0; t < v.duration; t += 0.25){   // 4 frames a second: a slow scroll moves under one row between them
          v.currentTime = t; await new Promise(ok => { v.onseeked = ok });
          cc.drawImage(v, 0, 0); take(c); onProg((fi + Math.min(1, t / v.duration)) / list.length);
        }
        URL.revokeObjectURL(v.src);
      }
    }
    return settle(rd, frames, used);
  }

  // ---------- state ----------
  const S = {done: [], prog: {}, pick: [], lv: 30, from: "", cats: null, at: ""};
  try { const o = JSON.parse(localStorage.getItem("qlog") || "null");
    if (o && typeof o === "object"){
      if (Array.isArray(o.done)) S.done = o.done.filter(i => BYID.has(String(i))).map(String);
      if (o.prog && typeof o.prog === "object") for (const [i, n] of Object.entries(o.prog)) if (BYID.has(i) && typeof n === "string") S.prog[i] = n;
      if (Array.isArray(o.pick)) S.pick = o.pick.filter(i => BYID.has(String(i))).map(String);
      if (Number.isInteger(o.lv) && o.lv >= 1 && o.lv <= MAX_LEVEL) S.lv = o.lv;
      if (typeof o.from === "string" && (o.from === "" || D.maps[o.from])) S.from = o.from;
      if (typeof o.at === "string") S.at = o.at.slice(0, 30);
      if (o.cats && typeof o.cats === "object") S.cats = o.cats;
    } } catch(e) {}
  const save = () => { try { localStorage.setItem("qlog", JSON.stringify(S)) } catch(e) {}
    // Keep or sell and the Path Planner read done quests from pathdone ("q<id>", non-Citizenship)
    try { const pd = new Set(JSON.parse(localStorage.getItem("pathdone") || "[]")); for (const i of S.done) if (BYID.get(i)?.[0] === "q") pd.add("q" + i); localStorage.setItem("pathdone", JSON.stringify([...pd])) } catch(e) {} };

  // ---------- which quests ----------
  // done = read/ticked + everything a quest you're on needed first (its earlier quests, earlier steps of its questline)
  const DONE = () => { const d = new Set(S.done), up = id => { const r = BYID.get(id)?.[1]; if (!r) return;
      for (const p of r.pre || []) if (!d.has(String(p))){ d.add(String(p)); up(String(p)) }
      if (r.chain) for (const [, q] of CAT.get(r.region)?.get(r.chain) || []) if ((q.cpos || 0) < (r.cpos || 0) && !d.has(String(q.id))){ d.add(String(q.id)); up(String(q.id)) } };
    for (const id of Object.keys(S.prog)) up(id); return d };
  const classOK = r => !["Warrior", "Magician", "Bowman", "Thief"].includes(r.region) || r.region === X().cls;
  function status(r, done = DONE()){
    const id = String(r.id);
    if (done.has(id)) return "done";
    if (S.prog[id]) return "prog";
    if (!classOK(r)) return "other";
    if ((r.pre || []).some(p => BYID.has(String(p)) && !done.has(String(p)))) return "locked";
    return r.lvl <= S.lv ? "open" : r.lvl <= S.lv + 5 ? "soon" : "later";
  }

  // ---------- planning ----------
  const isQuestItem = id => +id >= 4031000 && +id < 4033000;   // quest items only drop while the quest is on
  const shopFor = id => (D.ishop?.[id] || []).filter(s => s[4] !== "COT2").sort((a, b) => a[3] - b[3])[0] || null;
  function plan(ids, opt = {}){
    const done = DONE(), L = opt.lv || S.lv, ch = charAt(L), notes = [];
    // the picked quests and the earlier ones they need, in need order
    const want = new Map(), add = (id, why) => { id = String(id); if (done.has(id) || want.has(id) || !BYID.has(id)) return; const r = BYID.get(id)[1];
      for (const p of r.pre || []) add(p, r); want.set(id, {r, added: why}); };
    ids.forEach(i => add(i, null));
    const Q = [...want.values()];
    for (const q of Q) if (q.added) notes.push(`${q.r.name} added: ${q.added.name} needs it first.`);
    // tasks
    const T = [];
    for (const q of Q){
      const r = q.r, spot = npcSpot(r.npc), on = !!S.prog[String(r.id)];
      q.acc = on ? null : {kind: "accept", q, map: spot, dep: (r.pre || []).map(String).filter(p => want.has(p)).map(p => want.get(p))};
      q.turn = {kind: "turn", q, map: spot, dep: []};
      if (q.acc) T.push(q.acc); T.push(q.turn);
      if (!spot) notes.push(`${r.name}: ${r.npc || "its NPC"} has no known map spot, so its walks aren't counted.`);
    }
    // hunts: one per monster and "wave" (a later quest in a chain needs its own visit), kills = max(kill counts, drops wanted / drop rate)
    const depth = q => q._d ?? (q._d = Math.max(0, ...(q.r.pre || []).map(String).filter(p => want.has(p)).map(p => depth(want.get(p)) + 1)));
    const H = new Map(), CR = new Map(), rate = opt.drop || X().drop;
    const have = opt.have || {};
    for (const q of Q){
      for (const [mob, n] of q.r.kl || []){ if (!D.mobs[mob]) continue; const key = mob + "|" + depth(q); const h = H.get(key) || {kind: "hunt", mob: String(mob), kills: 0, items: [], qs: new Set(), dep: [], for: new Set()}; h.kills = Math.max(h.kills, n); h.qs.add(q); H.set(key, h) }
      for (const [name, n, src, iid] of q.r.il || []){ const need = n - Math.min(n, have[iid] || 0); if (need) get(iid, name, need, q, q.turn, src, 0) }
    }
    // an item for quest q, needed before task `forT` (its turn-in, or a craft): the quest's own monster, else the one players
    // report dropping it most (meowdb, D.drops), else an NPC shop, else a recipe (its materials the same way, 2 levels deep)
    function get(iid, name, need, q, forT, src, lvl){
      if (!(src && D.mobs[src] && okMob(String(src)))) src = (D.drops?.[iid] || []).filter(([m]) => D.mobs[m] && okMob(String(m))).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      if (src){ src = String(src); const key = src + "|" + depth(q); const h = H.get(key) || {kind: "hunt", mob: src, kills: 0, items: [], qs: new Set(), dep: [], for: new Set()};
        h.items.push([name, need, iid, q]); h.qs.add(q); h.for.add(forT); H.set(key, h); return }
      const sh = shopFor(iid);
      if (sh){ const b = {kind: "buy", q, item: [name, need, iid], shop: sh, map: sh[1], dep: []}; T.push(b); forT.dep.push(b); return }
      // crafting is the player's own skill (Classic World: a level per profession, set in Crafting › Your craft levels):
      // the lowest-level recipe your level allows, crafted where you are; above your level, buy it from players instead
      const all = (D.craft?.rec || []).filter(c => String(c[3]) === String(iid) && c[2] <= CRAFT_CAP).sort((a, b) => a[2] - b[2]);
      const mine = d => window.CPLAN?.S?.lv?.[d] || 0, rc = lvl < 2 && all.find(c => c[2] <= mine(c[0]));
      if (rc){ const disc = D.craft.disc[rc[0]][0], times = Math.ceil(need / (rc[4] || 1));
        // one craft step per item: a second quest wanting it adds to the count (and to its materials)
        let c = CR.get(iid);
        if (c){ c.item[1] += need; c.times += times; c.fee += (rc[6] || 0) * times; c.cexp += (rc[5] || 0) * times; c.qs.add(q) }
        else { c = {kind: "craft", q, qs: new Set([q]), item: [name, need, iid], times, disc, lv: rc[2], my: mine(rc[0]), fee: (rc[6] || 0) * times, cexp: (rc[5] || 0) * times, map: null, dep: []}; CR.set(iid, c); T.push(c) }
        if (!forT.dep.includes(c)) forT.dep.push(c);
        for (const [m, k] of rc[7]) get(String(m), D.items[m]?.n || m, k * times, q, c, null, lvl + 1);
        return }
      if (all.length){ const need1 = all[0], disc = D.craft.disc[need1[0]][0], pr = typeof pwPrice === "function" ? pwPrice(iid) : null;
        const b = {kind: "market", q, item: [name, need, iid], price: pr, why: `${disc} Lv ${need1[2]} makes it (yours: ${mine(need1[0]) || "not learned"})`, map: null, dep: []};
        T.push(b); forT.dep.push(b); return }
      notes.push(`${name} × ${need} for ${q.r.name}: no monster, shop or recipe source in our data (another quest, or an NPC hands it over).`);
    }
    for (const h of H.values()){
      const drops = h.items.reduce((a, [, n]) => a + n, 0);
      h.kills = Math.max(h.kills, Math.ceil(drops / rate));
      // kills count only for accepted quests; quest items only drop while their quest is on
      h.dep = [...h.qs].filter(q => q.acc && ((q.r.kl || []).some(([m]) => String(m) === h.mob) || h.items.some(([, , iid, iq]) => iq === q && isQuestItem(iid)))).map(q => q.acc);
      for (const q of h.qs) if ((q.r.kl || []).some(([m]) => String(m) === h.mob)) q.turn.dep.push(h);
      for (const f of h.for || []) f.dep.push(h);
      T.push(h);
    }
    for (const q of Q){ if (q.acc) q.turn.dep.push(q.acc); for (const p of q.acc?.dep || []) { /* a later step: its giver only offers it once the earlier one is turned in */ } }
    for (const q of Q) if (q.acc) q.acc.dep = q.acc.dep.map(p => p.turn);

    // greedy: from where you are, the available task with the least travel + time; two rules for ties/order, keep the faster
    const run = rule => {
      const doneT = new Set(), steps = []; let pos = opt.from || S.from || T.find(t => t.map)?.map || null, sec = 0, exp = 0, mesos = 0;
      for (let guard = 0; doneT.size < T.length && guard < 2000; guard++){
        const ready = T.filter(t => !doneT.has(t) && t.dep.every(d => doneT.has(d)));
        if (!ready.length) break;
        let best = null;
        for (const t of ready){
          let c;
          if (t.kind === "hunt"){ const s = killSpot(t.mob, t.kills, pos, L, ch, false); c = s ? {map: s.map[0], tr: s.tr, work: s.kill} : {map: pos, tr: 0, work: Infinity, none: true} }
          else { const tr = t.map && pos ? tripSec(pos, t.map) : 0; c = {map: t.map || pos, tr, work: t.kind === "buy" ? 20 : t.kind === "market" ? 60 : t.kind === "craft" ? 10 + 3 * t.times : QUEST_SEC / 2} }
          const pri = rule === "accept-first" && t.kind === "accept" ? -1e6 : 0, v = c.tr + (isFinite(c.work) ? c.work : 1e7) + pri;
          if (!best || v < best.v) best = {t, c, v};
        }
        const {t, c} = best; doneT.add(t);
        const st = {kind: t.kind, map: c.map, travel: c.tr, route: pos && c.map && pos !== c.map ? routeText(pos, c.map) : "", sec: isFinite(c.work) ? c.work : null, none: c.none};
        if (t.kind === "hunt"){ st.mob = t.mob; st.kills = t.kills; st.items = t.items.map(([n, k]) => [n, k]); st.qs = [...t.qs].map(q => q.r); if (isFinite(c.work)) exp += D.mobs[t.mob][3] * t.kills }
        else if (t.kind === "buy"){ st.item = t.item; st.shop = t.shop; st.q = t.q.r }
        else if (t.kind === "craft"){ Object.assign(st, {item: t.item, times: t.times, disc: t.disc, lv: t.lv, my: t.my, fee: t.fee, cexp: t.cexp, q: t.q.r, qs: [...t.qs].map(q => q.r)}); mesos -= t.fee }
        else if (t.kind === "market"){ Object.assign(st, {item: t.item, price: t.price, why: t.why, q: t.q.r}); if (t.price?.v) mesos -= t.price.v * t.item[1] }
        else { st.q = t.q.r; if (t.kind === "turn"){ exp += t.q.r.exp || 0; mesos += t.q.r.mesos || 0 } }
        sec += c.tr + (isFinite(c.work) ? c.work : 0); if (c.map) pos = c.map; steps.push(st);
      }
      return {steps, sec, exp, mesos, left: T.length - doneT.size};
    };
    const a = run("nearest"), b = run("accept-first"), best = b.sec < a.sec ? b : a;
    return {...best, notes, quests: Q.map(q => q.r), rate, L, est: ch.est};
  }

  // ---------- page ----------
  const page = $("#qlog"); if (!page) return {readFrame, reader, settle, matchLine, matchBar, readFiles, plan, status, S};
  let view = "prog", lastPlan = null;
  const qname = r => qref(BYID.get(String(r.id))?.[0] || "q", r);
  const lvIn = $("#qllv"); lvIn.value = S.lv;
  function fillFrom(){ const towns = [...new Set(Object.values(JOBTOWN).concat(["Lith Harbor", "Sleepywood"]))];
    $("#qlfrom").innerHTML = `<option value="">Where the first quest is</option>` + towns.map(t => { const id = OPENMAP[t]; return id ? `<option value="${id}"${S.from === id ? " selected" : ""}>${esc(t)}</option>` : "" }).join("") }
  // rows the reader wasn't sure of (settle(): narrow, faint, over the bar's count, a shared cut name): the player picks
  let U = []; const skip = new Set();   // answered rows don't come back while a share keeps reading
  const tabTxt = t => t === "prog" ? "In Progress" : "Completed";
  function setUnsure(list){ const d = DONE(); U = (list || []).filter(u => !skip.has(u.tab + "|" + u.opts[0]) && !u.opts.some(n => (CAT.get(u.cat)?.get(n) || []).some(([, r]) => u.tab === "done" ? d.has(String(r.id)) : String(r.id) in S.prog))) }
  function drawUnsure(){
    $("#qlunsure").innerHTML = U.length ? `<p class="sub">Not sure about ${U.length === 1 ? "this row" : "these rows"}, so ${U.length === 1 ? "it wasn't" : "they weren't"} added. Pick what the game shows:</p>` + U.map((u, i) =>
      `<div class="qlu"><span class="sub">${esc(u.cat)} · ${tabTxt(u.tab)}${u.why === "count" ? " (more rows than the bar's count)" : ""}:</span> ${u.opts.map(n => `<button class="btn sm" type="button" data-u="${i}" data-n="${esc(n)}">${esc(n)}</button>`).join("")}<button class="btn sm" type="button" data-u="${i}" data-n="">None of these</button></div>`).join("") : "";
  }
  // add a quest-log name in a tab to a state (S, or a live share's base so the next second's re-apply keeps it)
  function addName(o, tab, cat, n){ const qs = (CAT.get(cat)?.get(n) || []).map(x => x[1]); if (!qs.length) return;
    if (tab === "done"){ for (const r of qs){ o.done = [...new Set([...o.done, String(r.id)])] } }
    else { const st = curStep(qs, new Set(o.done)); if (st) o.prog = {...o.prog, [String(st.id)]: n} } }
  function drawRead(){
    const n = S.done.length, p = Object.keys(S.prog).length;
    $("#qlsum").innerHTML = !n && !p ? `<p class="sub">Nothing read yet. Your quests below use what you tick by hand.</p>`
      : `<p><b>${fmt(n)}</b> quests done · <b>${fmt(p)}</b> in progress${S.at ? ` <span class="sub">(read ${esc(new Date(S.at).toLocaleString())})</span>` : ""}</p>` + (S.cats ? `<div class="qlcats">${["done", "prog"].map(tab => Object.entries(S.cats[tab] || {}).filter(([, o]) => o.found).map(([c, o]) => (o.n != null && o.n < o.found ? {...o, n: null} : o, [c, o.n != null && o.n < o.found ? {...o, n: null} : o])).map(([c, o]) =>
        `<span class="pill ${o.n == null || o.found === o.n ? "p-ok" : "p-warn"}" title="${tab === "done" ? "Completed" : "In Progress"} tab: ${o.found} read${o.n != null ? " of the " + o.n + " the bar counts" : ""}">${tab === "done" ? "✓" : "▸"} ${esc(c)} ${o.found}${o.n != null ? "/" + o.n : ""}</span>`).join("")).join("")}</div><p class="sub">A count under the bar's own number means some rows weren't read: open that category and scroll past it again, or tick them below.</p>` : "");
  }
  function rowsFor(v){
    const done = DONE();
    return ALLQ.filter(([, r]) => { const s = status(r, done); return v === "all" ? s !== "other" : v === "open" ? s === "open" : s === v })
      .sort((a, b) => a[1].lvl - b[1].lvl || a[1].name.localeCompare(b[1].name));
  }
  // the reader sees a questline's name, not its step: you pick the step you're on (earlier steps then count as done)
  const stepPick = r => { const steps = [...(CAT.get(r.region)?.get(r.chain) || [])].map(x => x[1]).sort((a, b) => (a.cpos || 0) - (b.cpos || 0));
    return `<div class="sub">${esc(r.chain)}: <select class="qlstep" aria-label="Step of ${esc(r.chain)}">${steps.map(q => `<option value="${q.id}"${String(q.id) === String(r.id) ? " selected" : ""}>${q.cpos}. ${esc(q.name)}</option>`).join("")}</select></div>` };
  function drawList(){
    const done = DONE(), counts = {prog: 0, open: 0, soon: 0, done: 0}; for (const [, r] of ALLQ){ const s = status(r, done); if (s in counts) counts[s]++ }
    $("#qlview").querySelectorAll("button").forEach(b => { b.setAttribute("aria-pressed", b.dataset.v === view); const c = counts[b.dataset.v]; b.querySelector("span").textContent = c == null ? "" : ` (${fmt(c)})` });
    const pick = new Set(S.pick), rows = rowsFor(view);
    lazyRows($("#qlrows"), rows.map(([, r]) => { const id = String(r.id), s = status(r, done);
      return `<tr data-id="${id}"><td><input type="checkbox" class="qlpick" aria-label="Plan ${esc(r.name)}"${pick.has(id) ? " checked" : ""}${s === "done" ? " disabled" : ""}></td>
        <td class="num">${r.lvl}</td><td>${qname(r)}${s === "prog" && r.chain ? stepPick(r) : r.chain ? `<div class="sub">${esc(r.chain)} · ${r.cpos} of ${r.cn}</div>` : ""}</td>
        <td>${esc(r.region)}</td><td>${npcLink(r.npc)}</td><td class="sub">${reqHTML(r, true)}</td><td class="num">${r.exp ? fmt(r.exp) : "–"}</td>
        <td><button class="btn sm qlmark" data-m="${s === "done" ? "undo" : "done"}">${s === "done" ? "Not done" : "Done"}</button>${s !== "done" ? ` <button class="btn sm qlmark" data-m="${s === "prog" ? "unprog" : "prog"}">${s === "prog" ? "Not on it" : "On it"}</button>` : ""}</td></tr>` }),
      `<tr><td colspan="8" class="empty">${view === "prog" ? "No quests in progress: read your In Progress tab or press On it on a quest." : view === "open" ? "Nothing open at this level that you haven't done." : "None."}</td></tr>`);
    $("#qlpicked").textContent = S.pick.length ? `${S.pick.length} picked` : "Pick quests to plan";
  }
  const kindTxt = {accept: "Accept", turn: "Turn in", hunt: "Hunt", buy: "Buy", craft: "Craft", market: "Buy from players"};
  function drawPlan(){
    const box = $("#qlplan");
    if (!S.pick.length){ box.innerHTML = `<p class="sub">Tick quests above (or press <b>Pick all in progress</b>) and the route shows here.</p>`; lastPlan = null; return }
    const P = lastPlan = plan(S.pick);
    box.innerHTML = `<div class="qltiles"><div class="sntile"><b>${hm(P.sec)}</b><span>about, start to finish</span></div><div class="sntile"><b>${fmt(P.exp)}</b><span>EXP (quests + kills)</span></div><div class="sntile"><b>${fmt(P.mesos)}</b><span>mesos from quests${P.steps.some(x => x.fee || x.kind === "market") ? ", less crafting and player buys" : ""}</span></div><div class="sntile"><b>${P.steps.length}</b><span>steps for ${P.quests.length} quest${P.quests.length === 1 ? "" : "s"}</span></div></div>
      <div class="tblwrap"><table class="qlsteps"><thead><tr><th class="num">#</th><th>Do</th><th>Where</th><th>What</th><th class="num">Time</th></tr></thead><tbody>${P.steps.map((s, i) => `<tr class="k-${s.kind}">
        <td class="num">${i + 1}</td><td><b>${kindTxt[s.kind]}</b></td><td>${s.map ? mapLink(s.map, mapName(s.map)) : "<span class='sub'>–</span>"}${s.route ? `<div class="sub">${esc(s.route)}</div>` : ""}</td>
        <td>${s.kind === "hunt" ? `${fmt(s.kills)} ${mobLink(s.mob)}${s.items.length ? ` <span class="sub">for ${s.items.map(([n, k]) => `${fmt(k)} ${esc(n)}`).join(", ")}</span>` : ""}<div class="sub">${s.qs.map(r => esc(r.name)).join(" · ")}</div>${s.none ? `<div class="bad">Too strong for your Path Planner character at Lv ${P.L} (or nowhere to hunt it at launch).</div>` : ""}`
          : s.kind === "buy" ? `${fmt(s.item[1])} ${esc(s.item[0])} from ${npcLink(s.shop[0])} (${fmt(s.shop[3])} each) <span class="sub">for ${esc(s.q.name)}</span>`
          : s.kind === "craft" ? `${fmt(s.item[1])} ${esc(s.item[0])}: ${fmt(s.times)} craft${s.times === 1 ? "" : "s"} with your ${esc(s.disc)} (recipe Lv ${s.lv}, yours ${s.my})${s.fee ? `, ${fmt(s.fee)} mesos` : ""}${s.cexp ? `, +${fmt(s.cexp)} craft EXP` : ""} <span class="sub">for ${s.qs.map(r => esc(r.name)).join(" · ")}</span>`
          : s.kind === "market" ? `${fmt(s.item[1])} ${esc(s.item[0])}${s.price?.v ? ` at about ${fmt(s.price.v)} each (${esc(s.price.src)})` : " (no player price seen yet)"} <span class="sub">for ${esc(s.q.name)}; ${esc(s.why)}</span>` : `${qname(s.q)} <span class="sub">${npcLink(s.q.npc)}</span>`}</td>
        <td class="num">${s.sec == null ? "?" : hm((s.travel || 0) + s.sec)}</td></tr>`).join("")}</tbody></table></div>
      ${P.left ? `<p class="bad">${P.left} step${P.left === 1 ? "" : "s"} couldn't be placed (a quest waits on one that isn't open).</p>` : ""}
      ${P.notes.length ? `<ul class="sub">${P.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
      <p class="sub">Estimates: kill times use your Path Planner character (${esc(X().cls)}${P.est ? ", rough damage" : ""}) at Lv ${P.L}; item drops assume ${Math.round(P.rate * 100)}% per kill (no drop rates exist in the files; change it in the Path Planner). Turn-ins are at the quest's NPC. Crafts use your levels from <b>Crafting › Your craft levels</b>${window.CPLAN ? ` (${D.craft.disc.map((d, i) => `${esc(d[0])} ${window.CPLAN.S.lv[i] || 0}`).join(", ")})` : ""}; anything above them is bought from players.</p>`;
  }
  const redraw = () => { drawRead(); drawUnsure(); drawList(); drawPlan(); histUi() };
  // Undo / Redo over what was read and marked (a read, a live share, a Done / On it, Forget = one step each)
  const hist = [], fut = [], snap = () => JSON.parse(JSON.stringify({done: S.done, prog: S.prog, cats: S.cats, at: S.at}));
  const step = () => { hist.push(snap()); if (hist.length > 40) hist.shift(); fut.length = 0 };
  function restore(o){ const gone = S.done.filter(i => !o.done.includes(i)); Object.assign(S, o); save();
    try { const pd = new Set(JSON.parse(localStorage.getItem("pathdone") || "[]")); for (const i of gone) pd.delete("q" + i); localStorage.setItem("pathdone", JSON.stringify([...pd])) } catch(e) {}
    $("#qlseen").innerHTML = ""; redraw() }
  const undo = () => { if (LV) endLive(); if (!hist.length) return; fut.push(snap()); restore(hist.pop()) };
  const redo = () => { if (!fut.length) return; hist.push(snap()); restore(fut.pop()) };
  function histUi(){ $("#qlundo").disabled = !hist.length; $("#qlredo").disabled = !fut.length; $("#qlforget").disabled = !S.done.length && !Object.keys(S.prog).length }
  // a read on top of what you had (base): in progress beats done, since a repeatable ("Donating to Henesys") sits in both tabs
  function apply(base, r){
    S.done = [...new Set([...base.done, ...r.done])].filter(i => !(i in r.prog)); S.prog = {...base.prog, ...r.prog};
    S.cats = r.cats; S.at = r.at; setUnsure(r.unsure); save(); redraw();
  }
  // what a read added, by name (shown under the status so a wrong one is easy to spot and Undo)
  function seen(base, label){
    const d = new Set(base.done), add = S.done.filter(i => !d.has(i)).map(i => BYID.get(i)?.[1]).filter(Boolean),
      on = Object.keys(S.prog).filter(i => !(i in base.prog)).map(i => BYID.get(i)?.[1]).filter(Boolean);
    const names = (rs, cls) => [...new Set(rs.map(lnOf))].slice(0, 60).map(n => `<span class="pill ${cls}">${esc(n)}</span>`).join("");
    $("#qlseen").innerHTML = add.length || on.length ? `<div class="qlcats"><span class="sub">${label}</span>${names(on, "p-warn")}${names(add, "p-ok")}</div>` : "";
  }
  $("#qlview").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (!b) return; view = b.dataset.v; drawList() });
  $("#qlrows").addEventListener("change", e => {
    const st = e.target.closest(".qlstep");
    if (st){ const old = st.closest("tr").dataset.id, nu = st.value, ln = S.prog[old]; delete S.prog[old]; S.prog[nu] = ln || BYID.get(nu)[1].chain;
      S.pick = S.pick.map(x => x === old ? nu : x); save(); redraw(); return }
    const c = e.target.closest(".qlpick"); if (!c) return; const id = c.closest("tr").dataset.id;
    S.pick = c.checked ? [...new Set([...S.pick, id])] : S.pick.filter(x => x !== id); save(); drawList(); drawPlan() });
  $("#qlrows").addEventListener("click", e => { const b = e.target.closest(".qlmark"); if (!b) return; const id = b.closest("tr").dataset.id, m = b.dataset.m; step();
    if (m === "done"){ S.done = [...new Set([...S.done, id])]; delete S.prog[id]; S.pick = S.pick.filter(x => x !== id) }
    else if (m === "undo"){ S.done = S.done.filter(x => x !== id); try { const pd = new Set(JSON.parse(localStorage.getItem("pathdone") || "[]")); pd.delete("q" + id); localStorage.setItem("pathdone", JSON.stringify([...pd])) } catch(e) {} }
    else if (m === "prog") S.prog[id] = BYID.get(id)[1].name; else delete S.prog[id];
    hist.length && JSON.stringify(hist.at(-1)) === JSON.stringify(snap()) && hist.pop();
    save(); redraw() });
  lvIn.addEventListener("change", () => { const v = Math.round(+lvIn.value); S.lv = v >= 1 && v <= MAX_LEVEL ? v : S.lv; lvIn.value = S.lv; save(); redraw() });
  $("#qlfrom").addEventListener("change", e => { S.from = e.target.value; save(); drawPlan() });
  $("#qlpickprog").addEventListener("click", () => { S.pick = [...new Set([...S.pick, ...Object.keys(S.prog)])]; save(); drawList(); drawPlan() });
  $("#qlclearpick").addEventListener("click", () => { S.pick = []; save(); drawList(); drawPlan() });
  $("#qlforget").addEventListener("click", () => { if (LV) endLive(); step(); skip.clear(); U = []; restore({done: [], prog: {}, cats: null, at: ""}); $("#qlstat").textContent = "Forgot what was read (Undo brings it back)." });
  $("#qlunsure").addEventListener("click", e => { const b = e.target.closest("button[data-u]"); if (!b) return; const u = U[+b.dataset.u]; if (!u) return;
    if (b.dataset.n){ step(); addName(S, u.tab, u.cat, b.dataset.n); if (LV) addName(LV.base, u.tab, u.cat, b.dataset.n); save() }
    skip.add(u.tab + "|" + u.opts[0]); U = U.filter(x => x !== u); redraw() });
  $("#qlundo").addEventListener("click", undo); $("#qlredo").addEventListener("click", redo);
  document.addEventListener("keydown", e => { if (page.hidden || !(e.ctrlKey || e.metaKey) || e.target.closest?.("input, select, textarea")) return; const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey){ e.preventDefault(); undo() } else if (k === "y" || (k === "z" && e.shiftKey)){ e.preventDefault(); redo() } });
  async function handle(files){
    files = [...files].filter(f => /^(image|video)\//.test(f.type)); if (!files.length) return;
    const st = $("#qlstat"); st.textContent = "Reading…"; $("#qlbar").hidden = false;
    try {
      const r = await readFiles(files, f => { $("#qlbar").value = f; st.textContent = `Reading… ${Math.round(f * 100)}%` });
      if (!r.done.length && !Object.keys(r.prog).length && r.noTab && !r.used){ st.textContent = "Found the quest list but not its tabs (Available / In Progress / Completed): keep the tab row in the shot so it knows which state the quests are in."; return }
      if (!r.done.length && !Object.keys(r.prog).length && !r.unsure.length){ st.textContent = "No quest window found. Record or capture the QUEST window with a category open (see How the Quest log works)."; return }
      const base = snap(); step(); if (!Object.keys(r.prog).length && view === "prog") view = "open";
      apply(base, r); seen(base, "Read:"); st.textContent = `Read ${fmt(r.done.length)} done and ${fmt(Object.keys(r.prog).length)} in-progress quests from ${fmt(r.used)} frame${r.used === 1 ? "" : "s"}.${U.length ? ` ${U.length} row${U.length === 1 ? "" : "s"} not sure: pick below.` : ""}`;
    } catch(e){ st.textContent = "Couldn't read that file" + (e.message === "video" ? ": this browser can't play that video format (try Chrome or Edge, or an .mp4/.webm)." : ".") }
    finally { $("#qlbar").hidden = true }
  }
  // live: the QUEST window read straight off a shared screen (02-screen.js), 4 frames a second like a recording; what's
  // read is applied every second (no Apply step), the names seen in the latest frame shown as you scroll
  let LV = null;
  async function live(){
    if (LV) return endLive();
    const st = $("#qlstat"), base = snap();
    LV = {rd: reader(), frames: 0, used: 0, base, t: 0, n: 0};
    $("#qllive").textContent = "Stop reading";
    const scr = await shareScreen({ms: 250, fps: 10, onFrame: liveFrame, onEnd: endLive});
    if (typeof scr === "string"){ LV = null; $("#qllive").textContent = "Read my screen"; st.textContent = scr; return }
    if (!LV){ scr.stop(); return }
    LV.scr = scr; step();
    st.textContent = "Sharing. Open the QUEST window on Completed, open each category and scroll slowly to its end, then the same on In Progress.";
  }
  function liveFrame(f){
    const L = LV; if (!L) return;
    const fr = readFrame({width: f.w, height: f.h, data: f.d}); L.frames++;
    if (fr && !fr.tab && !L.rd.tab){ $("#qlnow").innerHTML = `<span class="sub">Quest list found, but not its tabs: keep Available / In Progress / Completed in view so it knows which state the quests are in.</span>`; L.rd.add(fr); return }
    if (!L.rd.add(fr)) return; L.used++;
    const tab = fr.tab || L.tab || "done"; L.tab = tab;
    const now = L.rd.last.filter(([, m]) => m.sure && m.ln).map(([, m]) => m.ln);
    $("#qlnow").innerHTML = `<span class="sub">${tab === "prog" ? "In Progress" : tab === "avail" ? "Available (not needed)" : "Completed"} tab, this frame:</span> ${now.length ? [...new Set(now)].map(n => `<span class="pill">${esc(n)}</span>`).join("") : "<span class='sub'>no rows read</span>"}`;
    if (Date.now() - L.t < 1000) return; L.t = Date.now();
    liveApply();
  }
  function liveApply(){
    const L = LV, r = settle(L.rd, L.frames, L.used), n = r.done.length + Object.keys(r.prog).length;
    if (n === L.n && r.unsure.length === L.u) return; L.n = n; L.u = r.unsure.length;
    apply(L.base, r); seen(L.base, "Read so far:");
    $("#qlstat").textContent = `Reading… ${fmt(r.done.length)} done and ${fmt(Object.keys(r.prog).length)} in progress so far.`;
  }
  function endLive(){
    const L = LV; if (!L) return; LV = null; L.scr?.stop();
    $("#qllive").textContent = "Read my screen"; $("#qlnow").innerHTML = "";
    if (!L.scr) return;
    LV = L; L.n = -1; liveApply(); LV = null;
    const r = settle(L.rd, L.frames, L.used);
    if (!r.done.length && !Object.keys(r.prog).length && !U.length){ if (hist.length) hist.pop(); $("#qlstat").textContent = L.frames ? "Stopped. No quest window was seen: share the game window and open QUEST with a category open." : "Stopped."; return }
    if (!Object.keys(r.prog).length && view === "prog"){ view = "open"; drawList() }
    $("#qlstat").textContent = `Read ${fmt(r.done.length)} done and ${fmt(Object.keys(r.prog).length)} in-progress quests from ${fmt(r.used)} frame${r.used === 1 ? "" : "s"}.${U.length ? ` ${U.length} row${U.length === 1 ? "" : "s"} not sure: pick below.` : ""} Wrong one? Undo, or Not done on its row.`;
  }
  $("#qllive").addEventListener("click", live);
  // the grind tracker's Quests card (P1-7): a QSL1.<base64> code applies what it read, undoable like any read.
  // ids and questline names are validated against the same DB the window reader matches with
  $("#qlimp").addEventListener("click", () => {
    const r = QuestRead.parseSync($("#qlimpIn").value);
    if (!r || (!r.done.length && !Object.keys(r.prog).length)) return $("#qlstat").textContent = "That isn't a tracker quest code (it starts with QSL1.).";
    const done = r.done.filter(i => BYID.has(String(i))), prog = {};
    for (const [i, ln] of Object.entries(r.prog)) if (BYID.has(i) && [...CAT.values()].some(m => m.has(ln))) prog[i] = ln;
    if (!done.length && !Object.keys(prog).length) return $("#qlstat").textContent = "The code's quests aren't in our quest list — is the tracker's data older than the site's?";
    step(); const base = hist.at(-1);
    apply(base, {done, prog, cats: S.cats || {}, at: new Date().toISOString(), unsure: []});
    seen(base, "From the tracker:");
    $("#qlimpIn").value = "";
    $("#qlstat").textContent = `From the tracker: ${Object.keys(prog).length} in progress${done.length ? `, ${done.length} done` : ""}. Wrong one? Undo.`;
  });
  addEventListener("pagehide", () => LV && endLive());
  const dz = $("#qldrop");
  dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("over") });
  dz.addEventListener("dragleave", () => dz.classList.remove("over"));
  dz.addEventListener("drop", e => { e.preventDefault(); dz.classList.remove("over"); handle(e.dataTransfer.files) });
  $("#qlfile").addEventListener("change", e => { handle(e.target.files); e.target.value = "" });
  document.addEventListener("paste", e => { if (page.hidden) return; const f = [...(e.clipboardData?.files || [])]; if (f.length){ e.preventDefault(); handle(f) } });
  let shown = false; const show = () => { if (!shown && !page.hidden){ shown = true; fillFrom(); redraw() } };
  new MutationObserver(show).observe(page, {attributes: true, attributeFilter: ["hidden"]}); show();
  return {readFrame, reader, settle, matchLine, matchBar, readFiles, plan, status, S, handle, redraw, rend, l1, dtw, setUnsure: l => { setUnsure(l); redraw() }, get unsure(){ return U }, liveFrame: f => { if (!LV){ LV = {rd: reader(), frames: 0, used: 0, base: snap(), t: 0, n: 0, scr: {stop(){}}}; step() } liveFrame(f) }, endLive, undo, redo};
})();
window.QLOG = QLOG;
