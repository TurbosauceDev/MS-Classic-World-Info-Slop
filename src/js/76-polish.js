// Reset filters + Copy link (01-pagectl.js): add the missing one, then park both at the right end of the first filter row
for (const [p, [rid, sid]] of Object.entries(PAGECTL)){
  const row = [rid, sid].map(i => i && $("#" + i)?.closest(".controls")).find(Boolean) || document.querySelector(`#${p} .controls`); if (!row) continue;
  const mk = (id, txt) => { const b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.id = id; b.textContent = txt; return b };
  const r = rid ? $("#" + rid) : mk(p + "ctlreset", "Reset filters"), s = sid ? $("#" + sid) : mk(p + "ctlshare", "Copy link");
  if (!rid) r.addEventListener("click", () => ctlReset(p));
  if (!sid) s.addEventListener("click", () => copyShare(s, shareUrl("L", {p, v: ctlState(p)})));
  const box = document.createElement("span"); box.className = "ctlend"; r.style.alignSelf = s.style.alignSelf = "";
  box.append(r, s); row.append(box);
}
// a list link: its page is already open (00-core.js); put the fields back once that page has drawn
if (HASH.L && Object.hasOwn(PAGECTL, HASH.L.p) && HASH.L.v && typeof HASH.L.v === "object") setTimeout(() => {
  const p = HASH.L.p; for (const e of ctlFields(p)) if (Object.hasOwn(HASH.L.v, e.id) && Object.hasOwn(CTLDEF[p], e.id)){
    const v = HASH.L.v[e.id]; if (typeof v === typeof CTLDEF[p][e.id]) ctlSet(e, v) } }, 0);

// Home: masonry. Each card spans as many 1 px grid rows as it is tall, so short cards don't sit over blank space (audit 10-21).
// Order, the billboard (full row, first) and edit-mode reorders stay plain grid; a ResizeObserver keeps spans current.
// offsetHeight, not getBoundingClientRect: at 1700px+ .wrap is CSS-zoomed (Page size), and the zoomed height left
// (zoom - 1) x card height of blank space under every card (10-21, Danny's 2000px screenshots).
{ const grid = document.querySelector(".homegrid"), GAP = 14;
  const fit = () => { if (!grid) return; for (const c of grid.children) c.style.gridRowEnd = `span ${Math.max(1, Math.ceil(c.offsetHeight + GAP))}` };
  if (grid && "ResizeObserver" in window){ grid.classList.add("masonry"); const ro = new ResizeObserver(fit);
    for (const c of grid.children) ro.observe(c); ro.observe(grid) } }

// name -> page: every nav tab label (data-go) and category (data-go-cat), lower case; generic labels left out
function pageNames(){ const m = new Map();
  for (const b of document.querySelectorAll(".subs button[data-tab]")){ const n = (b.querySelector(".sgt") || b).textContent.trim().toLowerCase(); if (n && !/^(overview|how to use)$/.test(n)) m.set(n, ["go", b.dataset.tab]) }
  for (const b of document.querySelectorAll("button[id^=c-][data-cat]")){ const n = b.textContent.trim().toLowerCase(); if (n && n !== "more" && !m.has(n)) m.set(n, ["goCat", b.dataset.cat]) }   // section names open the section page (77-landing.js)
  return m }
function linkPages(root){ const m = pageNames();
  for (const b of root.querySelectorAll("b")){ if (b.closest("a")) continue; const hit = m.get(b.textContent.trim().replace(/:$/, "").toLowerCase()); if (!hit) continue;
    const a = document.createElement("a"); a.href = "#"; a.dataset[hit[0]] = hit[1]; b.replaceWith(a); a.append(b) } }
$("#log").addEventListener("click", e => { const a = e.target.closest("a[data-go],a[data-go-cat]"); if (!a) return; e.preventDefault();
  a.dataset.go ? $("#t-" + a.dataset.go).click() : goCat(a.dataset.goCat); window.scrollTo({top: 0}) });

// Changelog: each version's time (data-t, in your time zone like the Home stamp) and older days folded under their date
{ const box = document.querySelector("#log .changelog");
  if (box){
    // page and section names in bold become links there (Danny 10-22): the lookup is the nav itself, so new pages link with no edits
    linkPages(box);
    const cards = [...box.querySelectorAll(":scope > .card")], days = new Map();
    for (const c of cards){
      const h = c.querySelector(".cardhead h3"), t = c.dataset.t || "", ms = /T/.test(t) ? Date.parse(t) : NaN;
      if (h && !isNaN(ms)){ const s = document.createElement("time"); s.className = "vtime"; s.dateTime = t;
        s.title = new Date(ms).toUTCString().replace("GMT", "UTC");
        s.textContent = new Date(ms).toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit", timeZoneName: "short"}); h.after(s) }
      const day = (h?.textContent.match(/[A-Z][a-z]{2} \d{1,2}, \d{4}/) || ["Earlier"])[0];
      if (!days.has(day)) days.set(day, []); days.get(day).push(c);
    }
    let first = true;
    for (const [day, list] of days){
      const d = document.createElement("details"); d.className = "logday"; d.open = first; first = false;
      d.innerHTML = `<summary><span>${esc(day)}</span><span class="sub">${list.length} version${list.length === 1 ? "" : "s"} · v${esc(list.at(-1).querySelector(".ver")?.textContent.slice(1) || "")}–${esc(list[0].querySelector(".ver")?.textContent.slice(1) || "")}</span></summary>`;
      const inner = document.createElement("div"); inner.className = "logdaybody"; inner.append(...list); d.append(inner); box.append(d);
    }
  }
}
