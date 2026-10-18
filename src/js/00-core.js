const D = __DATA__;
const $ = s => document.querySelector(s);
// level cap is 100 at launch (Nexon's Founder's Access notes, via meowdb). The EXP table we embed stops at 70; meowdb's EXP
// guide gives the rest: every level from 51 costs 5.48% more than the one before (historical reference; confirmed to 49).
const EXP_SURE = 49, MAX_LEVEL = 100;
for (let l = 71; l < MAX_LEVEL; l++) if (D.exp[l] == null) D.exp[l] = Math.trunc(D.exp[l - 1] * 1.0548);
const fmt = n => n == null ? "–" : Math.round(n).toLocaleString();
// map name with the minimap hover card (card itself is built in 20-quests.js)
const mapLink = (id, name) => `<span class="name mname" tabindex="0" data-map="${id}">${esc(name)}</span>`;
// NPC and monster names with their hover cards (cards in 20-quests.js)
const npcLink = name => D.npcid[name] ? `<span class="nname" tabindex="0" data-npc="${D.npcid[name]}">${esc(name)}</span>` : esc(name || "");
const MOBID = {};   // name -> id, preferring a monster that's at launch
for (const [id, m] of Object.entries(D.mobs)) if (!(m[0] in MOBID) || (D.latermobs.includes(MOBID[m[0]]) && !D.latermobs.includes(id))) MOBID[m[0]] = id;
const mobLink = idOrName => { const id = D.mobs[idOrName] || D.mobdb[idOrName] ? String(idOrName) : MOBID[idOrName];
  return id ? `<span class="mobname" tabindex="0" data-mob="${id}">${esc(D.mobs[id]?.[0] ?? D.mobdb[id].name)}</span>` : esc(idOrName) };
const mobList = names => names.split(", ").map(mobLink).join(", ");
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* shareable links: #b=<build>, #p=<plan>, #m/#i/#s=<monster/item/skill id>, #w=<map id>, #n=<route>, #t=<Where to train>, #q=<quest search> (base64url JSON) open with those settings instead of the saved ones.
   Inside the claude.ai artifact the page's own URL isn't shareable, so links point at the GitHub Pages copy. */
const SHARE_BASE = "https://turbosaucedev.github.io/MS-Classic-World-Info-Slop/";
const HASH = (() => { const o = {}; try { for (const part of location.hash.slice(1).split("&")){ const [k, v] = part.split("=");
  if (v) o[k] = JSON.parse(decodeURIComponent(escape(atob(v.replace(/-/g, "+").replace(/_/g, "/"))))) } } catch(e) {} return o })();
const shareUrl = (k, obj) => {
  const enc = btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const own = /^https?:$/.test(location.protocol) && !/claude|usercontent|anthropic/.test(location.hostname);
  return `${own ? location.origin + location.pathname : SHARE_BASE}#${k}=${enc}`;
};
// copy to the clipboard; where that's blocked (sandboxed frames), show the link in a box to copy by hand
async function copyShare(btn, url){
  const old = btn.dataset.label || (btn.dataset.label = btn.textContent);
  try { await navigator.clipboard.writeText(url); btn.textContent = "Link copied" }
  catch(e){ let box = btn.nextElementSibling; if (!box || !box.classList.contains("sharebox")){ box = document.createElement("input"); box.className = "sharebox"; box.readOnly = true; btn.after(box) }
    box.value = url; box.select(); btn.textContent = "Copy the link from the box" }
  setTimeout(() => { btn.textContent = old }, 2500);
}

/* tabs: category row (.cats) + that category's pages (.subs); Home is a category with no pages. Page buttons keep
   their #t-<id> ids, so code elsewhere can still open a page with $("#t-items").click(). */
const TABS = [...document.querySelectorAll("nav [data-tab]")], CATS = [...document.querySelectorAll("nav .cats button")];
const LASTTAB = {};   // category -> last page opened in it
const showCat = cat => {
  CATS.forEach(x => x.setAttribute("aria-selected", x.dataset.cat === cat));
  TABS.forEach(x => x.hidden = x.dataset.cat !== cat);
  $("nav .subs").hidden = cat === "home";
};
TABS.forEach(b => b.addEventListener("click", () => {
  showCat(b.dataset.cat); LASTTAB[b.dataset.cat] = b.dataset.tab;
  TABS.forEach(x => x.setAttribute("aria-selected", x === b));
  $("#home").hidden = true; TABS.forEach(x => $("#" + x.dataset.tab).hidden = x !== b);
  try { localStorage.setItem("tab", b.dataset.tab) } catch(e) {}
}));
const goHome = () => { showCat("home"); TABS.forEach(x => { x.setAttribute("aria-selected", false); $("#" + x.dataset.tab).hidden = true });
  $("#home").hidden = false; try { localStorage.setItem("tab", "home") } catch(e) {} };
const goCat = cat => cat === "home" ? goHome() : $("#t-" + (LASTTAB[cat] || TABS.find(x => x.dataset.cat === cat).dataset.tab)).click();
CATS.forEach(b => b.addEventListener("click", () => goCat(b.dataset.cat)));
// Home: a click on a section card (not one of its links) grows it into a "billboard" at the top (wider, bigger text, a
// longer description); a second click, or another card, shrinks it back. Animated with the View Transitions API where the
// browser has it (each card has its own view-transition-name), instantly elsewhere and with reduced motion.
function homeBig(cat){
  const cards = [...document.querySelectorAll(".homecat")], cur = cards.find(c => c.classList.contains("bill")), next = cur?.dataset.sec === cat ? null : cat;
  const apply = () => { cards.forEach(c => { const on = c.dataset.sec === next; c.classList.toggle("bill", on); c.querySelector(".hcat").setAttribute("aria-expanded", on) });
    const top = $("#home").getBoundingClientRect().top; if (next && top < 0) window.scrollBy(0, top - 8) };   // the billboard sits first: keep it in view
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (document.startViewTransition && !calm){ cards.forEach((c, i) => c.style.viewTransitionName = "hc" + i); document.startViewTransition(apply) } else apply();
}
$("#home").addEventListener("click", e => { if (e.target.closest("a")) return;
  const g = e.target.closest("[data-go],[data-go-cat]");
  if (!g){ const c = e.target.closest(".homecat"); if (c) homeBig(c.dataset.sec); return }
  g.dataset.go ? $("#t-" + g.dataset.go).click() : goCat(g.dataset.goCat); window.scrollTo({top: $("nav").offsetTop - 8}) });
// Home sprites: data-ic="i:<item>|m:<mob>|s:<skill>" -> the icon already in D (no new requests)
document.querySelectorAll("img[data-ic]").forEach(im => { const [k, id] = im.dataset.ic.split(":"), b = {i: D.iicons, m: D.mobimg, s: D.icons}[k]?.[id];
  if (b) im.src = "data:image/png;base64," + b; else im.remove() });
$("header h1").addEventListener("click", goHome);
// read the last page before goHome() overwrites it with "home" (that made every visit land on Home)
let SAVEDTAB = null; try { SAVEDTAB = localStorage.getItem("tab") } catch(e) {}
goHome();
try { const t = HASH.p ? "path" : HASH.b ? "plan" : HASH.m ? "mobs" : HASH.i ? "items" : HASH.s ? "skills" : HASH.n ? "navi" : HASH.t ? "maps" : HASH.q ? "quests" : SAVEDTAB; if (t && t !== "home") document.querySelector(`[data-tab="${t}"]`)?.click() } catch(e) {}

$("#srclink").addEventListener("click", e => { e.preventDefault(); $("#t-credits").click(); $("#credits").scrollIntoView() });
// "about 1 per X kills" for n picked up in k kills, plus a likely range (95% Wilson interval: a statistics estimate, wide
// while kills are few). Used on monster and item pages (48-monsters.js, 49-items.js).
function dropRate(n, k){
  if (n >= k) return `about ${(n / k).toFixed(1)} per kill`;
  const z = 1.96, p = n / k, den = 1 + z * z / k, mid = (p + z * z / (2 * k)) / den, half = z * Math.sqrt(p * (1 - p) / k + z * z / (4 * k * k)) / den;
  const a = Math.round(1 / Math.min(1, mid + half)), b = Math.round(1 / Math.max(1e-6, mid - half));
  return `about 1 per ${fmt(Math.round(k / n))} kills` + (a !== b ? ` <span class="tiny" title="95% range from these counts (an estimate: it narrows as more kills are shared)">(likely ${fmt(a)}-${fmt(b)})</span>` : "");
}
