// Dummy data (View → Dummy data on/off; Danny, 2026-10-18: "populate the app with dummy data to test your UI layout"): a
// made-up 30-minute run on Snail Hunting Ground III fills every box, the run log and Mini. It never leaves this window: the
// timer stays off (so there's no Stop or Finalize, nothing goes to History) and the run slicer never sees it (nothing is
// shared). A banner says so; Clear (or Start) wipes it.
let dummyOn = false;
function dummyFill(){
  if (timer != null){ $("#status").textContent = "Dummy data only fills an idle tracker: stop tracking first."; return }
  const t0 = Date.now() - 30 * 60e3, s = GrindSession.createSession(G, {goalLevel: goalOf(), freeIds: freeIds()}), f = GrindFeed.createFeed(G);
  const drop = {2: 4000001, 4: 4000002, 8: 4000004}, bar = (t, exp, level) => ({t, type: "bar", exp, level, pct: Math.round(exp / G.exp[level] * 1e4) / 100});
  const ev = [{t: t0, type: "map", id: 42}, {t: t0, type: "job", name: settings.job || "Archer"}, bar(t0, 300, 10)];
  for (let i = 0; i < 300; i++){ const t = t0 + i * 6000, g = [2, 4, 8][i % 3];
    ev.push({t, type: "exp", gain: g}); if (i % 3 === 1) ev.push({t: t + 500, type: "meso", amount: 6 + i % 7});
    if (i % 7 === 2) ev.push({t: t + 900, type: "item", id: drop[g]});
    if (i % 40 === 39) ev.push({t: t + 1000, type: "item", id: 2000000});
    if (i % 25 === 0) ev.push({t: t + 200, type: "use", id: 2000000, n: 1}); if (i % 60 === 0) ev.push({t: t + 300, type: "use", id: 2060000, n: 25});
    if (i % 20 === 19) ev.push(bar(t + 100, 300 + i * 4, 10));
  }
  ev.push(bar(t0 + 1795e3, 120, 11), {t: t0 + 1795e3, type: "have", items: {2000000: 41, 2060000: 1310}});
  const lines = [];
  for (const e of ev){ s.add(e); if (e.t >= t0 + 1740e3) lines.push(...f.step(s.state, e.t + 2000, feedWho())); else f.step(s.state, e.t, feedWho()) }
  dummyClearFeeds(); session = s; runT0 = t0 - 120e3; dummyOn = true;
  feedAdd([{t: t0, kind: "sep", text: "Dummy data (made up, not saved or shared)"}, ...lines]);
  $("#dummyBar").classList.remove("hidden");
  try { renderSnaps(render()) } catch (e){ $("#status").textContent = "Dummy data: " + e.message }
  requestAnimationFrame(() => { const el = $("#feed"); el.scrollTop = el.scrollHeight });   // after the boxes settled
  $("#stateText").textContent = "Dummy data"; $("#miniState").textContent = "Dummy data";
}
function dummyClearFeeds(){ $("#feed").innerHTML = ""; $("#miniFeed").innerHTML = "" }
// a fresh window is the surest way to wipe every box the dummy run filled
function dummyClear(){ if (dummyOn) location.reload() }
$("#dummyClear").onclick = dummyClear;
// Start with dummy data showing: the real run replaces it (its session, its own log)
$("#go").addEventListener("click", () => { if (!dummyOn) return; dummyOn = false; session = null; dummyClearFeeds(); $("#dummyBar").classList.add("hidden") }, true);
// View → Dummy data on/off (the menu handler in renderer-settings.js calls this)
function dummyToggle(){ dummyOn ? dummyClear() : dummyFill() }
