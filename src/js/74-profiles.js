// Settings: section chips + Profiles (Danny 2026-10-21: "identical to the one in our desktop app"). Same model as the Grind
// Tracker's Settings > Layout > Profiles (tracker/app/renderer-settings.js profUi/profSwitch/spTake): localStorage "profiles" =
// your setups with a name (max 30), "profile" = the one in use ("b:<name>" = built in, never saved into or deleted); switching
// away first saves what's on screen into the one in use. Codes are the app's MSCS1 setup codes with a "site" part added
// ({nav, size, anchors}); the app ignores "site" and takes the theme, the site ignores the app's box layout and takes the theme
// (themes.js decodeSetup cleans both, so an MSCT1 theme code works here too). A pasted code shows a preview before anything changes.
(() => {
  const TH = window.TrackerThemes, ST = window.SITETHEME, A = window.ANCH, root = document.documentElement, dq = matchMedia("(prefers-color-scheme: dark)");
  const ls = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)) } catch { return null } };
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[ch]);
  const CATS = ["trk", "train", "world", "db", "town"], NAV = {side: "Sidebar", basic: "Basic mode", rows: "Two rows"};
  // built in: Default = the site as a new visitor sees it; Danny's Default = his 10-21 screenshot (Title, Tagline and a 1.35x
  // Search centered over the page column, cog top right, Mesos and Trade second, sidebar 285 px), measured on a 1961 px header
  const BUILTIN = [
    {name: "Default", theme: {preset: "Default"}, site: {nav: "side", size: 3, anchors: {}}},
    {name: "Danny's Default", theme: {preset: "Default"}, site: {nav: "side", size: 3, anchors: {
      title: {x: 0.4368, y: 0}, tag: {x: 0.4142, y: 48}, search: {x: 0.3987, y: 84, w: 526, s: 1.35}, cog: {x: 0.9761, y: 6, s: 1.1},
      sb: {w: 285}, secs: ["trk", "town", "train", "world", "db"]}}},
  ];
  const cleanName = n => typeof n === "string" ? n.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 40) || null : null;
  function cleanSite(s){
    if (!s || typeof s !== "object") return null; const r = {};
    if (NAV[s.nav] && typeof s.nav === "string") r.nav = s.nav;
    if (Number.isInteger(s.size) && s.size >= 1 && s.size <= 5) r.size = s.size;
    if (s.anchors && typeof s.anchors === "object") r.anchors = A.clean(s.anchors);
    return Object.keys(r).length ? r : null;
  }
  // untrusted (a pasted code, hand-edited storage): name, theme (themes.js rules), site; null if nothing usable
  function clean(x){
    if (!x || typeof x !== "object") return null;
    const t = TH.cleanSetup({theme: x.theme}, [])?.theme || null, site = cleanSite(x.site);
    if (!t && !site) return null;
    const r = {theme: t, site}, n = cleanName(x.name); if (n) r.name = n; return r;
  }
  const encode = x => "MSCS1." + btoa(unescape(encodeURIComponent(JSON.stringify({name: x.name, theme: x.theme, site: x.site}))));
  function decode(s){
    const m = /MSCS1\.([A-Za-z0-9+/=]{20,12000})/.exec(String(s || "").replace(/\s+/g, ""));
    if (!m){ const t = TH.decodeSetup(s, []); return t ? {theme: t.theme, site: null, name: t.name} : null }   // MSCT1 theme code
    let raw; try { raw = JSON.parse(decodeURIComponent(escape(atob(m[1])))) } catch { return null }
    const r = clean(raw); if (r && raw.layout) r.app = true; return r;
  }
  const now = name => { const x = {theme: ST.setup(), site: {nav: root.getAttribute("data-nav") || "side", size: +(root.getAttribute("data-size") || 3), anchors: A.get()}};
    if (name) x.name = name; return clean(x) };
  const profs = () => (Array.isArray(ls("profiles")) ? ls("profiles") : []).map(clean).filter(p => p?.name);
  const put = (p, list = profs()) => { list = list.filter(x => x.name !== p.name); list.push(p); ls("profiles", list.slice(-30)) };
  const using = () => { const v = ls("profile"); return typeof v === "string" ? v : "b:Default" };
  const find = v => v?.startsWith("b:") ? BUILTIN.find(p => p.name === v.slice(2)) : profs().find(p => p.name === v);
  const label = v => v?.startsWith("b:") ? v.slice(2) : v;
  // what's on screen, into the profile in use (if it's one of yours and still exists)
  const keep = () => { const n = using(); if (n.startsWith("b:") || !profs().some(p => p.name === n)) return; const c = now(n); if (c) put(c) };
  const freeName = n => { const have = new Set(profs().map(p => p.name)); let r = n, i = 2; while (have.has(r)) r = `${n.slice(0, 34)} (${i++})`; return r };
  function apply(x){
    if (x.theme) ST.take(x.theme);
    const s = x.site; if (!s) return;
    const nav = s.nav || "side", size = String(s.size || 3);
    if ((root.getAttribute("data-nav") || "side") !== nav) $(`#navmode [data-nv="${nav}"]`).click();
    if ((root.getAttribute("data-size") || "3") !== size) $(`#pagesize [data-sz="${size}"]`).click();
    A.set(s.anchors || {});
  }
  const note = t => $("#setupNote").textContent = t;
  const sel = $("#profSel");
  function ui(){
    const list = profs(), cur = using(), was = sel.value;
    const opt = (v, n) => `<option value="${esc(v)}">${esc(n)}${v === cur ? " (in use)" : ""}</option>`;
    sel.innerHTML = (list.length ? `<optgroup label="Yours">${list.map(p => opt(p.name, p.name)).join("")}</optgroup>` : `<option value="" disabled>No profiles of yours yet: save one below</option>`)
      + `<optgroup label="Built in">${BUILTIN.map(p => opt("b:" + p.name, p.name)).join("")}</optgroup>`;
    const vals = [...sel.options].filter(o => !o.disabled).map(o => o.value);
    sel.value = vals.includes(was) ? was : vals.includes(cur) ? cur : vals[0] || "";
    $("#profUse").disabled = !sel.value; $("#profDel").disabled = !sel.value || sel.value.startsWith("b:");
  }
  sel.addEventListener("change", () => { $("#profDel").disabled = !sel.value || sel.value.startsWith("b:") });
  $("#profSave").addEventListener("click", () => {
    const n = cleanName($("#profName").value) || (using().startsWith("b:") ? "My setup" : using()), c = now(n);
    if (!c) return note("Nothing to save yet.");
    put(c); ls("profile", n); $("#profName").value = ""; ui(); sel.value = n;
    note(`Saved profile "${n}". Changes you make now go into it when you switch.`);
  });
  function switchTo(v){
    const to = find(v); if (!to) return;
    if (v !== using()) keep();
    apply(to); ls("profile", v); ui();
    note(`Switched to "${to.name}".` + (v.startsWith("b:") ? " It's built in: to keep changes, save them under a name of your own." : ""));
  }
  $("#profUse").addEventListener("click", () => switchTo(sel.value));
  $("#profDel").addEventListener("click", () => { const n = sel.value; if (!n || n.startsWith("b:")) return;
    ls("profiles", profs().filter(p => p.name !== n)); if (using() === n) ls("profile", null); ui();
    note(`Deleted profile "${n}". The layout and theme on screen stay as they are.`) });
  $("#setupCopy").addEventListener("click", async () => {
    const c = now(label(using())); if (!c) return note("Nothing to share yet.");
    const code = encode(c); $("#setupCode").value = code;
    try { await navigator.clipboard.writeText(code); note("Profile code copied. Friends paste it here (or in the Grind Tracker's Settings > Layout), press Preview, then Use it.") }
    catch { $("#setupCode").select(); note("Copy the code from the box (Ctrl+C).") }
  });
  // the preview: the code's page drawn small in its own colours (header, sidebar sections in its order, on its side)
  let sp = null;
  function mapHtml(x){
    const t = x.theme?.preset ? TH.PRESETS.find(p => p.name === x.theme.preset) : x.theme || TH.clean(ST.now()), c = TH.resolve(t || TH.PRESETS[0], dq.matches).c;
    const a = x.site?.anchors || {}, secs = a.secs || CATS, side = x.site?.nav !== "rows";
    const cell = `background:${c.panel};color:${c.ink};border:1px solid ${c.line}`;
    const name = id => $(`nav .sgh[data-cat="${id}"]`)?.textContent.trim() || $("#c-" + id)?.textContent.trim() || id;
    return {cls: a.sb?.right ? "right" : "", bg: c.bg, accent: c.accent, html: `<div class="hd" style="${cell}"><i style="width:34%;background:${c.accent}"></i><i style="width:22%;background:${c.line}"></i></div>`
      + (side ? `<div class="sb">${secs.map(id => `<b style="${cell}">${esc(name(id))}</b>`).join("")}</div><div class="mn" style="${cell}"></div>`
        : `<div class="mn" style="${cell};grid-column:1/-1">${secs.map(id => esc(name(id))).join(" · ")}</div>`)};
  }
  function preview(text){
    const x = decode(text);
    if (!x){ sp = null; $("#setupPrev").hidden = true; return note("That isn't a profile code (they start with MSCS1., or MSCT1. for a theme).") }
    sp = x; const m = mapHtml(x), s = x.site, a = s?.anchors || {}, IT = {title: "Title", tag: "Tagline", search: "Search", cog: "Settings cog"};
    $("#spName").textContent = (x.name ? `"${x.name}"` : "A profile code") + (s ? "" : x.app ? " (from the Grind Tracker: theme only here)" : " (theme only)");
    $("#spMap").innerHTML = m.html; $("#spMap").className = m.cls; $("#spMap").style.background = m.bg; $("#spMap").style.outline = `1px solid ${m.accent}`;
    const moved = Object.keys(IT).filter(k => a[k]).map(k => IT[k]);
    $("#spInfo").textContent = [
      x.theme && "Theme: " + (x.theme.preset || x.theme.name),
      s?.nav && "Menu: " + NAV[s.nav], s?.size && "Page size " + s.size,
      s && (moved.length ? "Moved: " + moved.join(", ") : "Header as it comes"),
      a.sb?.w && `Sidebar ${a.sb.w} px${a.sb.right ? " on the right" : ""}`, a.sb?.right && !a.sb.w && "Sidebar on the right",
      a.secs && "Own section order", a.home && "Own Home card order",
      x.app && "Its box layout is for the app, so it's left out"].filter(Boolean).join(" · ") + ".";
    $("#setupPrev").hidden = false; note("");
  }
  $("#setupPaste").addEventListener("click", () => preview($("#setupCode").value));
  $("#setupCode").addEventListener("keydown", e => { if (e.key === "Enter") preview($("#setupCode").value) });
  $("#spCancel").addEventListener("click", () => { sp = null; $("#setupPrev").hidden = true; note("Nothing changed.") });
  // a code you use becomes a profile; what you had is kept as your profile in use, or as "My old setup" when you had none
  function take(use){
    const x = sp; if (!x) return; sp = null; $("#setupPrev").hidden = true;
    if (use){ if (profs().some(p => p.name === using())) keep(); else { const c = now(freeName("My old setup")); if (c) put(c) } }
    const n = freeName(x.name || (x.site ? "Friend's setup" : "Friend's theme"));
    if (x.site) put(clean({...x, name: n}));
    if (use){ apply(x); if (x.site) ls("profile", n) }
    else if (!x.site && x.theme && !x.theme.preset) ST.save(x.theme);
    ui(); $("#setupCode").value = "";
    note(use ? (x.site ? `Using "${n}". Your old setup is kept under Profiles.` : "Theme set from the code.")
      : x.site ? `Saved as profile "${n}". Pick it above and press Switch to it.` : "Theme added to your themes.");
  }
  $("#spUse").addEventListener("click", () => take(true));
  $("#spKeep").addEventListener("click", () => take(false));

  // section chips under the title (the app's #prefsNav): jump to a section; the one in view is marked as you scroll
  const box = $("#thpop .setbox"), SECS = [...box.querySelectorAll(".setcard[data-nav]")], chips = $("#setnav");
  chips.innerHTML = SECS.map((c, i) => `<button type="button" data-i="${i}">${esc(c.dataset.nav)}</button>`).join("");
  const head = () => chips.getBoundingClientRect().bottom;
  let pick = null;
  const spy = () => { let i = SECS.findLastIndex(c => c.getBoundingClientRect().top <= head() + 30);
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4) i = SECS.length - 1; if (pick != null) i = pick;
    chips.querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-current", String(j === Math.max(0, i)))) };
  chips.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; pick = +b.dataset.i;
    box.scrollTo({top: box.scrollTop + SECS[pick].getBoundingClientRect().top - head() - 8, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"}); spy() });
  for (const k of ["wheel", "keydown", "touchstart"]) box.addEventListener(k, () => { pick = null }, {passive: true});
  box.addEventListener("scroll", spy, {passive: true});
  $("#thopen").addEventListener("click", () => { if ($("#thpop").hidden) return; pick = null; box.scrollTop = 0; ui(); spy() });
  ui();
  window.PROFILES = {encode, decode, clean, now, BUILTIN};   // tests
})();
