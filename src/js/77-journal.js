/* ---------------- Journal + Home news (Danny 2026-11-03) ---------------- */
// Posts live in src/posts/*.md (front matter: title, date, author) and are baked at build time by scripts/posts.py
// into the POSTS list below: safe HTML only, game names already linked to their clean pages. The Discord bridge
// (Hermes) writes the same files; the contract is docs/ai/journal.md. Home shows the latest post and the three
// newest changelog cards, read from #log so the strip can never drift from the real changelog.
const POSTS = __POSTS__;
(() => {
const day = t => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t || ""); return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3]))
  .toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric", timeZone: "UTC"}) : "" };
// Journal page: every post as a card, newest first (the list ships empty; it fills here)
const jlist = $("#jlist");
if (jlist) jlist.innerHTML = POSTS.length ? POSTS.map(p => `<article class="card jpost" id="j-${p.slug}">
  <div class="cardhead"><h3>${esc(p.title)}</h3><span class="sub jmeta">${day(p.date)} · ${esc(p.author)}</span></div>
  <div class="jbody">${p.html}</div></article>`).join("")
  : `<p class="sub">No posts yet. The first one is being written.</p>`;
// Home: the latest post
const hj = $("#hjournal");
if (hj){ const p = POSTS[0];
  hj.innerHTML = p ? `<p class="jntitle">${esc(p.title)}</p><p class="sub">${day(p.date)} · ${esc(p.author)}</p>
    <p class="jnbody">${esc(p.excerpt)}</p><button class="btn sm" data-go="journal">Read the journal →</button>`
    : `<p class="sub">No posts yet.</p>` }
// Home Updates strip: the three newest cards of the real changelog (the version pill rides inside the heading)
const hu = $("#hupdates");
if (hu){ hu.innerHTML = [...document.querySelectorAll("#log .changelog .card")].slice(0, 3).map(c => {
    const h = c.querySelector(".cardhead h3"); if (!h) return "";
    const ver = (c.querySelector(".cardhead .ver") || {}).textContent || "";
    const title = (h.textContent || "").replace(/^v[\d.]+\s*/, "").replace(/^[A-Z][a-z]{2} \d{1,2}, \d{4} · /, "");
    return `<div class="hnrow"><span class="ver">${esc(ver)}</span><button class="hnlink" data-go="log">${esc(title)}</button></div>` }).join("")
  || `<p class="sub">Nothing new yet.</p>` }
})();
