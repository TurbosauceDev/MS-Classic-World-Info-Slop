// Toggle anchors (Settings, Danny 2026-10-20, option A of the "Anchor Mode Mockups"): ElvUI's /moveui for the header.
// Labelled movers over Search everything and the Settings cog, a grid they snap to (8/16/32), a nudge box (X/Y, arrows,
// Reset) on click, Search resizable from its right edge, Lock / Reset all bar. Items move with a transform from where the
// page puts them, so nothing else in the layout shifts. Saved per browser in localStorage "anchors":
// {search: {x, y, w}, cog: {x, y}}, x = left edge as a share of the header's width, y and w in px. Wide screens only
// (the 760px phone layout keeps the default).
(() => {
  const hd = $("header"), wide = matchMedia("(min-width: 761px)");
  const IT = {search: {el: $("#srchopen"), name: "Search everything", rz: true}, cog: {el: $("#thopen"), name: "Settings"}};
  const ls = (v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem("anchors") || "null"); if (v) localStorage.setItem("anchors", JSON.stringify(v)); else localStorage.removeItem("anchors") } catch { return null } };
  const num = v => typeof v === "number" && isFinite(v);
  // untrusted (edited by hand, older version): keep only well-formed entries
  const clean = s => { const o = {}; if (!s || typeof s !== "object") return o;
    for (const id in IT){ const p = s[id]; if (p && num(p.x) && num(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y < 2000)
      o[id] = {x: p.x, y: p.y, ...(IT[id].rz && num(p.w) && p.w >= 120 && p.w <= 2000 ? {w: p.w} : {})} } return o };
  let S = clean(ls()), on = false, grid = 16, snap = true, sel = null, drag = null;
  const zoom = () => hd.getBoundingClientRect().width / hd.offsetWidth || 1;   // .wrap is zoomed on wide screens (Page size)
  const W = () => hd.clientWidth, Hh = () => hd.clientHeight;
  // place one item: width first (it moves the natural spot of a centered button), then the transform from that spot
  function put(id){
    const {el} = IT[id], p = S[id];
    el.style.transform = ""; el.style.width = wide.matches && p?.w ? p.w + "px" : "";
    if (!wide.matches || !p){ return box(id) }
    const w = el.offsetWidth, h = el.offsetHeight;
    const x = Math.max(0, Math.min(W() - w, p.x * W())), y = Math.max(0, Math.min(Hh() - h, p.y));
    el.style.transform = `translate(${x - el.offsetLeft}px,${y - el.offsetTop}px)`;
    return box(id);
  }
  const box = id => { const {el} = IT[id], m = /translate\(([-\d.]+)px,\s*([-\d.]+)px/.exec(el.style.transform) || [0, 0, 0];
    return {x: el.offsetLeft + +m[1], y: el.offsetTop + +m[2], w: el.offsetWidth, h: el.offsetHeight} };
  const putAll = () => { for (const id in IT) put(id); if (on) drawMovers() };
  const save = () => ls(Object.keys(S).length ? S : null);
  // set an item to a header position in px (snapped to the grid if on), keep it inside the header
  function setPos(id, x, y, w){
    const {el} = IT[id], cw = w || el.offsetWidth, ch = el.offsetHeight;
    if (snap){ x = Math.round(x / grid) * grid; y = Math.round(y / grid) * grid }
    x = Math.max(0, Math.min(W() - cw, x)); y = Math.max(0, Math.min(Hh() - ch, y));
    S[id] = {x: x / W(), y, ...(IT[id].rz && w ? {w: Math.round(w)} : {})};
    put(id);
  }

  // anchor mode UI
  const bar = document.createElement("div"); bar.className = "anchbar"; bar.hidden = true;
  bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "Anchors"); document.body.append(bar);
  const nudge = document.createElement("div"); nudge.className = "anchnudge"; nudge.hidden = true; hd.append(nudge);
  const movers = {};
  for (const id in IT){
    const m = document.createElement("div"); m.className = "anchmv"; m.tabIndex = 0; m.hidden = true; m.dataset.id = id;
    m.setAttribute("role", "button"); m.setAttribute("aria-label", `Move ${IT[id].name} (arrow keys nudge, Shift for a grid step, Enter for exact numbers)`);
    m.innerHTML = `<span>${IT[id].name}</span>${IT[id].rz ? '<i class="anchrs" title="Drag to resize"></i>' : ""}`;
    hd.append(m); movers[id] = m;
  }
  function drawMovers(){ for (const id in IT){ const b = box(id), m = movers[id];
    Object.assign(m.style, {left: b.x + "px", top: b.y + "px", width: b.w + "px", height: b.h + "px"}); m.classList.toggle("sel", sel === id) } drawNudge() }
  function drawBar(){
    bar.innerHTML = `<span class="lbl">Anchors</span><span class="lbl">Grid</span>${[8, 16, 32].map(n => `<button type="button" class="btn" data-grid="${n}" aria-pressed="${n === grid}">${n}</button>`).join("")}
      <button type="button" class="btn" data-snap aria-pressed="${snap}">Snap</button><button type="button" class="btn" data-reset>Reset all</button><button type="button" class="btn pri" data-lock>Lock</button>`;
    hd.style.setProperty("--anchgrid", grid + "px");
  }
  function drawNudge(){
    if (!on || !sel){ nudge.hidden = true; return }
    const b = box(sel); nudge.hidden = false;
    nudge.innerHTML = `<b>${IT[sel].name}</b><label>X <input type="number" data-ax="x" value="${Math.round(b.x)}"></label><label>Y <input type="number" data-ax="y" value="${Math.round(b.y)}"></label>
      <div class="arr"><button type="button" class="btn" data-n="-1,0" aria-label="Left">←</button><button type="button" class="btn" data-n="0,-1" aria-label="Up">↑</button><button type="button" class="btn" data-n="0,1" aria-label="Down">↓</button><button type="button" class="btn" data-n="1,0" aria-label="Right">→</button><button type="button" class="btn" data-one>Reset</button></div>`;
    const below = b.y + b.h + 8 + nudge.offsetHeight <= Hh() + 120;
    nudge.style.left = Math.max(0, Math.min(W() - nudge.offsetWidth, b.x)) + "px";
    nudge.style.top = (below ? b.y + b.h + 8 : Math.max(0, b.y - nudge.offsetHeight - 8)) + "px";
  }
  function move(id, dx, dy){ const b = box(id), s = snap; snap = false; setPos(id, b.x + dx, b.y + dy, S[id]?.w); snap = s; save(); drawMovers() }
  function setOn(v){
    if (v && !wide.matches) return;
    on = v; sel = null; document.documentElement.classList.toggle("anchoring", on); bar.hidden = !on;
    for (const id in IT) movers[id].hidden = !on;
    if (on){ drawBar(); drawMovers(); movers.search.focus({preventScroll: true}) } else { nudge.hidden = true; IT.cog.el.focus({preventScroll: true}) }
  }

  // drag (move or resize); a click without moving opens the nudge box
  hd.addEventListener("pointerdown", e => {
    const m = e.target.closest(".anchmv"); if (!on || !m || e.button) return;
    e.preventDefault(); m.setPointerCapture(e.pointerId); const id = m.dataset.id, b = box(id);
    drag = {id, sx: e.clientX, sy: e.clientY, b, z: zoom(), moved: false, rz: !!e.target.closest(".anchrs")};
    IT[id].el.classList.add("anchdrag"); m.classList.add("drag");
  });
  hd.addEventListener("pointermove", e => {
    if (!drag) return; const {id, b, z} = drag, dx = (e.clientX - drag.sx) / z, dy = (e.clientY - drag.sy) / z;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return; drag.moved = true;
    if (drag.rz) setPos(id, b.x, b.y, Math.max(160, Math.min(W() - b.x, snap ? Math.round((b.w + dx) / grid) * grid : b.w + dx)));
    else setPos(id, b.x + dx, b.y + dy, S[id]?.w);
    drawMovers();
  });
  const end = () => { if (!drag) return; const {id, moved} = drag; drag = null;
    IT[id].el.classList.remove("anchdrag"); movers[id].classList.remove("drag");
    if (moved) save(); else sel = sel === id ? null : id; drawMovers() };
  hd.addEventListener("pointerup", end); hd.addEventListener("pointercancel", end);
  hd.addEventListener("keydown", e => {
    const m = e.target.closest(".anchmv"); if (!on || !m) return; const id = m.dataset.id, st = e.shiftKey ? grid : 1;
    const d = {ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st]}[e.key];
    if (d){ e.preventDefault(); sel = id; move(id, ...d) } else if (e.key === "Enter" || e.key === " "){ e.preventDefault(); sel = sel === id ? null : id; drawMovers() }
  });
  nudge.addEventListener("click", e => { const b = e.target.closest("button"); if (!b || !sel) return;
    if (b.dataset.n){ const [x, y] = b.dataset.n.split(",").map(Number); move(sel, x, y) }
    else if (b.hasAttribute("data-one")){ delete S[sel]; save(); put(sel); drawMovers() } });
  nudge.addEventListener("change", e => { const ax = e.target.dataset.ax; if (!ax || !sel) return; const b = box(sel), v = Math.round(+e.target.value || 0), s = snap;
    snap = false; setPos(sel, ax === "x" ? v : b.x, ax === "y" ? v : b.y, S[sel]?.w); snap = s; save(); drawMovers() });
  bar.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.grid){ grid = +b.dataset.grid; drawBar() }
    else if (b.hasAttribute("data-snap")){ snap = !snap; drawBar() }
    else if (b.hasAttribute("data-reset")){ S = {}; save(); sel = null; putAll() }
    else if (b.hasAttribute("data-lock")) setOn(false) });
  // a click on the page outside the movers, the nudge box and the bar drops the selection
  document.addEventListener("pointerdown", e => { if (on && sel && !e.composedPath().some(x => x === nudge || x === bar || x.classList?.contains("anchmv"))){ sel = null; drawMovers() } });
  document.addEventListener("keydown", e => { if (on && e.key === "Escape" && $("#thpop").hidden && $("#srch").hidden) setOn(false) });

  // Settings > Toggle anchors: closes Settings, enters anchor mode
  const tog = $("#anchtog"), note = $("#anchnote");
  const wideNote = () => { tog.disabled = !wide.matches; note.textContent = wide.matches ? "Move and resize Search everything and the Settings cog. Saved in this browser." : "Only on wider screens: phones keep the default header." };
  tog.addEventListener("click", () => { $("#thclose").click(); setOn(true) });
  wide.addEventListener("change", () => { if (!wide.matches && on) setOn(false); wideNote(); putAll() });
  addEventListener("resize", () => requestAnimationFrame(putAll));
  new MutationObserver(() => requestAnimationFrame(putAll)).observe(document.documentElement, {attributes: true, attributeFilter: ["data-size", "data-nav"]});
  wideNote(); putAll(); document.fonts?.ready.then(putAll);
  window.ANCH = {set: v => { S = clean(v); save(); putAll() }, get: () => S, on: setOn};   // tests
})();
