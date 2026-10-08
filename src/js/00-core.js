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

/* shareable links: #b=<build> or #p=<plan> (base64url JSON) open with those settings instead of the saved ones.
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
$("#home").addEventListener("click", e => { const g = e.target.closest("[data-go],[data-go-cat]"); if (!g) return;
  g.dataset.go ? $("#t-" + g.dataset.go).click() : goCat(g.dataset.goCat); window.scrollTo({top: $("nav").offsetTop - 8}) });
$("header h1").addEventListener("click", goHome);
goHome();
try { const t = HASH.p ? "path" : HASH.b ? "plan" : HASH.m ? "mobs" : HASH.i ? "items" : localStorage.getItem("tab"); if (t && t !== "home") document.querySelector(`[data-tab="${t}"]`)?.click() } catch(e) {}

$("#srclink").addEventListener("click", e => { e.preventDefault(); $("#t-credits").click(); $("#credits").scrollIntoView() });
