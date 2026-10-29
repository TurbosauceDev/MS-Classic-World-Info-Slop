// Tracker window, updates, Help, title bar, Settings, themes, sharing, shortcuts, Install (renderer.js is split in load order; all share one global scope, see renderer.js)
// updates: "Check for updates" in Settings; a banner on top once one is downloaded. Restarting saves a running session first.
function showUpdate(u){
  if (!u) return;
  const note = {checking: "Checking...", latest: "You have the latest version.", downloading: `Downloading ${u.version ? "version " + u.version : "the update"}${u.pct ? " (" + u.pct + "%)" : ""}...`,
    ready: `Version ${u.version} is ready.`, dev: "Running from source: no updates here.", error: "Couldn't check: " + (u.why || "no connection") + "."}[u.state];
  if (note) $("#updNote").textContent = note;
  $("#updCheck").disabled = u.state === "checking" || u.state === "downloading";
  $("#updBanner").classList.toggle("hidden", u.state !== "ready");
  $("#updInstall").classList.toggle("hidden", u.state !== "ready");
  $("#updText").textContent = `Update ${u.version || ""} is ready.`;
}
host.onUpdate?.(showUpdate);
// Help: the ? button, F1 or Help in the menu; a pop-up over the layout (renderer.js modalOpen), ✕, Esc or a click outside closes it
function openHelp(){
  $("#helpPop").scrollTop = 0; modalOpen($("#helpPop"), $("#helpClose"));
}
$("#helpBtn").onclick = openHelp;
// Patch notes (Help, or Help > Patch notes in the menu): changelog.js, newest first
$("#patchList").innerHTML = (window.TrackerChangelog || []).map(([v, d, t]) => { const {lead, bullets} = window.TrackerChangelog.parts(t);
  return `<p class="patchv"><b>${esc(v)}</b> <span class="note">${esc(d)}</span> · ${esc(lead)}</p>` + (bullets.length ? `<ul>${bullets.map(b => `<li>${esc(b)}</li>`).join("")}</ul>` : "") }).join("");
function openPatchNotes(){ $("#patchNotes").open = true; openHelp(); $("#helpPop").scrollTop += $("#patchNotes").getBoundingClientRect().top - $("#helpPop .pophead").getBoundingClientRect().bottom - 6 }
$("#helpPop")._close = el => modalClose(el, $("#helpBtn"));
$("#helpClose").onclick = () => modalClose($("#helpPop"), $("#helpBtn"));
document.addEventListener("keydown", e => { if (e.key === "F1"){ e.preventDefault(); openHelp() } });
// Esc with nothing open opens Settings (Danny 2026-10-23: "options open up on pressing esc"); with a pop-up open, Esc closes it
// (renderer.js, which runs first and marks the key handled). Not while dragging, picking a shortcut, or with the toolbox open
document.addEventListener("keydown", e => { if (e.key === "Escape" && !e.defaultPrevented && !MODALS.length && !drag && !keyWait && $("#toolbox").classList.contains("hidden") && !e.ctrlKey && !e.altKey && !e.shiftKey){ e.preventDefault(); openPrefs() } });
// title bar: File / View / Help open the app's menus under the button
// Settings: a popup from File → Settings (Ctrl+,). Was the Settings tab, then "Preferences" on the title bar; Danny 2026-10-18:
// "rename preferences back to settings and have it live under file". Esc, ✕ or a click outside closes it
function openPrefs(){ prefsPick = null; $("#prefsPop").scrollTop = 0; modalOpen($("#prefsPop"), $("#prefsClose")); prefsSpy() }
function closePrefs(){ modalClose($("#prefsPop"), $("#titlebar [data-menu=File]")) }
$("#prefsPop")._close = closePrefs;
// section chips at the top: jump to a section; the one in view is marked as you scroll
const PREF_SECS = [...document.querySelectorAll("#prefsPop > [data-nav]")];
$("#prefsNav").innerHTML = PREF_SECS.map((c, i) => `<button type="button" data-i="${i}">${esc(c.dataset.nav)}</button>`).join("");
// the header with the chips stays on top and wraps to 3 lines in a narrow window: sections land just under it (scrollIntoView
// put them under it, and the chip marked was the section before, 2026-10-19)
const prefsHead = () => $("#prefsNav").getBoundingClientRect().bottom;
// the chip picked stays marked (the last short sections can't scroll up to the top, so the spy would mark the last one) until
// the player scrolls by hand
let prefsPick = null;
function prefsGo(sec){ const pop = $("#prefsPop"); prefsPick = PREF_SECS.indexOf(sec); pop.scrollTop += sec.getBoundingClientRect().top - prefsHead() - 8; prefsSpy() }
for (const k of ["wheel", "keydown", "touchstart"]) $("#prefsPop").addEventListener(k, () => { prefsPick = null }, {passive: true});
$("#prefsPop").addEventListener("pointerdown", e => { if (e.target === $("#prefsPop")) prefsPick = null });   // its scrollbar
$("#prefsNav").onclick = e => { const b = e.target.closest("button"); if (b) prefsGo(PREF_SECS[+b.dataset.i]) };
function prefsSpy(){ const top = prefsHead() + 30, pop = $("#prefsPop");
  let i = PREF_SECS.findLastIndex(c => c.getBoundingClientRect().top <= top); if (pop.scrollTop + pop.clientHeight >= pop.scrollHeight - 4) i = PREF_SECS.length - 1;
  if (prefsPick != null && prefsPick >= 0) i = prefsPick;
  $("#prefsNav").querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-current", String(j === Math.max(0, i)))) }
$("#prefsPop").addEventListener("scroll", prefsSpy, {passive: true});
$("#prefsClose").onclick = closePrefs;
for (const b of document.querySelectorAll("#titlebar [data-menu]")) b.onclick = () => { const r = b.getBoundingClientRect(); host.menu?.(b.dataset.menu, r.left, r.bottom) };
host.onMenu?.(what => {
  if (what === "help") openHelp();
  else if (what === "patchnotes") openPatchNotes();
  else if (what === "settings") openPrefs();
  else if (what === "history") openHist();
  else if (what === "reset") resetTracker();
  else if (what === "dummy") dummyToggle();
  else if (what === "fit") fitAll();
  else if (what === "align") alignAll();
  else if (what === "toolbox"){ document.body.classList.remove("mini"); document.body.classList.remove("focus"); host.mini?.(false); tbOpen() }
  else if (what === "mini") (document.body.classList.contains("mini") ? $("#miniFull") : $("#miniBtn")).click();
  else if (what === "focus") (document.body.classList.contains("focus") ? $("#fzFull") : $("#focusBtn")).click();
  else if (what === "overlay") $("#overlayBtn").click();
  else if (what === "overlayEdit") host.overlayEdit?.();
  else if (what === "report") openBugPop();
  else if (what.startsWith("onTop:")){ const on = what === "onTop:true"; settings.onTop = on; $("#ontop").checked = on; $("#status").textContent = "Keep on top: " + (on ? "on" : "off") + "." }
  else if (what.startsWith("clickThrough:")){ const on = what === "clickThrough:true"; document.body.classList.toggle("through", on)
    $("#status").textContent = on ? `Click-through on: clicks go to the game. ${keyText(keyState.keys.clickThrough)} turns it off.` : "Click-through off." }
  else if (what === "mark") markNow();
  else if (what === "saveImage") saveNumbers();
  else if (what === "mute") muteSet(!settings.muted);
  else if (what === "startStop"){ if (!$("#go").disabled) $("#go").click() }
  else if (what === "pause") $("#pauseBtn").click();
  else if (what === "invNow"){ if (timer == null || !engine?.invNow) $("#status").textContent = "Press Start first."; else { engine.invNow(); $("#status").textContent = "Reading your open inventory tab: keep it open a few seconds..." } }
  else if (what === "update"){ openPrefs(); prefsGo($("#updCheck").closest("[data-nav]")); $("#updCheck").click() }
});
// Theme (Settings): the presets (themes.js) and the player's own (settings.themes); settings.theme = "p:Name" or "u:Name".
// Edit colours previews live; Save keeps it as one of yours; share as a one-line code or a .mstheme file
const TH = window.TrackerThemes, darkQ = matchMedia("(prefers-color-scheme: dark)");
let thEdit = null;   // the theme being edited: {name, mode, c, from: "u:Name" when it's one of yours}
const myThemes = () => (Array.isArray(settings.themes) ? settings.themes : []).map(TH.clean).filter(Boolean);
const allThemes = () => [...TH.PRESETS.map(t => ["p:" + t.name, t]), ...myThemes().map(t => ["u:" + t.name, t])];
const themeNow = () => allThemes().find(([id]) => id === settings.theme)?.[1] || TH.PRESETS[0];
function themeShow(t = thEdit || themeNow()){
  const r = TH.apply(t, darkQ.matches);
  document.body.classList.toggle("skin-elv", r.sk === "elv");   // the panel style rides the theme (0.2.92): the Elv re-skin
  host.themeBar?.({color: r.c.panel, symbolColor: r.c.ink, bg: r.c.bg});
  return r;
}
function themeUi(){
  const cur = settings.theme || "p:" + TH.PRESETS[0].name;
  $("#themeSw").innerHTML = allThemes().map(([id, t]) => { const c = TH.resolve(t, darkQ.matches).c;
    return `<button role="radio" aria-checked="${id === cur}" data-th="${esc(id)}" style="background:${c.panel};color:${c.ink}" title="${esc(t.name)}${id.startsWith("u:") ? " (yours)" : ""}">`
      + `<span class="bars"><i style="background:${c.bg}"></i><i style="background:${c.accent}"></i><i style="background:${c.soft}"></i><i style="background:${c.leaf}"></i><i style="background:${c.bad}"></i></span>`
      + `<span class="nm">${esc(t.name)}${id.startsWith("u:") ? " ★" : ""}</span></button>` }).join("");
  const t = themeNow(); $("#themeNow").textContent = t.mode === "system" ? "Follows Windows' light or dark mode." : "";
}
async function themePick(id){ settings = await host.settings({theme: id}); thEdit = null; $("#themeEditor").classList.add("hidden"); themeShow(); themeUi() }
$("#themeSw").onclick = e => { const b = e.target.closest("[data-th]"); if (b) themePick(b.dataset.th) };
function editorUi(){
  const t = thEdit;
  $("#thName").value = t.name; $("#thMode").value = t.mode; $("#thSkin").value = t.sk === "elv" ? "elv" : "glass";
  $("#thColors").innerHTML = Object.entries(TH.TOKENS).map(([k, [, label]]) => `<label><input type="color" data-tk="${k}" value="${t.c[k]}"> ${esc(label)}</label>`).join("");
  $("#thDelete").classList.toggle("hidden", !t.from);
  thWarn();
}
// readable? text on boxes, faded text, and the buttons' text on the accent (WCAG: 4.5 for text, 3 for big/bold)
function thWarn(){
  const c = thEdit.c, low = [["Text", c.ink, c.panel, 4.5], ["Faded text", c.muted, c.panel, 3], ["Text on accent", c.on, c.accent, 3], ["Text on background", c.ink, c.bg, 4.5]]
    .filter(([, a, b, min]) => TH.contrast(a, b) < min).map(([n]) => n);
  $("#thWarn").textContent = low.length ? "Hard to read: " + low.join(", ") + ". Try a lighter or darker colour." : "";
}
$("#themeEdit").onclick = () => {
  const t = themeNow(), r = TH.resolve(t, darkQ.matches), mine = settings.theme?.startsWith("u:");
  thEdit = {name: mine ? t.name : t.name + " (mine)", mode: r.mode, c: {...r.c}, sk: r.sk === "elv" ? "elv" : "glass", from: mine ? settings.theme : null};
  $("#themeEditor").classList.remove("hidden"); editorUi(); $("#thName").focus();
};
$("#thColors").oninput = e => { const k = e.target.dataset.tk; if (!k || !thEdit) return; thEdit.c[k] = e.target.value; themeShow(); thWarn() };
$("#thMode").onchange = e => { if (thEdit){ thEdit.mode = e.target.value; themeShow() } };
$("#thSkin").onchange = e => { if (thEdit){ thEdit.sk = e.target.value === "elv" ? "elv" : "glass"; themeShow() } };   // live preview of the re-skin
$("#thName").oninput = e => { if (thEdit) thEdit.name = e.target.value };
$("#thCancel").onclick = () => { thEdit = null; $("#themeEditor").classList.add("hidden"); themeShow() };
// saved under its name (the same name replaces that theme); at most 40 of your own
async function themeSave(t, from = null){
  const c = TH.clean(t); if (!c) return null;
  const list = myThemes().filter(x => "u:" + x.name !== from && x.name !== c.name);
  if (TH.PRESETS.some(p => p.name === c.name)) c.name += " (mine)";
  list.push(c); settings = await host.settings({themes: list.slice(-40), theme: "u:" + c.name});
  return c;
}
$("#thSave").onclick = async () => {
  if (!thEdit) return; const c = await themeSave({...thEdit, name: $("#thName").value}, thEdit.from);
  if (!c) return; thEdit = null; $("#themeEditor").classList.add("hidden"); themeShow(); themeUi(); $("#thNote").textContent = `Saved "${c.name}".`;
};
$("#thDelete").onclick = async () => {
  if (!thEdit?.from) return; const gone = thEdit.from;
  settings = await host.settings({themes: myThemes().filter(x => "u:" + x.name !== gone), theme: "p:" + TH.PRESETS[0].name});
  thEdit = null; $("#themeEditor").classList.add("hidden"); themeShow(); themeUi(); $("#thNote").textContent = "Theme deleted.";
};
// sharing: what's on screen (the one being edited, else the chosen one)
const themeShared = () => { const t = thEdit ? {...thEdit, name: $("#thName").value} : TH.resolve(themeNow(), darkQ.matches); return TH.clean(t) };
$("#thCopy").onclick = async () => {
  const code = TH.encode(themeShared()); $("#thCode").value = code;
  try { await navigator.clipboard.writeText(code); $("#thNote").textContent = "Share code copied: paste it anywhere. Others paste it under Share a theme." }
  catch { $("#thCode").select(); $("#thNote").textContent = "Copy the code from the box (Ctrl+C)." }
};
$("#thExport").onclick = () => {
  const t = themeShared(), a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify({app: "MS Classic Grind Tracker theme", v: 1, ...t}, null, 1)], {type: "application/json"}));
  a.download = t.name.replace(/[^\w ()-]+/g, "").trim().replace(/\s+/g, "-") + ".mstheme"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  $("#thNote").textContent = "Saved as " + a.download + ".";
};
async function themeAdd(t, how){
  if (!t) return $("#thNote").textContent = how === "file" ? "That file isn't a tracker theme." : "That isn't a theme code (they start with MSCT1.).";
  const c = await themeSave(t); themeShow(); themeUi(); $("#thNote").textContent = `Added "${c.name}" and switched to it.`;
}
$("#thPaste").onclick = () => { themeAdd(TH.decode($("#thCode").value), "code"); $("#thCode").value = "" };
$("#thCode").onkeydown = e => { if (e.key === "Enter") $("#thPaste").click() };
$("#thOpen").onclick = () => $("#thFile").click();
$("#thFile").onchange = async e => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
  if (f.size > 20000) return $("#thNote").textContent = "That file is too big for a theme.";
  const text = await f.text(); let t = TH.decode(text); if (!t) try { t = TH.clean(JSON.parse(text)) } catch {}
  themeAdd(t, "file") };
darkQ.addEventListener?.("change", () => { themeShow(); themeUi() });
// profiles (0.2.61, Danny: "like ElvUI / Plater": a friend's code is plug and play): a profile is a whole setup, the saved
// layout (order, widths, heights, folded), the theme (a preset by name, one of yours in full), Settings > Layout's switches,
// the see-through level and the window size. Codes are the 0.2.60 MSCS1 setup codes with name/prefs/win added (themes.js
// cleans both ways; old codes still work, an MSCT1 theme code is a theme-only setup). settings.profiles = cleaned setups with
// a name, settings.profile = the one in use: switching away saves what's on screen into it first, so nothing set is lost.
// A pasted code shows a preview (boxes drawn in its theme) before anything changes
const boxIds = () => BOXES.map(b => b.dataset.box);
const isMini = () => document.body.classList.contains("mini");
function setupNow(name){ const id = settings.theme || "p:" + TH.PRESETS[0].name;
  const x = {layout: settings.layout || null, theme: id.startsWith("p:") ? {preset: id.slice(2)} : TH.clean(themeNow()),
    prefs: {fit: settings.fit !== false, fitWin: !!settings.fitWin, snap: settings.snap !== false, opacity: +settings.opacity || 1}};
  if (!isMini()) x.win = {w: innerWidth, h: innerHeight};
  if (name) x.name = name;
  return x }
const profs = () => (Array.isArray(settings.profiles) ? settings.profiles : []).map(p => TH.cleanSetup(p, boxIds())).filter(p => p?.name);
async function profPut(p, list = profs()){ list = list.filter(x => x.name !== p.name); list.push(p); settings = await host.settings({profiles: list.slice(-30)}) }
// what's on screen, into the profile in use (if it still exists)
async function profKeep(){ const n = settings.profile; if (!n || !profs().some(p => p.name === n)) return;
  const c = TH.cleanSetup(setupNow(n), boxIds()); if (c) await profPut(c) }
const freeName = n => { const have = new Set(profs().map(p => p.name)); let r = n, i = 2; while (have.has(r)) r = `${n.slice(0, 34)} (${i++})`; return r };
async function setupApply(x){
  if (x.layout){ flip(() => layoutLoad(x.layout)); for (const b of BOXES) foldMark(b) }
  const p = x.prefs || {};
  if ("fit" in p){ flip(() => fitSet(p.fit)); $("#fitBoxes").checked = p.fit }
  if ("snap" in p){ document.body.classList.toggle("snap", p.snap); $("#snapBoxes").checked = p.snap }
  if ("fitWin" in p){ fitWinSet(p.fitWin); $("#fitWin").checked = p.fitWin }
  if ("opacity" in p){ const op = Math.round(p.opacity * 100); $("#opacity").value = op; $("#opacityV").textContent = op + "%" }
  if (Object.keys(p).length) settings = await host.settings(p);
  if (x.win && !isMini()) await host.winSize?.(x.win.w, x.win.h);
  if (x.layout) layoutSave();
  if (x.theme?.preset) await themePick("p:" + x.theme.preset); else if (x.theme){ await themeSave(x.theme); themeShow(); themeUi() }
}
// built-in profiles (themes.js BUILTIN) sit under their own heading as "b:<name>": switching to one works like any other,
// but nothing is ever saved into it (profKeep only writes your own); Save current setup as makes your own copy
const profFind = v => v?.startsWith("b:") ? TH.builtins(boxIds()).find(p => p.name === v.slice(2)) : profs().find(p => p.name === v);
const profLabel = v => v?.startsWith("b:") ? v.slice(2) : v;
function profUi(){
  const list = profs(), built = TH.builtins(boxIds()), cur = settings.profile, sel = $("#profSel"), was = sel.value;
  const opt = (v, n) => `<option value="${esc(v)}">${esc(n)}${v === cur ? " (in use)" : ""}</option>`;
  sel.innerHTML = (list.length ? `<optgroup label="Yours">${list.map(p => opt(p.name, p.name)).join("")}</optgroup>` : `<option value="" disabled>No profiles of yours yet: save one below</option>`)
    + `<optgroup label="Built in">${built.map(p => opt("b:" + p.name, p.name)).join("")}</optgroup>`;
  const vals = [...sel.options].filter(o => !o.disabled).map(o => o.value);
  sel.value = vals.includes(was) ? was : vals.includes(cur) ? cur : vals[0] || "";
  $("#profUse").disabled = !sel.value; $("#profDel").disabled = !sel.value || sel.value.startsWith("b:");
}
$("#profSel").onchange = () => { $("#profDel").disabled = !$("#profSel").value || $("#profSel").value.startsWith("b:") };
$("#profSave").onclick = async () => {
  const n = $("#profName").value.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 40) || profLabel(settings.profile) || "My setup";
  const c = TH.cleanSetup(setupNow(n), boxIds()); if (!c) return $("#setupNote").textContent = "Nothing to save yet.";
  await profPut(c); settings = await host.settings({profile: n}); $("#profName").value = ""; profUi(); $("#profSel").value = n;
  $("#setupNote").textContent = `Saved profile "${n}". Changes you make now go into it when you switch.`;
};
async function profSwitch(v){
  const to = profFind(v); if (!to) return;
  if (v !== settings.profile) await profKeep();
  await setupApply(to); settings = await host.settings({profile: v}); profUi();
  $("#setupNote").textContent = `Switched to "${to.name}".` + (v.startsWith("b:") ? " It's built in: to keep changes, save them under a name of your own." : "");
}
$("#profUse").onclick = () => profSwitch($("#profSel").value);
$("#profDel").onclick = async () => { const n = $("#profSel").value; if (!n || n.startsWith("b:")) return;
  settings = await host.settings({profiles: profs().filter(p => p.name !== n), ...(settings.profile === n ? {profile: null} : {})}); profUi();
  $("#setupNote").textContent = `Deleted profile "${n}". The boxes and theme on screen stay as they are.` };
$("#setupCopy").onclick = async () => {
  const code = TH.encodeSetup(setupNow(profLabel(settings.profile)), boxIds()); if (!code) return $("#setupNote").textContent = "Nothing to share yet.";
  $("#setupCode").value = code;
  try { await navigator.clipboard.writeText(code); $("#setupNote").textContent = "Profile code copied. Friends paste it here, press Preview, then Use it." }
  catch { $("#setupCode").select(); $("#setupNote").textContent = "Copy the code from the box (Ctrl+C)." }
};
// the preview: the code's boxes as they'd sit (rows side by side, columns stacked, widths by weight) in the code's colours
let spCode = null;
function spMapHtml(x){
  const t = x.theme?.preset ? TH.PRESETS.find(p => p.name === x.theme.preset) : x.theme || themeNow(), c = TH.resolve(t, darkQ.matches).c;
  const title = id => BOXES.find(b => b.dataset.box === id)?.dataset.title || id, folded = new Set(x.layout?.folded || []);
  const cell = (id, f) => `<b style="flex:${f || 1} 1 0;background:${c.panel};color:${c.ink};border:1px solid ${c.line}${folded.has(id) ? ";opacity:.6" : ""}">${esc(title(id))}${folded.has(id) ? " +" : ""}</b>`;
  const items = x.layout?.order.dock || [];
  const rows = items.map(it => typeof it === "string" ? `<div class="r">${cell(it)}</div>`
    : `<div class="r">${it.row.map((p, i) => Array.isArray(p) ? `<div class="c" style="flex:${it.w[i] || 1} 1 0">${p.map(id => cell(id)).join("")}</div>` : cell(p, it.w[i])).join("")}</div>`).join("");
  return {html: rows || `<span style="color:${c.muted}">Keeps your box layout (this code only has a theme)</span>`, bg: c.bg, accent: c.accent};
}
function setupPreview(text){
  const x = TH.decodeSetup(text, boxIds());
  if (!x){ spCode = null; $("#setupPrev").classList.add("hidden"); return $("#setupNote").textContent = "That isn't a profile code (they start with MSCS1., or MSCT1. for a theme)." }
  spCode = x; const m = spMapHtml(x), p = x.prefs || {}, onOff = v => v ? "on" : "off";
  $("#spName").textContent = (x.name ? `"${x.name}"` : "A profile code") + (x.layout ? "" : " (theme only)");
  $("#spMap").innerHTML = m.html; $("#spMap").style.background = m.bg; $("#spMap").style.outline = `1px solid ${m.accent}`;
  const n = x.layout ? x.layout.order.dock.flat(2).flatMap(i => typeof i === "string" ? [i] : i.row.flat()).length : 0;
  $("#spInfo").textContent = [
    x.layout && `${n} box${n === 1 ? "" : "es"} (the rest go in the Modules toolbox)`,
    x.theme && "Theme: " + (x.theme.preset || x.theme.name),
    x.win && `Window ${x.win.w} × ${x.win.h}`,
    "fit" in p && "Fit boxes " + onOff(p.fit), "fitWin" in p && "window follows boxes " + onOff(p.fitWin), "snap" in p && "line up " + onOff(p.snap),
    p.opacity && p.opacity < 1 && `see-through ${Math.round(p.opacity * 100)}%`].filter(Boolean).join(" · ") + ".";
  $("#setupPrev").classList.remove("hidden"); $("#setupNote").textContent = "";
}
$("#setupPaste").onclick = () => setupPreview($("#setupCode").value);
$("#setupCode").onkeydown = e => { if (e.key === "Enter") $("#setupPaste").click() };
$("#spCancel").onclick = () => { spCode = null; $("#setupPrev").classList.add("hidden"); $("#setupNote").textContent = "Nothing changed." };
// a code you use becomes a profile; what you had is kept as your profile in use, or as "My old setup" when you had none
async function spTake(use){
  const x = spCode; if (!x) return; spCode = null; $("#setupPrev").classList.add("hidden");
  if (use){ if (settings.profile && profs().some(p => p.name === settings.profile)) await profKeep();
    else { const c = TH.cleanSetup(setupNow("My old setup"), boxIds()); if (c) await profPut(c) } }
  const n = freeName(x.name || (x.layout ? "Friend's setup" : "Friend's theme")), full = {...x, name: n};
  if (x.layout) await profPut(TH.cleanSetup(full, boxIds()));
  if (use){ await setupApply(x); if (x.layout) settings = await host.settings({profile: n}) }
  else if (!x.layout){ await themeSave(x.theme); themeShow(); themeUi() }
  profUi(); $("#setupCode").value = "";
  $("#setupNote").textContent = use ? (x.layout ? `Using "${n}". Your old setup is kept under Profiles.` : "Theme set from the code.")
    : x.layout ? `Saved as profile "${n}". Pick it above and press Switch to it.` : "Theme added to your themes.";
}
$("#spUse").onclick = () => spTake(true);
$("#spKeep").onclick = () => spTake(false);

// Settings: keyboard shortcuts (they work from the game too; main.js registers them) and the see-through window
const KEY_NAMES = {onTop: "Keep on top on/off", startStop: "Start / Stop", pause: "Pause / go on", mini: "Simple Mode on/off", focus: "Focus mode on/off", overlay: "Overlay mode show/hide", overlayEdit: "Overlay: edit the layout", toolbox: "Modules toolbox open/close",
  show: "Hide / show the tracker", invNow: "Read the open inventory tab now", report: "Report a bug",
  clickThrough: "Click-through on/off (mouse goes to the game)", mark: "Mark this moment (in the run note)", saveImage: "Save the numbers as a picture", mute: "Mute sounds on/off"};
const keyText = k => k ? k.replace("CommandOrControl", "Ctrl").replace("Super", "Win").replace(/\+/g, " + ") : "Off";
const CODE_KEY = {Space: "Space", Tab: "Tab", Delete: "Delete", Insert: "Insert", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Minus: "-", Equal: "=", Comma: ",", Period: ".", Slash: "/",
  Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Backquote: "`", Backspace: "Backspace"};
// a keydown -> Electron accelerator ("CommandOrControl+Shift+T"); null while only modifiers are down
function accelOf(e){
  const c = e.code, key = /^Key[A-Z]$/.test(c) ? c[3] : /^Digit\d$/.test(c) ? c[5] : /^F\d{1,2}$/.test(c) ? c : /^Numpad\d$/.test(c) ? "num" + c[6] : CODE_KEY[c];
  if (!key) return null;
  return [e.ctrlKey && "CommandOrControl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super", key].filter(Boolean).join("+");
}
let keyState = {keys: {}, defaults: {}, failed: []}, keyWait = null;
function keysUi(note){
  $("#keyRows").innerHTML = Object.entries(KEY_NAMES).map(([a, name]) => `<tr><td>${esc(name)}</td><td class="n"><button class="alt keyset${keyState.failed.includes(a) ? " bad" : ""}${!keyState.keys[a] && keyWait !== a ? " off" : ""}" data-key="${a}" title="Click, then press the new keys">${esc(keyWait === a ? "Press keys..." : keyText(keyState.keys[a]))}</button></td></tr>`).join("");
  if (note !== undefined) $("#keysNote").textContent = note;
  else if (keyState.failed.length) $("#keysNote").textContent = keyState.failed.map(a => KEY_NAMES[a]).join(", ") + ": those keys are taken by another program. Pick others.";
  // the shortcut on the Bug button's tooltip
  $("#bugBtn").title = "Report a bug" + (keyState.keys.report ? ` (${keyText(keyState.keys.report)}, works from the game too)` : "");
}
async function keysSet(change, note){ keyState = await host.keys?.(change) || keyState; keyWait = null; keysUi(note) }
$("#keyRows").onclick = async e => {
  const b = e.target.closest("[data-key]"); if (!b) return;
  if (keyWait){ const a = keyWait; keyWait = null; await keysSet(null, ""); if (a === b.dataset.key) return }   // clicked again: cancel
  keyWait = b.dataset.key; await host.keys?.(null, true); keysUi("Press the new keys for " + KEY_NAMES[keyWait] + " (Esc cancels, Backspace turns it off).");
  // the shortcuts are off while it waits: back on after 15 s, or when the window loses focus
  const w = keyWait; setTimeout(() => { if (keyWait === w) keysSet(null, "") }, 15e3);
};
addEventListener("blur", () => { if (keyWait) keysSet(null, "") });
document.addEventListener("keydown", e => {
  if (!keyWait) return;
  e.preventDefault(); e.stopPropagation();
  const a = keyWait;
  if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey) return keysSet(null, "");
  if (e.code === "Backspace" && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) return keysSet({[a]: ""}, KEY_NAMES[a] + ": off.");
  const k = accelOf(e); if (!k) return;   // only modifiers so far
  if (!/^F\d+$/.test(k.split("+").pop()) && !e.ctrlKey && !e.altKey && !e.metaKey) return keysUi("Add Ctrl or Alt to that key (Shift alone would take a letter from chat), or use an F key.");
  if (k === "Alt+F4") return keysUi("Alt+F4 closes windows: pick another.");
  const clash = Object.keys(KEY_NAMES).find(x => x !== a && keyState.keys[x] === k);
  keysSet({[a]: k, ...(clash ? {[clash]: ""} : {})}, KEY_NAMES[a] + ": " + keyText(k) + (clash ? ` (taken off ${KEY_NAMES[clash]})` : "") + ".");
}, true);
$("#keysReset").onclick = () => keysSet(Object.fromEntries(Object.entries(keyState.defaults).map(([a, k]) => [a, k])), "Shortcuts back to the defaults.");
$("#opacity").oninput = e => { $("#opacityV").textContent = e.target.value + "%" };
$("#opacity").onchange = e => host.settings({opacity: Math.min(1, Math.max(0.4, +e.target.value / 100))}).then(x => settings = x);
// Mark: a time stamp (and the map) in the run's note, for "this is when the party left" moments; also in the log
function markNow(){
  const d = new Date(), at = d.toLocaleTimeString([], {hour: "numeric", minute: "2-digit"}), map = session?.stats().nowMapName;
  const line = `[${at}] mark${map ? " · " + map : ""}`, n = $("#runNote");
  n.value = (n.value ? n.value.replace(/\s*$/, "") + "\n" : "") + line; log("mark", {map: map || null});
  $("#status").textContent = `Marked ${at} (in the run note, under Stop's wrap-up).`;
}
// Save as picture: the run summary when it's showing, else the numbers at the top (EXP/hr, mesos, kills)
async function saveNumbers(){
  const el = !$("#summary").classList.contains("hidden") ? $("#summary") : $("#top"), d = new Date(), p2 = n => String(n).padStart(2, "0");
  try { await host.saveImage(`${el.id === "summary" ? "run" : "now"}-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.png`, await elPng(el), true);
    $("#status").textContent = "Picture saved to Pictures\\MS Classic Tracker runs and copied." }
  catch (e){ log("error", {where: "save picture", msg: String(e)}); $("#status").textContent = "Couldn't save the picture." }
}
const muteSet = on => host.settings({muted: !!on}).then(x => { settings = x; $("#muted").checked = !!on; $("#status").textContent = on ? "Sounds muted." : "Sounds on." });
$("#muted").onchange = e => muteSet(e.target.checked);
// the update channel (0.2.82): beta = pre-release builds reach this copy (main.js applies allowPrerelease on save)
const betaSet = on => host.settings({beta: !!on}).then(x => { settings = x; $("#beta").checked = !!on;
  $("#status").textContent = on ? "Beta channel on: test builds arrive as they're built." : "Back to the stable channel." });
$("#beta").onchange = e => betaSet(e.target.checked);
$("#fitBoxes").onchange = e => { flip(() => fitSet(e.target.checked)); host.settings({fit: e.target.checked}).then(x => settings = x) };
$("#fitWin").onchange = e => { fitWinSet(e.target.checked); host.settings({fitWin: e.target.checked}).then(x => settings = x) };
$("#layoutFit").onclick = () => fitAll();
$("#layoutAlign").onclick = () => alignAll();
$("#snapBoxes").onchange = e => { flip(() => snapSet(e.target.checked)); if (e.target.checked) layoutSave(); host.settings({snap: e.target.checked}).then(x => settings = x) };
$("#updCheck").onclick = async () => { $("#updNote").textContent = "Checking..."; showUpdate(await host.updateCheck?.()) };
// Install (Settings) and Restart and update (the banner, which stays on top while scrolling) do the same
$("#updInstall").onclick = () => $("#updGo").click();
$("#updGo").onclick = async () => {
  $("#updGo").disabled = true; $("#updInstall").disabled = true; $("#updNote").textContent = "Installing... the tracker closes and opens again by itself.";
  if (timer != null){ $("#status").textContent = "Saving this session before the update..."; await finish() }
  if (!await host.updateInstall?.()){ $("#updGo").disabled = $("#updInstall").disabled = false; $("#status").textContent = "The update isn't ready yet." }
};
(async () => {
  host.version?.().then(v => { if (!v) return; $("#appVer").textContent = v; $("#helpVer").textContent = "MS Classic Grind Tracker " + v }).catch(() => {});
  host.updateState?.().then(u => u.state !== "idle" && showUpdate(u)).catch(() => {});
  settings = await host.settings();
  $("#share").checked = !!settings.share;
  $("#kpqName").checked = settings.kpqName !== false;
  fitSet(settings.fit !== false); $("#fitBoxes").checked = settings.fit !== false; $("#fitWin").checked = !!settings.fitWin;
  document.body.classList.toggle("snap", settings.snap !== false); $("#snapBoxes").checked = settings.snap !== false;
  layoutLoad(settings.layout); for (const b of BOXES) foldMark(b);
  if (settings.fitWin) fitWinSet(true);
  $("#job").value = settings.job || "";
  $("#ontop").checked = settings.onTop !== false;
  const op = Math.round((+settings.opacity || 1) * 100); $("#opacity").value = op; $("#opacityV").textContent = op + "%";
  keysSet(null); themeShow(); themeUi(); profUi(); $("#muted").checked = !!settings.muted; $("#beta").checked = settings.beta === true;
  // the old "Show me where my potions are" box (removed in 0.2.36): counts are looked for on the whole screen again
  if (settings.countArea) settings = await host.settings({countArea: null});
  await alertsBoot();   // conditions & alerts: migrate the pre-0.2.78 keys once, then render the rows
  $("#kpqAct").value = settings.kpqAct || "auto"; $("#kpqMode").value = settings.kpqMode === "Rush" ? "Rush" : "Bonus";
  $("#bagMain").checked = bagCfg().main; $("#bagEvery").value = bagCfg().every;
  $("#autoPause").checked = settings.autoPause !== false;   // on unless turned off   // on unless turned off
  goalUi(); meatUi();
  $("#pcode").value = settings.partyCode || "";
  $("#nick").value = settings.nick || "";
  $("#guide").classList.toggle("hidden", !!settings.guideDone);
  recoverCheck().catch(() => {});   // a run left by a crash or power cut (its autosave)
  const found = await host.gameFound();
  $("#status").textContent = found ? "MapleStory window found." : "Start MapleStory, then press Start.";
})();
