// Sidebar nav (Danny 2026-10-20, picked in the "Nav Eye Test" mockup): every page listed under its section title, each with
// a game sprite picked at random on every load from a pool that fits the page; the Home snail never changes. Items only
// from launch sources (a launch monster drops it, a shop sells it or a recipe makes it). Meso drops aren't in the OSMS
// export: their 4 icons are inlined here (maplestory.io, Classic World client MCW CBT2, items 9000000-9000003).
// Layout (Sidebar / Basic mode / Two rows) and wide-screen page size (1-5) are picked in the Theme popup; the <head>
// script in index.html applies both before the page draws (data-nav, data-size on <html>).
const MESO_ICONS = ["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"];
(() => {
  const NO = /Halloween|Event|Pet |Christmas|Valentine|Easter|Anniversary/i;
  const it = id => D.items[id] && !NO.test(D.items[id].n);
  const I = a => a.filter(it).map(i => "i:" + i);
  const mobs = Object.keys(D.mobs).filter(k => D.mobimg[k] && !/^Super /.test(D.mobs[k][0])).map(k => "m:" + k);
  const dropped = new Set(Object.keys(D.drops).filter(i => D.drops[i].some(([m]) => D.mobs[m])));
  const rec = D.craft.rec, crafted = new Set(rec.map(r => r[3])), ingr = new Set(rec.flatMap(r => r[7].map(x => x[0])));
  const known = [...new Set([...dropped, ...Object.keys(D.ishop || {}), ...crafted])].filter(it);
  const qtext = JSON.stringify(D.quests) + JSON.stringify(D.citq);
  const skills = Object.values(D.skills).flat(), skill = n => skills.filter(s => s.n === n && D.icons[s.id]).slice(0, 1).map(s => "s:" + s.id);
  const kpq = ["m:800000", "m:800001", "m:800002", "m:800003", "i:4001001", "i:4001002"];   // Ligator, Jr. Necki, Curse Eye, King Slime, Coupon, Pass
  const P = {
    home: ["m:2"], trk: mobs, trkhow: ["i:4031032"], trkruns: mobs, trkkpq: kpq, kpqt: kpq,
    plan: I(known.filter(i => D.items[i].c === "Equipment")), skills: Object.keys(D.icons).map(i => "s:" + i),
    maps: mobs, path: I(Object.keys(D.potval)), qlog: ["i:4031000", "i:4031001", "i:4031002", "i:4031009", "i:4031011"], expc: ["s:4101001"], kpq,
    wmap: I(["2030000", "2030001", "2030002", "2030003", "2030004", "2030005", "2030006"]),   // launch towns only
    navi: [...skill("Teleport"), ...skill("Haste"), "i:2030000"],
    items: I(known), mobs, quests: I(Object.keys(D.items).filter(i => i.startsWith("403") && (dropped.has(i) || qtext.includes(D.items[i].n)))),
    // FM Sniper: what meso.watch has listed right now, and meso bags
    snipe: [...I(Object.keys(PWNOW)), "x:1", "x:2", "x:3"],
    inv: ["x:0", "x:1", "x:2", "x:3"],
    keep: I([...dropped].filter(i => i.startsWith("400") && D.items[i]?.c === "Etc")),
    craft: I([...ingr].filter(i => i.startsWith("4") && (dropped.has(i) || D.ishop?.[i] || crafted.has(i)))),
    // Henesys / Kerning City townsfolk from the citizenship quests, and the two towns' return scrolls
    cit: [...new Set(D.citq.map(q => q.npc))].filter(n => n && D.npcid[n] && D.npcimg[D.npcid[n]]).map(n => "n:" + D.npcid[n]).concat(["i:2030004", "i:2030005"]),
  };
  Object.assign(P, { g_trk: [...P.trk, ...kpq], g_train: [...P.maps, ...P.plan, ...P.path, ...kpq],
    g_world: [...P.wmap, ...P.navi], g_db: [...P.items, ...P.mobs, ...P.quests, ...P.skills], g_town: [...P.snipe, ...P.inv, ...P.craft, ...P.keep] });
  const src = k => { const [t, id] = k.split(":"), b = t === "x" ? MESO_ICONS[id] : {i: D.iicons, m: D.mobimg, s: D.icons, n: D.npcimg}[t]?.[id];
    return b ? "data:image/png;base64," + b : null };
  const fill = () => { for (const im of document.querySelectorAll("img.nic:not([src])")){
    const pool = P[im.dataset.pool] || [];
    for (let n = 0; n < 40 && pool.length; n++){ const k = pool[Math.floor(Math.random() * pool.length)], s = src(k); if (!s) continue;
      im.src = s; im.classList.toggle("big", /^[mn]:/.test(k)); im.classList.toggle("npc", k[0] === "n"); break } } };
  fill(); ASSETS.then(fill);   // item icons arrive later on the Pages copy

  // footer links (Changelog, Credits) and the sidebar's Home row
  document.querySelector(".sitefoot").addEventListener("click", e => { const b = e.target.closest("[data-foot]"); if (b){ $("#t-" + b.dataset.foot).click(); window.scrollTo({top: 0}) } });
  $("#sbhome").addEventListener("click", () => goHome());

  // Theme popup: layout and page size
  const el = document.documentElement, ls = (k, v) => { try { localStorage.setItem(k, v) } catch(e) {} };
  const SIZES = {1: "Fixed width, like before.", 2: "76% of the window, 8% bigger.", 3: "82% of the window, 15% bigger (default).",
    4: "88% of the window, 22% bigger.", 5: "94% of the window, grows with it."};
  const zoom5 = () => el.style.setProperty("--z5", Math.min(1.6, Math.max(1, innerWidth / 1550)).toFixed(3));
  const drawSet = () => {
    const nv = el.getAttribute("data-nav") || "side", sz = el.getAttribute("data-size") || "3";
    document.querySelectorAll("#navmode [data-nv]").forEach(b => b.setAttribute("aria-checked", b.dataset.nv === nv));
    document.querySelectorAll("#pagesize [data-sz]").forEach(b => b.setAttribute("aria-checked", b.dataset.sz === sz));
    $("#sznote").textContent = SIZES[sz] + " Only on windows 1700px wide or more.";
  };
  $("#navmode").addEventListener("click", e => { const b = e.target.closest("[data-nv]"); if (!b) return;
    if (b.dataset.nv === "side") el.removeAttribute("data-nav"); else el.setAttribute("data-nav", b.dataset.nv);
    ls("navmode", b.dataset.nv); const cur = TABS.find(x => x.getAttribute("aria-selected") === "true"); showCat(cur ? cur.dataset.cat : "home"); drawSet() });
  $("#pagesize").addEventListener("click", e => { const b = e.target.closest("[data-sz]"); if (!b) return;
    el.setAttribute("data-size", b.dataset.sz); ls("pagesize", b.dataset.sz); drawSet() });
  // a sidebar taller than the window sticks by its bottom edge (negative top), so Citizenship is always reachable and the
  // footer starts below the whole sidebar (Danny 10-20)
  const nav = $("nav"), stick = () => { const z = parseFloat(getComputedStyle($(".wrap")).zoom) || 1;
    nav.style.top = Math.min(10, Math.floor(innerHeight / z - nav.offsetHeight - 10)) + "px" };
  zoom5(); stick(); addEventListener("resize", () => { zoom5(); stick() }); new ResizeObserver(stick).observe(nav); drawSet();
  SIDEMQ.addEventListener("change", () => { const cur = TABS.find(x => x.getAttribute("aria-selected") === "true"); showCat(cur ? cur.dataset.cat : "home") });
})();
