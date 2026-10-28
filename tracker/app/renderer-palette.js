// Tracker window, quick palette (0.2.85, the keyboard-UX pass): Ctrl+K opens a type-to-jump list of
// everything the window can do — every module (add or focus it), the four views, the pop-ups, and
// the run controls — filter as you type, arrows + Enter to run, Esc closes. Lives beside the global
// shortcuts (Settings > Keyboard shortcuts): those work while the GAME has focus, the palette is the
// in-window answer to "everything is one keypress away". Loaded after renderer-settings.js (which
// owns openPrefs/openHelp) and renderer-overlay.js, so every action exists by then.
const PAL_ITEMS = () => {
  const items = [];
  for (const b of [...$("#dock").children, ...$("#shelf").children].filter(x => x.dataset && x.dataset.box)){
    const inDock = !b.closest("#shelf");
    items.push({label: (inDock ? "Show " : "Add ") + b.dataset.title, hint: "module", run: () => { if (inDock){ b.classList.remove("folded"); foldMark(b); b.scrollIntoView({block: "nearest"}) } else addBox(b.dataset.box) }});
  }
  items.push(
    {label: "Start / stop tracking", hint: "run", run: () => $("#go").click()},
    {label: "Settings", hint: "pop-up", run: () => openPrefs()},
    {label: "Past sessions", hint: "pop-up", run: () => openHist()},
    {label: "Help", hint: "pop-up", run: () => openHelp()},
    {label: "Patch notes", hint: "pop-up", run: () => window.menu("patchnotes")},
    {label: "Modules toolbox", hint: "layout", run: () => tbOpen()},
    {label: "Compare watched items", hint: "market", run: () => { if ($("#watchBox").closest("#shelf")) addBox("watch"); cmpOpen() }},
  );
  const bind = (sel, label, hint) => { const el = $(sel); if (el && !el.closest("#shelf")) items.push({label, hint, run: () => el.click()}) };
  bind("#miniBtn", "Simple Mode", "view"); bind("#focusBtn", "Focus Mode", "view"); bind("#overlayBtn", "Overlay Mode", "view");
  return items;
};
// flat filter: every query word must appear in the label (case-insensitive); no ranking fanciness
const palMatch = (it, words) => { const l = it.label.toLowerCase(); return words.every(w => l.includes(w)) };

let palSel = 0;
function palRender(){
  const q = $("#palQ").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = PAL_ITEMS().filter(it => palMatch(it, q));
  palSel = Math.min(palSel, Math.max(0, list.length - 1));
  $("#palList").innerHTML = list.map((it, i) => `<li role="option" aria-selected="${i === palSel}" data-i="${i}" class="${i === palSel ? "sel" : ""}"><span>${esc(it.label)}</span><span class="note">${esc(it.hint)}</span></li>`).join("")
    || `<li class="note" style="pointer-events:none">Nothing matches — try fewer words.</li>`;
  $("#palList")._items = list;
  const sel = $("#palList [aria-selected=true]"); if (sel) sel.scrollIntoView({block: "nearest"});
}
function palRun(list, i){
  const it = list[i];
  if (!it) return;
  palClose();
  it.run();
}
function palOpen(){
  $("#palQ").value = ""; palSel = 0; palRender();
  modalOpen($("#palPop"), $("#palQ"));
}
function palClose(){ modalClose($("#palPop"), document.activeElement) }
$("#palQ").addEventListener("input", () => { palSel = 0; palRender() });
$("#palPop").addEventListener("keydown", e => {
  const list = $("#palList")._items || [];
  if (e.key === "ArrowDown" || e.key === "ArrowUp"){
    e.preventDefault();
    palSel = (palSel + (e.key === "ArrowDown" ? 1 : list.length - 1)) % Math.max(1, list.length);
    palRender();
  } else if (e.key === "Enter"){ e.preventDefault(); palRun(list, palSel) }
});
$("#palList").addEventListener("click", e => { const li = e.target.closest("li[data-i]"); if (li) palRun($("#palList")._items || [], +li.dataset.i) });
$("#palClose").onclick = palClose;
$("#palPop")._close = palClose;
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k" && !e.defaultPrevented && !MODALS.some(m => m !== $("#palPop"))){
    e.preventDefault(); palIsOpen() ? palClose() : palOpen();
  }
});
const palIsOpen = () => modalIsOpen($("#palPop"));
