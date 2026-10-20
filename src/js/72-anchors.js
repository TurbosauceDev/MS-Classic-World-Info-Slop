// Toggle anchors (Settings or F1, Danny 2026-10-20, option A of the "Anchor Mode Mockups" + C's smart guides): ElvUI's
// /moveui for the header. Labelled movers over Search everything and the Settings cog; drag snaps to smart guides (header
// center/edges, the title and tagline, the other part) first, else the grid (8/16/32); Alt drags freely. Click a mover
// for the nudge box (X/Y, scale, arrows, Reset); drag Search's right tab for width, any mover's corner dot for scale.
// Bar: Grid, Snap, Colours (the theme editor: live preview, save as one of "my themes", share code), Reset all, Done.
// Esc = Done. Items move with a transform from where the page puts them, so nothing else in the layout shifts. Saved per
// browser in localStorage "anchors": {search: {x, y, w, s}, cog: {x, y, s}}, x = left edge as a share of the header's
// width, y and w in px, s = scale. Wide screens only (the 760px phone layout keeps the default); Colours works everywhere.
(() => {
  const hd = $("header"), wide = matchMedia("(min-width: 761px)");
  const IT = {title: {el: $("header h1"), name: "Title"}, tag: {el: $("header > p"), name: "Tagline"},
    search: {el: $("#srchopen"), name: "Search everything", rz: true}, cog: {el: $("#thopen"), name: "Settings"}};
  const CATS = ["trk", "char", "train", "world", "db", "town"], SECS = [...document.querySelectorAll(".homegrid > .homecat[data-sec]")].map(e => e.dataset.sec);
  const ls = (v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem("anchors") || "null"); if (v) localStorage.setItem("anchors", JSON.stringify(v)); else localStorage.removeItem("anchors") } catch { return null } };
  const num = v => typeof v === "number" && isFinite(v);
  const SMIN = 0.5, SMAX = 2.5, SNAPPX = 6;
  // untrusted (edited by hand, older version): keep only well-formed entries
  const clean = s => { const o = {}; if (!s || typeof s !== "object") return o;
    for (const id in IT){ const p = s[id]; if (!(p && num(p.x) && num(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y < 2000)) continue;
      o[id] = {x: p.x, y: p.y}; if (IT[id].rz && num(p.w) && p.w >= 120 && p.w <= 2000) o[id].w = p.w; if (num(p.s) && p.s >= SMIN && p.s <= SMAX) o[id].s = p.s }
    // page layout: sidebar width/side, sidebar section order, Home card order and width (same limits as the <head> script)
    if (s.sb && typeof s.sb === "object"){ const b = {}; if (num(s.sb.w) && s.sb.w >= 180 && s.sb.w <= 420) b.w = Math.round(s.sb.w); if (s.sb.right === true) b.right = true; if (Object.keys(b).length) o.sb = b }
    const order = (a, all) => Array.isArray(a) && a.length === all.length && all.every(x => a.includes(x)) ? [...a] : null;
    if (order(s.secs, CATS)) o.secs = order(s.secs, CATS); if (order(s.home, SECS)) o.home = order(s.home, SECS);
    if (num(s.hcw) && s.hcw >= 220 && s.hcw <= 520) o.hcw = Math.round(s.hcw);
    return o };
  let S = clean(ls()), on = false, grid = 16, snap = true, sel = null, drag = null;
  const cur = {};
  const zoom = () => hd.getBoundingClientRect().width / hd.offsetWidth || 1;   // .wrap is zoomed on wide screens (Page size)
  const W = () => hd.clientWidth, Hh = () => hd.clientHeight;
  // place one item: width first (it moves the natural spot of a centered button), then translate + scale from that spot
  function put(id){
    const {el} = IT[id], p = wide.matches ? S[id] : null;
    el.style.transform = ""; el.style.width = p?.w ? p.w + "px" : "";
    const w = el.offsetWidth, h = el.offsetHeight, s = p?.s || 1;
    if (!p){ cur[id] = {x: el.offsetLeft, y: el.offsetTop, w, h, s}; return }
    const x = Math.max(0, Math.min(W() - w * s, p.x * W())), y = Math.max(0, Math.min(Hh() - h * s, p.y));
    el.style.transform = `translate(${x - el.offsetLeft}px,${y - el.offsetTop}px)` + (s !== 1 ? ` scale(${s})` : "");
    cur[id] = {x, y, w, h, s};
  }
  const box = id => { const c = cur[id]; return {x: c.x, y: c.y, w: c.w * c.s, h: c.h * c.s, s: c.s} };
  const putAll = () => { for (const id in IT) put(id); if (on) drawMovers() };
  const save = () => ls(Object.keys(S).length ? S : null);
  function setPos(id, x, y, o = {}){
    const old = S[id] || {}, s = o.s ?? old.s ?? cur[id].s, w = o.w ?? old.w;
    const {el} = IT[id], bw = (w || el.offsetWidth) * s, bh = el.offsetHeight * s;
    x = Math.max(0, Math.min(W() - bw, x)); y = Math.max(0, Math.min(Hh() - bh, y));
    S[id] = {x: x / W(), y: Math.round(y)}; if (w) S[id].w = Math.round(w); if (s !== 1) S[id].s = s;
    put(id);
  }

  // smart guides: lines the dragged part's left/center/right (top/middle/bottom) can stick to
  const gv = document.createElement("div"), gh = document.createElement("div");
  gv.className = "anchguide v"; gh.className = "anchguide h"; hd.append(gv, gh);
  function lines(id){
    const xs = [0, W() / 2, W()], ys = [0, Hh()];
    for (const o in IT) if (o !== id){ const b = box(o); xs.push(b.x, b.x + b.w / 2, b.x + b.w); ys.push(b.y, b.y + b.h / 2, b.y + b.h) }
    return {xs, ys};
  }
  // best snap on one axis: the part's start/middle/end against every line; null if none is within SNAPPX
  const stick = (v, size, L) => { let best = null; for (const l of L) for (const k of [0, 0.5, 1]){ const d = l - (v + size * k);
    if (Math.abs(d) <= SNAPPX && (!best || Math.abs(d) < Math.abs(best.d))) best = {d, l} } return best };
  const guides = (x, y) => { gv.hidden = x == null; gh.hidden = y == null; if (x != null) gv.style.left = x + "px"; if (y != null) gh.style.top = y + "px" };
  guides(null, null);

  // anchor mode UI
  const bar = document.createElement("div"); bar.className = "anchbar"; bar.hidden = true;
  bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "Anchors"); document.body.append(bar);
  const nudge = document.createElement("div"); nudge.className = "anchnudge"; nudge.hidden = true; hd.append(nudge);
  const movers = {};
  for (const id in IT){
    const m = document.createElement("div"); m.className = "anchmv"; m.tabIndex = 0; m.hidden = true; m.dataset.id = id;
    m.setAttribute("role", "button"); m.setAttribute("aria-label", `Move ${IT[id].name} (arrow keys nudge, Shift for a grid step, Enter for exact numbers and scale)`);
    m.innerHTML = `<span>${IT[id].name}</span>${IT[id].rz ? '<i class="anchrs" title="Drag to change the width"></i>' : ""}<i class="anchsc" title="Drag to scale"></i>`;
    hd.append(m); movers[id] = m;
  }
  const fit = () => { for (const id in IT){ const b = box(id); Object.assign(movers[id].style, {left: b.x + "px", top: b.y + "px", width: b.w + "px", height: b.h + "px"}); movers[id].classList.toggle("sel", sel === id) } };
  const drawMovers = () => { fit(); drawNudge() };
  function drawBar(){
    bar.innerHTML = `<span class="lbl">Anchors</span><span class="lbl">Grid</span>${[8, 16, 32].map(n => `<button type="button" class="btn" data-grid="${n}" aria-pressed="${n === grid}">${n}</button>`).join("")}
      <button type="button" class="btn" data-snap aria-pressed="${snap}" title="Snap to guide lines and the grid (hold Alt while dragging to place freely)">Snap</button><button type="button" class="btn" data-side aria-pressed="${!!S.sb?.right}" title="Put the sidebar on the other side">Sidebar right</button><label class="lbl" title="How wide Home cards are before they wrap">Cards <input type="range" data-hcw min="220" max="520" step="10" value="${S.hcw || 300}"></label><button type="button" class="btn" data-cols aria-pressed="${!col.hidden}">Colours</button><button type="button" class="btn" data-reset>Reset all</button><button type="button" class="btn pri" data-lock title="Done (Esc)">Done</button>`;
    hd.style.setProperty("--anchgrid", grid + "px");
  }
  function drawNudge(){
    if (!on || !sel){ nudge.hidden = true; return }
    const b = box(sel), pc = Math.round(b.s * 100); nudge.hidden = false;
    nudge.innerHTML = `<b>${IT[sel].name}</b><label>X <input type="number" data-ax="x" value="${Math.round(b.x)}"></label><label>Y <input type="number" data-ax="y" value="${Math.round(b.y)}"></label>
      <label class="sc">Scale <input type="range" data-ax="s" min="${SMIN * 100}" max="${SMAX * 100}" step="5" value="${pc}"><output>${pc}%</output></label>
      <div class="arr"><button type="button" class="btn" data-n="-1,0" aria-label="Left">←</button><button type="button" class="btn" data-n="0,-1" aria-label="Up">↑</button><button type="button" class="btn" data-n="0,1" aria-label="Down">↓</button><button type="button" class="btn" data-n="1,0" aria-label="Right">→</button><button type="button" class="btn" data-one>Reset</button></div>`;
    placeNudge();
  }
  function placeNudge(){ const b = box(sel), below = b.y + b.h + 8 + nudge.offsetHeight <= Hh() + 140;
    nudge.style.left = Math.max(0, Math.min(W() - nudge.offsetWidth, b.x)) + "px";
    nudge.style.top = (below ? b.y + b.h + 8 : Math.max(0, b.y - nudge.offsetHeight - 8)) + "px" }
  function move(id, dx, dy){ const b = box(id); setPos(id, b.x + dx, b.y + dy); save(); drawMovers() }
  function setOn(v){
    if (v && !wide.matches) return;
    on = v; sel = null; document.documentElement.classList.toggle("anchoring", on); bar.hidden = !on;
    for (const id in IT) movers[id].hidden = !on;
    if (on){ drawBar(); drawMovers(); movers.search.focus({preventScroll: true}) } else { nudge.hidden = true; guides(null, null); cols(false); IT.cog.el.focus({preventScroll: true}) }
  }

  // drag: move, width (Search's right tab) or scale (corner dot); a click without moving opens the nudge box
  hd.addEventListener("pointerdown", e => {
    const m = e.target.closest(".anchmv"); if (!on || !m || e.button) return;
    e.preventDefault(); m.setPointerCapture(e.pointerId); const id = m.dataset.id;
    drag = {id, sx: e.clientX, sy: e.clientY, b: box(id), z: zoom(), moved: false, kind: e.target.closest(".anchrs") ? "w" : e.target.closest(".anchsc") ? "s" : "m", L: lines(id)};
    IT[id].el.classList.add("anchdrag"); m.classList.add("drag");
  });
  hd.addEventListener("pointermove", e => {
    if (!drag) return; const {id, b, z, kind} = drag, dx = (e.clientX - drag.sx) / z, dy = (e.clientY - drag.sy) / z, free = e.altKey || !snap;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return; drag.moved = true;
    if (kind === "w"){ let w = b.w + dx; if (!free) w = Math.round(w / grid) * grid; setPos(id, b.x, b.y, {w: Math.max(120, Math.min(W() - b.x, w)) / b.s}) }
    else if (kind === "s"){ const s = Math.round(Math.max(SMIN, Math.min(SMAX, b.s * (b.w + dx) / b.w)) * 20) / 20; setPos(id, b.x, b.y, {s}) }
    else {
      let x = b.x + dx, y = b.y + dy, lx = null, ly = null;
      if (!free){
        const sx = stick(x, b.w, drag.L.xs), sy = stick(y, b.h, drag.L.ys);
        if (sx){ x += sx.d; lx = sx.l } else x = Math.round(x / grid) * grid;
        if (sy){ y += sy.d; ly = sy.l } else y = Math.round(y / grid) * grid;
      }
      setPos(id, x, y); guides(lx, ly);
    }
    drawMovers();
  });
  const end = () => { if (!drag) return; const {id, moved} = drag; drag = null; guides(null, null);
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
  nudge.addEventListener("input", e => { if (e.target.dataset.ax !== "s" || !sel) return; const b = box(sel), s = +e.target.value / 100;
    setPos(sel, b.x, b.y, {s}); e.target.nextElementSibling.textContent = Math.round(s * 100) + "%"; fit(); placeNudge() });
  nudge.addEventListener("change", e => { const ax = e.target.dataset.ax; if (!ax || !sel) return; if (ax === "s"){ save(); return }
    const b = box(sel), v = Math.round(+e.target.value || 0); setPos(sel, ax === "x" ? v : b.x, ax === "y" ? v : b.y); save(); drawMovers() });
  bar.addEventListener("input", e => { if (!e.target.hasAttribute("data-hcw")) return; S.hcw = +e.target.value; if (S.hcw === 300) delete S.hcw; layout(); save() });
  bar.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.grid){ grid = +b.dataset.grid; drawBar() }
    else if (b.hasAttribute("data-snap")){ snap = !snap; drawBar() }
    else if (b.hasAttribute("data-cols")){ cols(col.hidden); drawBar() }
    else if (b.hasAttribute("data-side")){ S.sb = {...S.sb, right: !S.sb?.right}; if (!S.sb.right) delete S.sb.right; if (!Object.keys(S.sb).length) delete S.sb; layout(true); save(); drawBar() }
    else if (b.hasAttribute("data-reset")){ S = {}; save(); sel = null; layout(true); putAll(); drawBar() }
    else if (b.hasAttribute("data-lock")) setOn(false) });
  // a click on the page outside the movers, the nudge box, the bar and Colours drops the selection
  document.addEventListener("pointerdown", e => { if (on && sel && !e.composedPath().some(x => x === nudge || x === bar || x === col || x.classList?.contains("anchmv"))){ sel = null; drawMovers() } });
  // Esc = Done (Danny 10-20); F1 opens/closes the editor and keeps Chrome's help tab from opening
  document.addEventListener("keydown", e => {
    if (e.key === "F1"){ e.preventDefault(); if (!$("#thpop").hidden) $("#thclose").click(); if (on) setOn(false); else if (wide.matches) setOn(true); else cols(col.hidden); return }
    if (e.key !== "Escape" || !$("#thpop").hidden || !$("#srch").hidden) return;
    if (on) setOn(false); else if (!col.hidden) cols(false) });

  // Page layout. Sidebar: width (drag the bar on its edge), side (bar button). Sidebar sections and Home cards: drag into
  // a new order (the moved ones glide to their new spots). Clicks on links there do nothing while editing.
  const root = document.documentElement, subs = $("nav .subs"), cats = $("nav .cats"), hgrid = $(".homegrid"), navcol = $(".navcol");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const group = c => [...subs.querySelectorAll(`[data-cat="${c}"]`)];
  const curSecs = () => [...subs.querySelectorAll(".sgh[data-cat]")].map(e => e.dataset.cat);
  const curHome = () => [...hgrid.children].map(e => e.dataset.sec).filter(Boolean);
  // move elements, then play each one from where it was (FLIP), so nothing jumps
  function flip(els, change){
    const z = zoom(), was = new Map(els.map(e => [e, e.getBoundingClientRect()])); change();
    if (reduce.matches) return;
    for (const e of els){ const a = was.get(e), b = e.getBoundingClientRect(), dx = (a.left - b.left) / z, dy = (a.top - b.top) / z;
      if ((dx || dy) && b.width) e.animate([{transform: `translate(${dx}px,${dy}px)`}, {transform: "none"}], {duration: 200, easing: "cubic-bezier(.2,.8,.2,1)"}) }
  }
  function layout(anim){
    root.style.setProperty("--sbw", S.sb?.w ? S.sb.w + "px" : ""); if (!S.sb?.w) root.style.removeProperty("--sbw");
    if (S.sb?.right) root.setAttribute("data-sbside", "right"); else root.removeAttribute("data-sbside");
    if (S.hcw) root.style.setProperty("--hcw", S.hcw + "px"); else root.style.removeProperty("--hcw");
    const secs = S.secs || CATS, home = S.home || SECS, more = subs.querySelector('[data-cat="more"]');
    const go = () => { for (const c of secs){ for (const e of group(c)) subs.insertBefore(e, more); cats.insertBefore($("#c-" + c), $("#c-more")) }
      for (const h of home){ const e = hgrid.querySelector(`:scope > [data-sec="${h}"]`); if (e) hgrid.append(e) } };
    if (anim) flip([...subs.children, ...hgrid.children], go); else go();
    requestAnimationFrame(putAll);
  }
  // sidebar width handle
  let sbd = null; const sbw = document.createElement("div"); sbw.className = "anchsbw"; sbw.title = "Drag to change the sidebar's width"; navcol.append(sbw);
  sbw.addEventListener("pointerdown", e => { if (!on || e.button) return; e.preventDefault(); sbw.setPointerCapture(e.pointerId);
    sbd = {sx: e.clientX, w0: navcol.getBoundingClientRect().width / zoom(), z: zoom()} });
  sbw.addEventListener("pointermove", e => { if (!sbd) return; const d = (e.clientX - sbd.sx) / sbd.z * (S.sb?.right ? -1 : 1);
    S.sb = {...S.sb, w: Math.round(Math.max(180, Math.min(420, sbd.w0 + d)))}; root.style.setProperty("--sbw", S.sb.w + "px"); putAll() });
  const sbEnd = () => { if (!sbd) return; sbd = null; save() };
  sbw.addEventListener("pointerup", sbEnd); sbw.addEventListener("pointercancel", sbEnd);
  // drag to reorder: a sidebar section (by its title) or a Home card
  let rd = null;
  document.addEventListener("pointerdown", e => {
    if (!on || e.button) return; const sh = e.target.closest("nav .sgh[data-cat]"), hc = !sh && e.target.closest(".homegrid > .homecat");
    if (!sh && !hc) return; e.preventDefault();
    rd = sh ? {kind: "secs", id: sh.dataset.cat, els: () => group(sh.dataset.cat)} : {kind: "home", id: hc.dataset.sec, els: () => [hc]};
    rd.els().forEach(x => x.classList.add("anchlift"));
  }, true);
  document.addEventListener("pointermove", e => {
    if (!rd) return; const mine = rd.els(), t = document.elementsFromPoint(e.clientX, e.clientY).find(x => !mine.some(d => d.contains(x)));   // under the one being dragged (it may still be gliding)
    if (rd.kind === "secs"){
      const over = t?.closest("nav .subs [data-cat]"), c = over?.dataset.cat; if (!c || c === rd.id || !CATS.includes(c)) return;
      const list = curSecs(), from = list.indexOf(rd.id), to = list.indexOf(c);
      // only once the pointer is past the middle of that section, so two sections of different heights don't flip back and forth
      const g = group(c).filter(x => x.offsetParent).map(x => x.getBoundingClientRect()), mid = (g[0].top + g[g.length - 1].bottom) / 2;
      if (to > from ? e.clientY < mid : e.clientY > mid) return;
      list.splice(from, 1); list.splice(to, 0, rd.id);
      S.secs = list; layout(true);
    } else {
      const over = t?.closest(".homegrid > .homecat"), h = over?.dataset.sec; if (!h || h === rd.id) return;
      const r = over.getBoundingClientRect(); if (Math.abs(e.clientX - (r.left + r.width / 2)) > r.width / 4 || Math.abs(e.clientY - (r.top + r.height / 2)) > r.height / 3) return;
      const list = curHome(), from = list.indexOf(rd.id), to = list.indexOf(h); list.splice(from, 1); list.splice(to, 0, rd.id);
      S.home = list; layout(true);
    }
  });
  document.addEventListener("pointerup", () => { if (!rd) return; rd.els().forEach(x => x.classList.remove("anchlift"));
    if (S.secs?.join() === CATS.join()) delete S.secs; if (S.home?.join() === SECS.join()) delete S.home; rd = null; save() });
  // while editing, links in the sidebar and on Home don't navigate
  document.addEventListener("click", e => { if (on && e.target.closest(".navcol, .homegrid")){ e.preventDefault(); e.stopPropagation() } }, true);

  // Colours: the theme editor (Danny 10-20: "this is also where the theme editor should live now"). Starts from the theme
  // in use, previews live, nothing is kept until Save (then it's one of "my themes" in Settings, same as a pasted code).
  const ST = window.SITETHEME, col = document.createElement("div"); col.className = "anchcol"; col.hidden = true;
  col.setAttribute("role", "dialog"); col.setAttribute("aria-label", "Colours"); document.body.append(col);
  let ed = null, dirty = false;
  const escq = s => String(s).replace(/[&<>"]/g, ch => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[ch]);
  const warnTxt = () => { const ct = TrackerThemes.contrast(ed.c.ink, ed.c.bg); return [ct >= 4.5, `Text on the background is hard to read (contrast ${ct.toFixed(1)}, aim for 4.5 or more).`] };
  function cols(open){
    if (!open){ if (!col.hidden && dirty) ST.revert(); col.hidden = true; dirty = false; if (on) drawBar(); return }
    const t = ST.now(); ed = {name: t.name === "Default" ? "My theme" : t.name + " edit", mode: t.mode, c: {...t.c}}; dirty = false; drawCols(); col.hidden = false;
    col.querySelector("[data-name]").focus({preventScroll: true}); if (on) drawBar();
  }
  function drawCols(msg = ""){
    const [ok, warn] = warnTxt();
    col.innerHTML = `<div class="anchcolhd"><b>Colours</b><button type="button" class="btn" data-x aria-label="Close colours">×</button></div>
      <p class="thnote">Changes show on the page as you go. Nothing is kept until you press Save.</p>
      <label class="nm">Name <input type="text" data-name maxlength="30" value="${escq(ed.name)}" spellcheck="false"></label>
      <div class="seg small" role="radiogroup" aria-label="Light or dark">${["light", "dark"].map(m => `<button type="button" role="radio" data-mode="${m}" aria-checked="${ed.mode === m}">${m === "light" ? "Light" : "Dark"}</button>`).join("")}</div>
      <div class="anchcolgrid">${Object.entries(ST.TOKENS).map(([k, [, label]]) => `<label><input type="color" data-tok="${k}" value="${ed.c[k]}"><span>${label}</span><code>${ed.c[k]}</code></label>`).join("")}</div>
      <p class="thnote anchwarn" ${ok ? "hidden" : ""}>${warn}</p>
      <div class="throw"><button type="button" class="btn pri" data-save>Save as my theme</button><button type="button" class="btn" data-code>Copy code</button><button type="button" class="btn" data-undo>Undo changes</button></div>
      <p class="thnote" data-msg aria-live="polite">${escq(msg)}</p>`;
  }
  const preview = () => { dirty = true; ST.preview(ed) };
  col.addEventListener("input", e => { const k = e.target.dataset.tok;
    if (k){ ed.c[k] = e.target.value.toLowerCase(); e.target.parentNode.querySelector("code").textContent = ed.c[k]; preview();
      const [ok, warn] = warnTxt(), w = col.querySelector(".anchwarn"); w.hidden = ok; w.textContent = warn }
    else if (e.target.hasAttribute("data-name")) ed.name = e.target.value });
  col.addEventListener("click", async e => { const b = e.target.closest("button"); if (!b) return;
    if (b.hasAttribute("data-x")) cols(false);
    else if (b.dataset.mode){ ed.mode = b.dataset.mode; preview(); drawCols() }
    else if (b.hasAttribute("data-undo")){ ST.revert(); cols(true) }
    else if (b.hasAttribute("data-save")){ const n = ST.save(ed); dirty = false; if (n){ ed.name = n; drawCols(`Saved as "${n}". It's in Settings with the other themes.`) } }
    else if (b.hasAttribute("data-code")){ const code = ST.code(ed); try { await navigator.clipboard.writeText(code); drawCols("Code copied: paste it in the tracker under Settings > Theme > Share a theme.") } catch { drawCols(code) } } });

  // Settings: Toggle anchors and Edit colours close Settings first
  const tog = $("#anchtog"), note = $("#anchnote");
  const wideNote = () => { tog.disabled = !wide.matches; note.textContent = wide.matches ? "Move and scale the title, tagline, Search and the Settings cog; resize the sidebar or move it to the right; drag sidebar sections and Home cards into your order; Home card width; colours. F1 opens and closes it, Esc is Done. Saved in this browser." : "Edit mode is for wider screens: phones keep the default layout." };
  tog.addEventListener("click", () => { $("#thclose").click(); setOn(true) });
  $("#thedit").addEventListener("click", () => { $("#thclose").click(); cols(true) });
  wide.addEventListener("change", () => { if (!wide.matches && on) setOn(false); wideNote(); putAll() });
  addEventListener("resize", () => requestAnimationFrame(putAll));
  new MutationObserver(() => requestAnimationFrame(putAll)).observe(document.documentElement, {attributes: true, attributeFilter: ["data-size", "data-nav"]});
  wideNote(); layout(); putAll(); document.fonts?.ready.then(putAll);
  window.ANCH = {set: v => { S = clean(v); save(); layout(); putAll() }, get: () => S, on: setOn, cols};   // tests
})();
