// Skill range card, tracker-window side (Danny 11-01: "find the player's foot and overlay the range of the selected skill").
// The reader worker finds your feet (core/feetfind.js: your status bar name matched to your name tag); this file turns the
// picture's pixels into the captured frame's pixels and sends them on their own small channel (main.js adds the game
// window's spot and relays to the overlay, which draws the skill: overlay.js RENDER.range + drawRange). Screen pixels only.
// ovRangeOn / ovRangeOpt live in renderer-journal.js (load order).
let ovFeet = null, feetSentT = 0;
function rangeWant(want){ if (ovRangeOn) want.feet = {off: ovRangeOpt?.off, face: ovRangeOpt?.face || 0} }
function rangeIngest(f, t){
  if (!ovRangeOn || !f) return;
  const k = scale?.k || 1, ox = scale?.ox || 0, oy = scale?.oy || 0, fw = video?.videoWidth || 0, fh = video?.videoHeight || 0;
  let job = settings.job || ""; try { job ||= jobNow || "" } catch {}   // the card's "My job": the status bar's job (OCR), or the one set in Settings
  ovFeet = f.ok ? {ok: true, x: f.x * k + ox, y: f.y * k + oy, s: f.r * k, face: f.face, fw, fh, job, t} : {ok: false, why: f.why || "lost", face: f.face || 0, job, t};
  feetSentT = t;
  try { host.feetPush?.(ovFeet) } catch {}
}
