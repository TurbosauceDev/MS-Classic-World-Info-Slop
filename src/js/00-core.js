const D = __DATA__;
const $ = s => document.querySelector(s);
const fmt = n => n == null ? "–" : Math.round(n).toLocaleString();
// map name with the minimap hover card (card itself is built in 20-quests.js)
const mapLink = (id, name) => `<span class="name mname" tabindex="0" data-map="${id}">${esc(name)}</span>`;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* tabs */
document.querySelectorAll("nav button").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll("nav button").forEach(x => x.setAttribute("aria-selected", x === b));
  ["plan","path","maps","quests","diff","cit"].forEach(id => $("#" + id).hidden = id !== b.dataset.tab);
  try { localStorage.setItem("tab", b.dataset.tab) } catch(e) {}
}));
try { const t = localStorage.getItem("tab"); if (t) document.querySelector(`[data-tab="${t}"]`)?.click() } catch(e) {}

