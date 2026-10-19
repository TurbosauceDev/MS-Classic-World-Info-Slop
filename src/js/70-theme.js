// Theme picker (header "Theme"): the Grind Tracker's presets and MSCT1. share codes (tracker/app/themes.js, inlined by
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
  $("#thopen").addEventListener("click", () => { const p = $("#thpop"), open = p.hidden; p.hidden = !open; $("#thopen").setAttribute("aria-expanded", open); if (open) draw() });
  // Esc or a click elsewhere closes it too (it used to stay open until Theme was clicked again)
  const shut = () => { if ($("#thpop").hidden) return; $("#thpop").hidden = true; $("#thopen").setAttribute("aria-expanded", false) };
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#thpop").hidden){ const inside = $("#thpop").contains(document.activeElement); shut(); if (inside) $("#thopen").focus() } });
  document.addEventListener("click", e => { if (!e.composedPath().some(x => x.id === "thpop" || x.id === "thopen")) shut() });   // path, not closest(): a swatch click redraws the list
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
  // a light/dark theme (Default, Purple) follows the system setting live
  dq.addEventListener("change", () => { const t = now(); if (t !== TH.PRESETS[0]) siteTheme(t); if (!$("#thpop").hidden) draw() });
})();
