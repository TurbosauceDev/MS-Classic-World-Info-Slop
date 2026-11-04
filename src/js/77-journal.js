/* ---------------- Newsfeed (Home) + Journal (Danny 2026-11-03) ---------------- */
// Posts live in src/posts/*.md (front matter: title, date, author, optional image) and are baked at build time by
// scripts/posts.py into the POSTS list below: safe HTML only, game names already linked to their clean pages.
// The Discord bridge (Hermes) writes the same files; the contract is docs/ai/journal.md. POST_AVATARS is one sprite
// per poster (src/posts/avatars/<author>.png): Turbozo wears the green Slime, the site's own update posts (Glorg)
// wear the Orange Mushroom; a poster without a file gets a letter chip.
// Home is a newsfeed in the wowhead-shaped format Turbozo picked (2026-11-04): every entry is a full post card -
// poster avatar + byline, the post's main image when it has one, a body that folds past a max length behind a
// frosted cutoff with a "… continue reading" button, a comment box at the bottom, and a click on the card
// minimizes it to its header (click again to reopen). The newest changelog entries are posts here too (author
// Glorg), still read live from #log so they can't drift from the real changelog; the Overview page (#overview,
// the old home grid) links every page; the Journal page lists every post, newest first.
const POSTS = __POSTS__;
const POST_AVATARS = __AVATARS__;
window.POSTS = POSTS;   // tests + the console (the Pages copy runs the app inside a promise callback, so a bare const is not a global there)
(() => {
const day = t => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t || ""); return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3]))
  .toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric", timeZone: "UTC"}) : "" };
const dayLong = t => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t || ""); return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3]))
  .toLocaleDateString("en-US", {weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC"}) : "" };
const ago = t => { const s = (Date.now() - +new Date(t)) / 1e3; if (!isFinite(s) || s < 0) return day(t);
  if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`; if (s < 604800) return `${Math.floor(s / 86400)}d ago`; return day(t) };
const hue = n => { let h = 0; for (const c of String(n)) h = (h * 31 + c.charCodeAt(0)) % 360; return h };
// ---- per-card view state: peek (default) / full (continue reading) / min (header only); remembered per post so
// Back from an entity page lands on the article the way the reader left it (sessionStorage "jx:<slug>")
const FOLD_H = 420, UPS = {author: "Glorg", cat: "Site update"};
const sget = k => { try { return sessionStorage.getItem(k) } catch (e) { return null } };
const sset = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v) } catch (e) {} };   // storage off (private mode): the view just is not remembered
// ---- comments (wowhead-style, Turbozo 2026-11-04). No server for them yet, so a thread lives in this browser
// (localStorage "jc:<slug>"): name + text, one reply level, likes. The feed and the Journal page share a slug,
// so both views show the same thread. The block is built so a backend can replace cLoad/cSave alone.
const cLoad = slug => { try { const a = JSON.parse(localStorage.getItem("jc:" + slug) || "[]");
  return Array.isArray(a) ? a.filter(c => c && c.id && typeof c.b === "string" && typeof c.t === "string") : [] } catch (e) { return [] } };
const cSave = (slug, a) => { try { localStorage.setItem("jc:" + slug, JSON.stringify(a.slice(-100))) } catch (e) {} };   // storage off (private mode): the thread lives for the session only
const cWho = () => { try { return String(localStorage.getItem("jcwho") || "").slice(0, 24) } catch (e) { return "" } };
const cLiked = (slug, id) => { try { return (JSON.parse(localStorage.getItem("jcl:" + slug) || "[]") || []).includes(id) } catch (e) { return false } };
const cLikeToggle = (slug, id) => { try { const a = JSON.parse(localStorage.getItem("jcl:" + slug) || "[]") || [];
  const i = a.indexOf(id); i < 0 ? a.push(id) : a.splice(i, 1);
  localStorage.setItem("jcl:" + slug, JSON.stringify(a.slice(-500))) } catch (e) {} };   // storage off: likes just do not persist
const cRow = (slug, c, rep) => `<div class="jc${rep ? " jcrep" : ""}" data-cid="${esc(c.id)}">
  <span class="jca" aria-hidden="true" style="background:hsl(${hue(c.t)},42%,44%)">${esc((c.t[0] || "?").toUpperCase())}</span>
  <div class="jcm"><div class="jcline"><b class="jcwho">${esc(c.t)}</b><span class="jctime">${ago(c.at)}</span></div>
    <div class="jcb">${esc(c.b).replace(/\n/g, "<br>")}</div>
    <div class="jcact"><button class="linkbtn jclike" type="button">${(c.l || 0) + (cLiked(slug, c.id) ? 1 : 0) ? `♥ ${(c.l || 0) + (cLiked(slug, c.id) ? 1 : 0)}` : "like"}</button>
    ${rep ? "" : `<button class="linkbtn jcre" type="button">reply</button>`}</div>
    <div class="jcr"></div></div></div>`;
const commentsHtml = (slug, list) => { const n = list.reduce((a, c) => a + 1 + (c.r || []).length, 0);
  return `<div class="jcomments"><div class="jch">Comments${n ? ` <span class="jcount">${n}</span>` : ""}</div>
  <div class="jclist">${list.length ? list.map(c => cRow(slug, c) + (c.r || []).map(x => cRow(slug, x, true)).join("")).join("")
    : `<p class="sub jcnone">No comments yet.</p>`}</div>
  <div class="jcform"><input class="jcname" maxlength="24" placeholder="Name" aria-label="Your name" value="${esc(cWho())}">
    <textarea class="jctext" maxlength="600" placeholder="Add a comment…" aria-label="Add a comment"></textarea>
    <div class="jcrow"><span class="sub jcnote">comments live in this browser for now</span><button class="btn sm jcpost" type="button">Post comment</button></div></div></div>` };
const newComment = (name, text) => ({id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
  t: name.trim().slice(0, 24) || "Anonymous", b: text.trim().slice(0, 600), at: new Date().toISOString(), l: 0, r: []});
// ---- card anatomy (feed + Journal page)
const javatar = a => { const u = POST_AVATARS[(a || "").toLowerCase()];
  return u ? `<img class="javatar" src="${u}" alt="" aria-hidden="true">`
    : `<span class="javatar jnoav" aria-hidden="true" style="background:hsl(${hue(a || "?")},42%,44%)">${esc((a || "?")[0].toUpperCase())}</span>` };
const jcard = (p, cat) => { const min = sget("jx:" + p.slug) === "min";
  return `<article class="card jpost${cat === UPS.cat ? " jupd" : ""}" data-slug="${esc(p.slug)}" data-jstate="${min ? "min" : "peek"}">
  <div class="cardhead jhead"><h3>${esc(p.title)}</h3>
    <div class="jby">${javatar(p.author)}<span class="jwho"><span class="jauthor">${esc(p.author)}</span>
      <span class="sub jmeta">${p.ver ? `<span class="ver">${esc(p.ver)}</span> · ` : ""}<span class="jcat">${esc(cat)}</span> · ${day(p.date)}${p.loglink ? ` · <a href="#" data-go="log">changelog</a>` : ""}</span></span>
      <button class="jfold" type="button" aria-expanded="${!min}" aria-label="${min ? "Expand" : "Collapse"}"><span class="jchev" aria-hidden="true">▾</span></button></div></div>
  ${p.img ? `<figure class="jimg"><img src="${p.img}" alt="" loading="lazy"></figure>` : ""}
  <div class="jfoldw" data-cut="0"><div class="jbody">${p.html}</div>
    <div class="jfade" hidden></div><button class="jmore btn sm" type="button" hidden>… continue reading</button></div>
  ${commentsHtml(p.slug, cLoad(p.slug))}</article>` };
// fold measurement lives off the hot path (rAF): the cap, the frost and the button exist only when the body
// really overflows, and re-measure once the post's main image has decoded
const applyState = card => {
  const min = card.dataset.jstate === "min", btn = card.querySelector(".jfold"), w = card.querySelector(".jfoldw");
  btn.setAttribute("aria-expanded", String(!min)); btn.setAttribute("aria-label", min ? "Expand" : "Collapse");
  if (min) return w.dataset.cut = "0";
  const body = card.querySelector(".jbody"), fade = card.querySelector(".jfade"), more = card.querySelector(".jmore");
  if (card.dataset.jstate === "full"){ w.dataset.cut = "0"; fade.hidden = true; more.hidden = true; return }
  requestAnimationFrame(() => { if (card.dataset.jstate !== "peek") return;
    const cut = body.scrollHeight > FOLD_H + 24;
    w.dataset.cut = cut ? "1" : "0"; fade.hidden = !cut; more.hidden = !cut });
};
const setState = (card, s) => { card.dataset.jstate = s; sset("jx:" + card.dataset.slug, s === "peek" ? null : s); applyState(card) };
const initCards = root => root.querySelectorAll(".jpost").forEach(card => { applyState(card);
  card.querySelectorAll(".jimg img").forEach(im => { if (!im.complete) im.addEventListener("load", () => applyState(card), {once: true}) }) });
// ---- Journal page: every post as a card, newest first (the list ships empty; it fills here)
const jlist = $("#jlist");
if (jlist){ jlist.innerHTML = POSTS.length ? POSTS.map(p => jcard(p, "Journal")).join("")
  : `<p class="sub">No posts yet. The first one is being written.</p>`; initCards(jlist) }
// ---- Home newsfeed: the newest posts and the newest changelog entries as one timeline grouped by day. The update
// posts read #log (title, version, time, body) so the feed can never drift from the real changelog.
const FEED_POSTS = 8, FEED_UPDATES = 6;
const feed = $("#feed");
if (feed){
  const logCards = [...document.querySelectorAll("#log .changelog .card")];
  const ups = logCards.slice(0, FEED_UPDATES).flatMap(c => {
    const h = c.querySelector(".cardhead h3"); if (!h || !c.dataset.t) return [];
    const ver = (c.querySelector(".cardhead .ver") || {}).textContent || "";
    return [{slug: "log-" + (ver || c.dataset.t).replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, ""),
      title: (h.textContent || "").replace(/^v[\d.]+\s*/, "").replace(/^[A-Z][a-z]{2} \d{1,2}, \d{4} · /, ""),
      ver, date: c.dataset.t.slice(0, 10), author: UPS.author, img: "", loglink: true,
      html: [...c.children].filter(x => !x.classList.contains("cardhead")).map(x => x.outerHTML).join("")}];
  });
  const items = [...POSTS.slice(0, FEED_POSTS).map(p => ({p, cat: "Journal", when: p.date + "T00:00:00Z"})),
    ...ups.map(p => ({p, cat: UPS.cat, when: p.date + "T23:59:00Z"}))].filter(x => x.when).sort((a, b) => b.when.localeCompare(a.when));
  let html = "", lastDay = "";
  for (const it of items){ const d = it.when.slice(0, 10);
    if (d !== lastDay){ lastDay = d; html += `<h2 class="fday">${dayLong(d)}</h2>` }
    html += jcard(it.p, it.cat) }
  if (POSTS.length > FEED_POSTS || logCards.length > FEED_UPDATES)
    html += `<p class="sub feedmore"><button class="linkbtn" data-go="journal">Older posts in the Journal →</button> · <button class="linkbtn" data-go="log">Everything in the changelog →</button></p>`;
  feed.innerHTML = html || `<p class="sub">Nothing here yet. The first post is being written.</p>`;
  initCards(feed);
}
// ---- one delegated click handler for the whole format: fold controls, comment actions, and the card's own
// minimize toggle (links, buttons, inputs and the comment block never toggle the card)
document.addEventListener("click", e => {
  const el = e.target, cm = el.closest?.(".jcomments"), card = el.closest?.(".jpost");
  if (cm && card){
    const slug = card.dataset.slug;
    if (el.closest(".jcpost")){ const f = cm.querySelector(".jcform"), name = f.querySelector(".jcname"), body = f.querySelector(".jctext");
      if (!body.value.trim()) return body.focus();
      try { localStorage.setItem("jcwho", name.value.trim().slice(0, 24)) } catch (err) {}   // storage off: the name is simply not remembered
      const list = cLoad(slug); list.unshift(newComment(name.value, body.value)); cSave(slug, list);
      body.value = ""; cm.innerHTML = commentsHtml(slug, cLoad(slug)); return }
    const like = el.closest(".jclike");
    if (like){ cLikeToggle(slug, like.closest(".jc").dataset.cid);
      cm.innerHTML = commentsHtml(slug, cLoad(slug)); return }
    const re = el.closest(".jcre");
    if (re){ cm.querySelectorAll(".jcrform").forEach(f => f.remove());
      re.closest(".jc").querySelector(".jcr").innerHTML = `<div class="jcrform"><input class="jcname" maxlength="24" placeholder="Name" aria-label="Your name" value="${esc(cWho())}">
        <textarea class="jctext" maxlength="600" placeholder="Write a reply…" aria-label="Write a reply"></textarea>
        <div class="jcrow"><button class="linkbtn jcrecancel" type="button">cancel</button><button class="btn sm jcrepost" type="button" data-parent="${esc(re.closest(".jc").dataset.cid)}">Reply</button></div></div>`;
      re.closest(".jc").querySelector(".jctext").focus(); return }
    if (el.closest(".jcrecancel")){ cm.querySelectorAll(".jcrform").forEach(f => f.remove()); return }
    const rp = el.closest(".jcrepost");
    if (rp){ const root = rp.closest(".jcrform"), name = root.querySelector(".jcname"), body = root.querySelector(".jctext");
      if (!body.value.trim()) return body.focus();
      try { localStorage.setItem("jcwho", name.value.trim().slice(0, 24)) } catch (err) {}   // storage off: the name is simply not remembered
      const list = cLoad(slug), top = list.find(c => c.id === rp.dataset.parent);
      if (top){ (top.r = top.r || []).push(newComment(name.value, body.value)); cSave(slug, list) }
      cm.innerHTML = commentsHtml(slug, cLoad(slug)); return }
  }
  if (!card) return;
  if (el.closest(".jmore")) return setState(card, "full");
  if (el.closest(".jfold")) return setState(card, card.dataset.jstate === "min" ? "peek" : "min");
  if (el.closest("a, button, input, textarea, select, .jcomments")) return;
  if (String(getSelection ? getSelection() : "")) return;   // a drag-select is not a collapse click
  setState(card, card.dataset.jstate === "min" ? "peek" : "min");
});
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
