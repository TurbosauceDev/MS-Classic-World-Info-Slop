/* ---------------- Newsfeed (Home) + Journal (Danny 2026-11-03) ---------------- */
// Posts live in src/posts/*.md (front matter: title, date, author) and are baked at build time by scripts/posts.py
// into the POSTS list below: safe HTML only, game names already linked to their clean pages. The Discord bridge
// (Hermes) writes the same files; the contract is docs/ai/journal.md.
// Home is a newsfeed (the serebii.net shape Turbozo picked): one column, grouped by day, the newest journal posts
// rendered in full and the newest changelog cards as one-click rows, interleaved by date. The Overview page
// (#overview, the old home grid) links every page; the Journal page lists every post, newest first.
const POSTS = __POSTS__;
(() => {
const day = t => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t || ""); return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3]))
  .toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric", timeZone: "UTC"}) : "" };
const dayLong = t => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t || ""); return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3]))
  .toLocaleDateString("en-US", {weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC"}) : "" };
// Journal page: every post as a card, newest first (the list ships empty; it fills here)
const jlist = $("#jlist");
if (jlist) jlist.innerHTML = POSTS.length ? POSTS.map(p => `<article class="card jpost" id="j-${p.slug}">
  <div class="cardhead"><h3>${esc(p.title)}</h3><span class="sub jmeta">${day(p.date)} · ${esc(p.author)}</span></div>
  <div class="jbody">${p.html}</div></article>`).join("")
  : `<p class="sub">No posts yet. The first one is being written.</p>`;
// Home newsfeed: newest posts in full + newest changelog cards as rows, one timeline grouped by day.
// The changelog rows read #log so the feed can never drift from the real changelog; the click opens #log.
const FEED_POSTS = 8, FEED_UPDATES = 6;
const feed = $("#feed");
if (feed){
  const ups = [...document.querySelectorAll("#log .changelog .card")].slice(0, FEED_UPDATES).flatMap(c => {
    const h = c.querySelector(".cardhead h3"); if (!h) return [];
    const ver = (c.querySelector(".cardhead .ver") || {}).textContent || "";
    const title = (h.textContent || "").replace(/^v[\d.]+\s*/, "").replace(/^[A-Z][a-z]{2} \d{1,2}, \d{4} · /, "");
    return [{when: c.dataset.t || "", html: `<div class="card fupd" data-go="log" title="Open the changelog">
      <div class="cardhead"><h3>${ver ? `<span class="ver">${esc(ver)}</span> ` : ""}${esc(title)}</h3><span class="sub">site update</span></div></div>`}];
  });
  const ps = POSTS.slice(0, FEED_POSTS).map(p => ({when: p.date + "T00:00:00Z",
    html: `<article class="card jpost"><div class="cardhead"><h3>${esc(p.title)}</h3><span class="sub jmeta">${day(p.date)} · ${esc(p.author)}</span></div>
      <div class="jbody">${p.html}</div></article>`}));
  const items = [...ups, ...ps].filter(x => x.when).sort((a, b) => b.when.localeCompare(a.when));
  let html = "", lastDay = "";
  for (const it of items){ const d = it.when.slice(0, 10);
    if (d !== lastDay){ lastDay = d; html += `<h2 class="fday">${dayLong(d)}</h2>` }
    html += it.html }
  if (POSTS.length > FEED_POSTS || document.querySelectorAll("#log .changelog .card").length > FEED_UPDATES)
    html += `<p class="sub feedmore"><button class="linkbtn" data-go="journal">Older posts in the Journal →</button> · <button class="linkbtn" data-go="log">Everything in the changelog →</button></p>`;
  feed.innerHTML = html || `<p class="sub">Nothing here yet. The first post is being written.</p>`;
}
})();

/* ---------------- tooltips on linked mentions (Turbozo 2026-11-04) ---------------- */
// A name the build auto-linked (scripts/posts.py emits data-ent="kind:id") carries the same hover tooltip as the
// database pages: hover shows the game data, the click still follows the clean route to the entity's own page.
(() => {
const QIDX = {};   // quest id -> index in D.quests (questTip reads D.quests[i])
D.quests.forEach((q, i) => { if (!(q.id in QIDX)) QIDX[q.id] = i });
const entTip = el => { const [k, id] = (el.dataset.ent || ":").split(":");
  if (k === "item" && D.items[id]) return itemTip({dataset: {item: id, n: 1}});
  if (k === "mob" && (D.mobs[id] || D.mobdb[id])) return mobTip(id);
  if (k === "map" && D.maps[id]) return mapTip(id);
  if (k === "npc" && D.npcs[id]) return npcTip(id);
  if (k === "quest" && QIDX[id] != null) return questTip(D.quests[QIDX[id]]);
  return ""; };
const showEnt = el => { const t = entTip(el); if (!t) return;
  qtip.innerHTML = t; qtip.className = "itemtip"; qtip.hidden = false; placeQtip(el);
  const img = qtip.querySelector("img.mm");   // a map tooltip's minimap sizes only once decoded
  if (img && !img.complete) img.addEventListener("load", () => { if (!qtip.hidden) placeQtip(el) }, {once: true}) };
document.addEventListener("mouseover", e => { const el = e.target.closest?.(".jbody a[data-ent]"); if (el) showEnt(el) });
document.addEventListener("mouseout", e => { if (e.target.closest?.(".jbody a[data-ent]")) hideQtip() });
document.addEventListener("focusin", e => { const el = e.target.closest?.(".jbody a[data-ent]"); if (el) showEnt(el) });
document.addEventListener("focusout", hideQtip);
})();
