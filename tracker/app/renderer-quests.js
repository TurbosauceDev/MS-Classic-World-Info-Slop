// Quests (P1-7, Turbozo: "lets implement that quest hud helper"): the in-game QUEST window, read live by the same
// engine the site's Quest log uses (app/questread.js — the shared reading core, 60b-questread.js). While tracking, a
// watcher notices the window open and reads it every tick; the Quests card lists what's in progress, the rows it
// wasn't sure of, and a QSL1 code the site's Quest log pastes in. Nothing uploads — quest progress stays on this PC.
let questBusy = false, questRD = null, questFrames = 0, questUsed = 0, questNoted = "";
let questState = GrindQuestLog.createState();
// the same rows the site matches against, from the tracker's own game data (the three regions the Quest log has no
// categories for are already out)
const QREAD = QuestRead.create([...G.quests.map(r => ["q", r]), ...G.citq.map(r => ["cit", r])], {cls: () => settings.job || ""});
const qName = id => { const x = QREAD.BYID.get(String(id)); return x ? x[1].name : null };
const qValidId = id => QREAD.BYID.has(String(id));

// one settle over the open reader -> card + run log (the window's list is the truth for in-progress; done accumulates)
function questSettle(){
  const res = QREAD.settle(questRD, questFrames, questUsed);
  res.done = res.done.filter(qValidId);
  for (const id of Object.keys(res.prog)) if (!qValidId(id)) delete res.prog[id];
  const r = GrindQuestLog.apply(res, questState);
  renderQuests();
  const sig = r.progN + "/" + r.doneN + "/" + questState.unsure.length;
  if (sig !== questNoted){ questNoted = sig;
    note(`Quest log: ${r.progN} in progress${r.doneN ? `, ${r.doneN} done` : ""}${questState.unsure.length ? ` (${questState.unsure.length} row${questState.unsure.length > 1 ? "s" : ""} not sure)` : ""}.`, "run") }
}
function renderQuests(){
  const box = $("#questRows"), st = questState, n = Object.keys(st.prog).length;
  if (!n && !st.unsure.length && !st.done.length){ box.innerHTML = `<div class="empty">Open QUEST in the game (In Progress tab) and the tracker reads it while you play. Nothing is shared.</div>`;
    $("#questNote").textContent = ""; return }
  // in progress: quest name under its questline, the region as the pill
  const rows = Object.entries(st.prog).map(([id, ln]) => { const x = QREAD.BYID.get(id)?.[1] || {};
    return `<tr><td>${esc(x.name || "Quest " + id)}${x.name && ln && ln !== x.name ? `<div class="note">${esc(ln)}</div>` : ""}</td><td><span class="note">${esc(x.region || "")}</span></td></tr>` }).sort((a, b) => a[1].localeCompare(b[1]));
  box.innerHTML = (n ? `<table>${rows.join("")}</table>` : "") +
    (st.unsure.map(u => `<div class="note">Not sure (${esc(u.cat)}): ${u.opts.map(o => `<button class="linkbtn" data-qln="${esc(o)}" title="Count it as in progress">${esc(o)}</button>`).join(" · ")}</div>`).join(""));
  $("#questNote").textContent = `Read ${new Date(st.at).toLocaleTimeString("en-GB")}: ${n} in progress${st.done.length ? `, ${st.done.length} done` : ""}. The site's Quest log takes this over with the code below.`;
}
// unsure rows: a pick counts that quest in (its id from the questline name, if the name is ours)
$("#questRows").addEventListener("click", e => { const ln = e.target.dataset?.qln; if (!ln) return;
  const x = QREAD.BYLN.get(ln); if (!x) return;
  questState.prog[String(x[1].id)] = ln; questState.unsure = questState.unsure.filter(u => !u.opts.includes(ln));
  renderQuests() });
async function questScan(manual){
  if (questBusy) return;
  if (!video?.videoWidth){ if (manual) $("#status").textContent = "Press Start first, then open QUEST (In Progress) and press this again."; return }
  questBusy = true;
  try {
    let f = grabFrame(); f = f.k ? f : GrindReaders.native(f);
    const fr = QREAD.readFrame({width: f.w, height: f.h, data: f.d.slice()});
    questFrames++;
    if (fr){ if (!questRD) { questRD = QREAD.reader(); questUsed = 0; questNoted = "" }
      if (questRD.add(fr)){ questUsed++; questSettle() }
      if (manual) $("#status").textContent = fr.tab ? `Reading the QUEST window (${fr.tab === "prog" ? "In Progress" : fr.tab === "done" ? "Completed" : "Available"}).` : "Quest list found, but not its tabs: keep Available / In Progress / Completed in view.";
    } else if (questRD){   // the window went away: settle what scrolled past, then start fresh next time
      questSettle(); questRD = null; if (manual) $("#status").textContent = "Quest window not on screen.";
    } else if (manual) $("#status").textContent = "No quest window on screen. Open QUEST in the game, then press this again.";
  } catch (e){ if (manual) $("#status").textContent = "Quest read failed: " + (e?.message || e) }
  finally { questBusy = false }
}
$("#questRead").onclick = () => questScan(true);
// the site's Quest log takes the read over: one code, pasted there (nothing leaves this PC until you paste it yourself)
$("#questCopy").onclick = async () => {
  const code = QuestRead.syncCode(questState.done.filter(qValidId), Object.fromEntries(Object.entries(questState.prog).filter(([id]) => qValidId(id))));
  try { await navigator.clipboard.writeText(code); $("#questCopyNote").textContent = "Copied. Paste it on the site's Quest log page (Training › Quest log)." }
  catch { $("#questCopyNote").textContent = "Copy failed — select it here: " + code; }
};
// ---- Quest watch (Settings > Window and sharing): the shop-watch cadence, for the QUEST window ----
setInterval(() => { if (settings.questWatch !== false && !questBusy && timer != null) questScan(false).catch(() => {}) }, 4000);
