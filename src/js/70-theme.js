// Theme picker (header cog > Settings): the Grind Tracker's presets and MSCT1. share codes (tracker/app/themes.js, inlined by
// build.py), so the site can wear whatever the tracker wears (Danny, 2026-10-18). Default = styles.css as is.
// localStorage: theme = "p:Name" (preset) or "u:Name" (pasted), themes = pasted ones, themec = the theme object the
// <head> script applies before the page draws (siteTheme in index.html).
/*@THEMES*/
(() => {
  const TH = window.TrackerThemes, dq = matchMedia("(prefers-color-scheme: dark)");
  const ls = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)) } catch { return null } };
  const mine = () => (ls("themes") || []).map(TH.clean).filter(Boolean);
  const all = () => [...TH.PRESETS.map(t => ["p:" + t.name, t]), ...mine().map(t => ["u:" + t.name, t])];
  let cur = ls("theme") || "p:" + TH.PRESETS[0].name;
  const now = () => all().find(([id]) => id === cur)?.[1] || TH.PRESETS[0];
  function use(id){
    cur = id; ls("theme", id);
    const t = now(), isDef = t === TH.PRESETS[0];
    ls("themec", isDef ? null : t); siteTheme(isDef ? null : t); draw();
  }
  function draw(){
    $("#thsw").innerHTML = all().map(([id, t]) => { const c = TH.resolve(t, dq.matches).c;
      return `<button type="button" role="radio" data-th="${esc(id)}" aria-checked="${id === cur}" style="background:${c.panel};color:${c.ink}">
        <span class="chips">${[c.bg, c.accent, c.soft, c.leaf, c.bad].map(x => `<i style="background:${x}"></i>`).join("")}</span>${esc(t.name)}</button>` }).join("");
  }
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[ch]);
  const msg = s => $("#thmsg").textContent = s;
  $("#thsw").addEventListener("click", e => { const b = e.target.closest("[data-th]"); if (b) use(b.dataset.th) });
  // Settings (header cog, Danny 10-20): an inset modal over a blurred backdrop like Search. Esc, × or a click on the backdrop closes it
  const pop = $("#thpop"), cog = $("#thopen");
  const open = () => { pop.hidden = false; cog.setAttribute("aria-expanded", true); draw(); $("#thclose").focus({preventScroll: true}) };
  const shut = () => { if (pop.hidden) return; const inside = pop.contains(document.activeElement); pop.hidden = true; cog.setAttribute("aria-expanded", false); if (inside) cog.focus({preventScroll: true}) };
  cog.addEventListener("click", () => pop.hidden ? open() : shut());
  $("#thclose").addEventListener("click", shut);
  pop.addEventListener("click", e => { if (e.target === pop) shut() });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !pop.hidden) shut() });
  $("#thadd").addEventListener("click", () => {
    const t = TH.decode($("#thcode").value);
    if (!t) return msg(/MSCT1\./.test($("#thcode").value) ? "That code is damaged or incomplete: copy the whole line again." : "That isn't a theme code (they start with MSCT1.).");
    if (TH.PRESETS.some(p => p.name === t.name)) t.name += " (mine)";
    ls("themes", [...mine().filter(x => x.name !== t.name), t].slice(-20)); $("#thcode").value = "";
    use("u:" + t.name); msg(`Using "${t.name}".`);
  });
  $("#thcopy").addEventListener("click", async () => {
    const code = TH.encode(TH.resolve(now(), dq.matches));
    try { await navigator.clipboard.writeText(code); msg("Code copied: paste it in the tracker under Settings > Theme > Share a theme.") }
    catch { $("#thcode").value = code; msg("Copy the code from the box above.") }
  });
  // for the colour editor in anchor mode (72-anchors.js): the theme in use as plain colours, preview, keep as one of "mine"
  window.SITETHEME = {
    now: () => TH.resolve(now(), dq.matches),
    preview: t => siteTheme(t),
    revert: () => { const t = now(); siteTheme(t === TH.PRESETS[0] ? null : t) },
    save: t => { t = TH.clean(t); if (!t) return null; if (TH.PRESETS.some(p => p.name === t.name)) t.name += " (mine)";
      ls("themes", [...mine().filter(x => x.name !== t.name), t].slice(-20)); use("u:" + t.name); return t.name },
    code: t => TH.encode(t), TOKENS: TH.TOKENS,
    // for profiles (74-profiles.js): the theme in use as a setup code wants it ({preset} or a full theme), and back
    setup: () => cur.startsWith("p:") && TH.PRESETS.some(p => "p:" + p.name === cur) ? {preset: cur.slice(2)} : TH.clean(now()),
    take: t => { if (t?.preset){ if (TH.PRESETS.some(p => p.name === t.preset)) use("p:" + t.preset) } else if (t) window.SITETHEME.save(t) },
  };
  // a light/dark theme (Default, Purple) follows the system setting live
  dq.addEventListener("change", () => { const t = now(); if (t !== TH.PRESETS[0]) siteTheme(t); if (!pop.hidden) draw() });
})();

// Home "Site version: v0.x.y · built ...": number = newest changelog entry (build.py); the build stamps UTC; show it in the viewer's own time zone (Danny 10-19), exact UTC on hover
(() => {
  const el = document.querySelector(".sitever[data-built]"), d = el && new Date(el.dataset.built);
  if (!d || isNaN(d)) return;
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const tm = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  el.title = el.textContent.replace(/^.*built /, "");
  el.textContent = `Site version: v${el.dataset.ver} · built ${day} · ${tm}`;
})();

// Home, under the version: meso.watch data state (Danny 10-20): item prices (D.pw.it, sales read up to D.pw.read) and live
// listings (D.pw.now, updated D.pw.listed UTC), age shown relative like the item pages; refreshed each minute
(() => {
  const el = document.getElementById("pwstate"); if (!el || !D.pw?.it) return;
  const draw = () => { const ago = pwListedAgo(), n = Object.keys(D.pw.it).length, live = Object.keys(D.pw.now || {}).length;   // FM Sniper can swap in a newer list
    const read = D.pw.read ? new Date(D.pw.read + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "";
    el.textContent = `meso.watch: ${fmt(n)} item prices${read ? ` (sales up to ${read})` : ""}${live && ago ? ` · ${fmt(live)} live listings, updated ${ago}` : !live ? ` · ${pwNoLive()}` : ""}`;
    el.title = D.pw.listed ? `Listings updated ${D.pw.listed} UTC` : "" };
  draw(); el.hidden = false; setInterval(draw, 6e4); document.addEventListener("pwupdate", draw);
})();
