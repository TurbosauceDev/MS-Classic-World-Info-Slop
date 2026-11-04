/* ---------------- Newsfeed (Home) + Journal + Article pages (Danny 2026-11-03, Turbozo 2026-11-04) ---------------- */
// Posts live in src/posts/*.md (front matter: title, date, author, image, tags, featured) and are baked at build
// time by scripts/posts.py into the POSTS list below: safe HTML only, game names already linked to their clean
// pages. The Discord bridge (Hermes) writes the same files; the contract is docs/ai/journal.md. POST_AVATARS is
// one sprite per poster (src/posts/avatars/<author>.png): Turbozo wears the green Slime, the site's own update
// posts (Glorg) wear the Orange Mushroom; a poster without a file gets a letter chip.
// Home is a newsfeed in the wowhead-shaped format Turbozo picked (2026-11-04): a featured hero, a tag-filter
// row, then every entry as a post card - poster avatar + byline with tag chips, the post's main image when it
// has one, and a body that folds past a max length behind a frosted cutoff. "… continue reading", the title and
// the image open THE ARTICLE: its own page (the Journal page's article view, deep-linkable #a=<slug>, shareable
// as https://maplestory.scumlord.studio/news/<slug>/ - scripts/pages_gen.py writes that static page, link
// previews included) with the full body and the wowhead-style comment box. A card click still minimizes it to
// its header. The newest changelog entries are posts here too (author Glorg, tag Site Updates), still read live
// from #log so they can't drift from the real changelog; the Overview page (#overview) links every page; the
// Journal page lists every post, newest first.
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
// ---- per-card view state: peek (default) / min (header only); remembered per post so Back from an article or an
// entity page lands on the feed the way the reader left it (sessionStorage "jx:<slug>")
const FOLD_H = 420, UPS = {author: "Glorg", tag: "Site Updates"};
const TAGS = ["Maple News", "Maple Patch Notes", "Maple Misc", "Site Updates", "Blog Post", "Guide", "Event", "Market"];   // canonical order for the filter row; a post may carry tags beyond these
const sget = k => { try { return sessionStorage.getItem(k) } catch (e) { return null } };
const sset = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v) } catch (e) {} };   // storage off (private mode): the view just is not remembered
// ---- comments (wowhead-style, Turbozo 2026-11-04). No server for them yet, so a thread lives in this browser
// (localStorage "jc:<slug>"): name + text, one reply level, likes. The article page owns the box now (Turbozo:
// comments are only visible when the article is open), and the slug is shared by every view of the same post.
// The block is built so a backend can replace cLoad/cSave alone.
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
// ---- card anatomy (feed + Journal page). No comment box here: comments live on the article page (Turbozo 11-04).
const javatar = a => { const u = POST_AVATARS[(a || "").toLowerCase()];
  return u ? `<img class="javatar" src="${u}" alt="" aria-hidden="true">`
    : `<span class="javatar jnoav" aria-hidden="true" style="background:hsl(${hue(a || "?")},42%,44%)">${esc((a || "?")[0].toUpperCase())}</span>` };
const jtags = (p, tags) => (tags || []).map(t => `<button class="jtag linkbtn" type="button" data-jtag="${esc(t)}" title="Filter the feed to ${esc(t)}">${esc(t)}</button>`).join(" ");
// the byline reads like a forum post (Turbozo 2026-11-04): the author, then the version, then the date, then the tags -
// stacked, not "v0.22.1 · Site Updates · Nov 4, 2026" on one line; the date-side changelog link is gone (the tag filters
// the feed to Site Updates, and the changelog button on Home and in the article nav already go there)
const jmeta = (p, tags) => `<span class="sub jmeta">${p.ver ? `<span class="ver">${esc(p.ver)}</span>` : ""}<span class="jdate">${day(p.date)}</span>${jtags(p, tags) ? `<span class="jtagrow">${jtags(p, tags)}</span>` : ""}</span>`;
const jcard = (p, tags) => { const min = sget("jx:" + p.slug) === "min";
  return `<article class="card jpost${(tags || []).includes(UPS.tag) ? " jupd" : ""}" data-slug="${esc(p.slug)}" data-jstate="${min ? "min" : "peek"}">
  <div class="cardhead jhead"><h3 class="jtitle" title="Open the article">${p.featured ? `<span class="jfeat" title="Featured post">★</span> ` : ""}${esc(p.title)}</h3>
    <div class="jby">${javatar(p.author)}<span class="jwho"><span class="jauthor">${esc(p.author)}</span>${jmeta(p, tags)}</span>
      <button class="jfold" type="button" aria-expanded="${!min}" aria-label="${min ? "Expand" : "Collapse"}"><span class="jchev" aria-hidden="true">▾</span></button></div></div>
  ${p.img ? `<figure class="jimg"><img src="${p.img}" alt="" title="Open the article"></figure>` : ""}
  <div class="jfoldw" data-cut="0"><div class="jbody">${p.html}</div>
    <div class="jfade" hidden></div><button class="jmore btn sm" type="button" hidden>… continue reading</button></div>
  </article>` };
// fold measurement lives off the hot path (rAF): the cap, the frost and the button exist only when the body
// really overflows, and re-measure once the post's main image has decoded
const applyState = card => {
  const min = card.dataset.jstate === "min", btn = card.querySelector(".jfold"), w = card.querySelector(".jfoldw");
  btn.setAttribute("aria-expanded", String(!min)); btn.setAttribute("aria-label", min ? "Expand" : "Collapse");
  const body = card.querySelector(".jbody"), fade = card.querySelector(".jfade"), more = card.querySelector(".jmore");
  if (min){ w.dataset.cut = "0"; fade.hidden = true; more.hidden = true; return }
  requestAnimationFrame(() => { if (card.dataset.jstate !== "peek") return;
    const cut = body.scrollHeight > FOLD_H + 24;
    w.dataset.cut = cut ? "1" : "0"; fade.hidden = !cut; more.hidden = !cut });
};
const setState = (card, s) => { card.dataset.jstate = s; sset("jx:" + card.dataset.slug, s === "peek" ? null : s); applyState(card) };
const initCards = root => root.querySelectorAll(".jpost").forEach(card => { applyState(card);
  card.querySelectorAll(".jimg img").forEach(im => { if (!im.complete) im.addEventListener("load", () => applyState(card), {once: true}) }) });
// ---- the update posts: every changelog entry as a post by Glorg (the feed shows the newest few; the article
// page can open any of them). Read live from #log so the feed can never drift from the real changelog.
const logCards = [...document.querySelectorAll("#log .changelog .card")];
const ups = logCards.flatMap(c => {
  const h = c.querySelector(".cardhead h3"); if (!h || !c.dataset.t) return [];
  const ver = (c.querySelector(".cardhead .ver") || {}).textContent || "";
  return [{slug: "log-" + (ver || c.dataset.t).replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, ""),
    title: (h.textContent || "").replace(/^v[\d.]+\s*/, "").replace(/^[A-Z][a-z]{2} \d{1,2}, \d{4} · /, ""),
    ver, date: c.dataset.t.slice(0, 10), author: UPS.author, img: "", loglink: true, tags: [UPS.tag], featured: false,
    html: [...c.children].filter(x => !x.classList.contains("cardhead")).map(x => x.outerHTML).join("")}];
});
const ALL = [...POSTS.map(p => ({...p, tags: p.tags && p.tags.length ? p.tags : ["Blog Post"]})), ...ups];
const findPost = slug => ALL.find(p => p.slug === slug);
// ---- Journal page: every post as a card, newest first (the list ships empty; it fills here). The article view
// (#jart) replaces the list while an article is open; #a=<slug> deep links straight into one.
const jintro = $(".jintro"), jlist = $("#jlist"), jart = $("#jart");
if (jlist){ jlist.innerHTML = POSTS.length ? POSTS.map(p => jcard(p, p.tags)).join("")
  : `<p class="sub">No posts yet. The first one is being written.</p>`; initCards(jlist) }
// ---- the article page (Turbozo 11-04: every article opens into its own page, shareable like wowhead's)
let openSlug = "";
const artByline = p => `<div class="jby jartby">${javatar(p.author)}<span class="jwho"><span class="jauthor">${esc(p.author)}</span>${jmeta(p, p.tags)}</span></div>`;
const artHtml = p => `<div class="jarttop">
    <button class="linkbtn jback" type="button">← Back</button>
    <button class="linkbtn jshare" type="button">Copy link</button></div>
  <article class="card jart" data-slug="${esc(p.slug)}">
    <div class="jartchips">${(p.tags || []).map(t => `<button class="jtag linkbtn" type="button" data-jtag="${esc(t)}" title="Filter the feed to ${esc(t)}">${esc(t)}</button>`).join(" ")}
      ${p.featured ? `<span class="jfeat">★ Featured</span>` : ""}</div>
    <h2 class="jarttitle">${esc(p.title)}</h2>
    ${artByline(p)}
    ${p.img ? `<figure class="jimg big"><img src="${p.img}" alt=""></figure>` : ""}
    <div class="jbody">${p.html}</div>
    ${commentsHtml(p.slug, cLoad(p.slug))}</article>
  <p class="sub jartnav"><button class="linkbtn" data-go="journal">All posts in the Journal →</button>${p.loglink ? ` · <button class="linkbtn" data-go="log">Everything in the changelog →</button>` : ""}</p>`;
const openArt = (slug, fromTab) => {
  const p = findPost(slug); if (!p) return false;
  openSlug = slug;
  jart.dataset.slug = slug;   // .jarttop's buttons (Back / Copy link) sit outside the card, so the wrapper carries the slug
  jart.innerHTML = artHtml(p);
  jart.hidden = false; jlist.hidden = true; if (jintro) jintro.hidden = true;
  if (!fromTab) $("#t-journal").click();   // from the feed: the tab click is the navigation (75-history records the trip)
  setTitle(p.title);
  scrollTo(0, 0);
  return true };
const closeArt = () => { openSlug = ""; jart.hidden = true; jart.innerHTML = "";
  jlist.hidden = false; if (jintro) jintro.hidden = false; setTitle("Journal") };
const st = () => history.state && history.state.nav ? history.state : null;   // 75-history's entry shape
navReg("journal", () => openSlug, v => { if (v){ openArt(v, $("#t-journal").getAttribute("aria-selected") === "true") } else closeArt() });
// Back/Forward landing on another page leaves the article's stale state behind (75-history only restores the
// destination tab's place): an open article inside the hidden journal section would leak its links into
// "#journal .jbody a" counts and reopen on the next visit. popstate fires on the window (75-history's target).
addEventListener("popstate", () => { if (openSlug && $("#journal").hidden) closeArt() });
if (HASH.a) openArt(String(HASH.a), $("#t-journal").getAttribute("aria-selected") === "true");   // share link: /news/<slug>/ lands here via its redirect, the artifact takes #a=
// ---- Home newsfeed: featured hero, tag-filter row, then the newest posts and changelog entries as one timeline
// grouped by day. The filter and the fold states are this session's preferences (sessionStorage).
const FEED_POSTS = 8, FEED_UPDATES = 6;
const feed = $("#feed");
if (feed){
  const inUse = [...TAGS.filter(t => ALL.some(p => (p.tags || []).includes(t))),
    ...[...new Set(ALL.flatMap(p => p.tags || []))].filter(t => !TAGS.includes(t)).sort()];
  let filter = sget("jt:feed") || "All";
  if (filter !== "All" && !inUse.includes(filter)){ filter = "All"; sset("jt:feed", null) }
  const hero = POSTS.find(p => p.featured);
  const heroHtml = p => `<div class="jhero card" data-slug="${esc(p.slug)}" role="link" tabindex="0" title="Open the article">
    ${p.img ? `<img class="jheroimg" src="${p.img}" alt="">` : ""}
    <div class="jheromain"><span class="jfeat">★ Featured</span><h3>${esc(p.title)}</h3>
      <p class="sub">${esc(p.excerpt)}</p>${artByline(p)}</div></div>`;
  const pillsHtml = () => `<div class="jfilter" role="group" aria-label="Filter posts by tag">` +
    ["All", ...inUse].map(t => `<button class="jfpill${t === filter ? " on" : ""}" data-jfilter="${esc(t)}" aria-pressed="${t === filter}">${esc(t)}</button>`).join("") + `</div>`;   // a function of filter: the highlight must follow every click
  const render = () => {
    const items = [...POSTS.slice(0, FEED_POSTS).map(p => ({p, tags: p.tags, when: p.date + "T00:00:00Z"})),
      ...ups.slice(0, FEED_UPDATES).map(p => ({p, tags: p.tags, when: p.date + "T23:59:00Z"}))]
      .filter(x => x.when && (filter === "All" || (x.p.tags || []).includes(filter)))
      .sort((a, b) => b.when.localeCompare(a.when));
    let html = (filter === "All" && hero ? heroHtml(hero) : "") + pillsHtml(), lastDay = "";
    for (const it of items){ const d = it.when.slice(0, 10);
      if (d !== lastDay){ lastDay = d; html += `<h2 class="fday">${dayLong(d)}</h2>` }
      html += jcard(it.p, it.tags) }
    if (POSTS.length > FEED_POSTS || logCards.length > FEED_UPDATES)
      html += `<p class="sub feedmore"><button class="linkbtn" data-go="journal">Older posts in the Journal →</button> · <button class="linkbtn" data-go="log">Everything in the changelog →</button></p>`;
    feed.innerHTML = html || `<p class="sub">No posts carry the ${esc(filter)} tag yet.</p>`;
    initCards(feed);
  };
  render();
  window.jfeedSetFilter = t => { filter = t; sset("jt:feed", t === "All" ? null : t); render() };   // the delegated handler below filters through it (tests + console too)
}
// ---- one delegated click handler for the whole format: the article's controls, the feed's filter pills, tag
// chips, fold controls, and the card's own minimize toggle (links, buttons and inputs never toggle the card)
document.addEventListener("click", e => {
  const el = e.target, cm = el.closest?.(".jcomments");
  if (cm){ const slug = cm.closest("[data-slug]")?.dataset.slug; if (!slug) return;
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
    return }
  const art = el.closest?.(".jart, .jarttop");   // .jarttop (Back / Copy link) sits just above the article card
  if (art){
    const slug = el.closest("[data-slug]")?.dataset.slug;
    if (el.closest(".jshare")) return copyShare(el.closest(".jshare"), ROUTE_HOST + "/news/" + slug + "/");
    if (el.closest(".jback")) return st()?.i > 0 ? history.back() : closeArt();
    const chip = el.closest(".jtag");
    if (chip){ if (window.jfeedSetFilter) window.jfeedSetFilter(chip.dataset.jtag);
      closeArt(); goHome(); window.scrollTo({top: $("nav").offsetTop - 8}); return }
    const g = el.closest("[data-go]");
    if (g) return $("#t-" + g.dataset.go).click();
    return }
  const pill = el.closest?.(".jfpill");
  if (pill && window.jfeedSetFilter) return window.jfeedSetFilter(pill.dataset.jfilter);
  const heroChip = el.closest?.(".jhero .jtag");   // a hero byline chip filters instead of opening (its title says so)
  if (heroChip){ if (window.jfeedSetFilter) window.jfeedSetFilter(heroChip.dataset.jtag);
    window.scrollTo({top: $("nav").offsetTop - 8}); return }
  const hero = el.closest?.(".jhero");
  if (hero) return openArt(hero.dataset.slug);
  const card = el.closest?.(".jpost");
  if (!card) return;
  const tagBtn = el.closest(".jtag");
  if (tagBtn){ if (window.jfeedSetFilter) window.jfeedSetFilter(tagBtn.dataset.jtag);
    goHome(); window.scrollTo({top: $("nav").offsetTop - 8}); return }
  if (el.closest(".jmore") || el.closest(".jtitle") || el.closest(".jimg")) return openArt(card.dataset.slug);
  if (el.closest(".jfold")) return setState(card, card.dataset.jstate === "min" ? "peek" : "min");
  if (el.closest("a, button, input, textarea, select")) return;
  if (String(getSelection ? getSelection() : "")) return;   // a drag-select is not a collapse click
  setState(card, card.dataset.jstate === "min" ? "peek" : "min");
});
// the hero opens like a card title (click or Enter); the article's tag chips jump home with that filter on
document.addEventListener("keydown", e => { if (e.key !== "Enter") return;
  const h = e.target.closest?.(".jhero"); if (h) openArt(h.dataset.slug) });
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
