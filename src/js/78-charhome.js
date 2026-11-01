/* ---------------- Character Builder section home (#char) ---------------- */
// Name, class and level (the calculator's own controls, kept in step), screenshot paste (52-shotimport.js SHOTS.handle) and a
// posable preview: maplestory.io character endpoint, pose + frame in the URL, same gear ids the calculator's picture uses.
(() => {
const KEY = "charname", ok = f => { try { return f() } catch { return null } };
$("#chname").value = ok(() => localStorage.getItem(KEY)) || "";
$("#chname").addEventListener("input", () => { const v = $("#chname").value.replace(/[^\w ]/g, "").slice(0, 12); ok(() => localStorage.setItem(KEY, v)); sum() });
/* class + level mirror the calculator (BLD.S); changing them here clicks its controls so Undo, saving and sharing still work */
function sum(){
  const s = BLD.S, n = $("#chname").value.trim();
  document.querySelectorAll("#chclass button").forEach(b => b.setAttribute("aria-checked", b.dataset.v === s.cls));
  $("#chlvl").value = s.lvl; $("#chlvlout").textContent = s.lvl;
  $("#chsum").textContent = `${n ? n + " · " : ""}Level ${s.lvl} ${s.branch || s.cls}`;
  $("#chgender").value = s.gender || "";
}
$("#chclass").addEventListener("click", e => { const b = e.target.closest("button"); if (b) $(`#pclass button[data-v="${b.dataset.v}"]`).click() });
$("#chlvl").addEventListener("input", () => { const r = $("#plvl"); r.value = $("#chlvl").value; r.dispatchEvent(new Event("input", {bubbles: true})) });
$("#chgender").addEventListener("change", () => { const g = $("#pgender"); g.value = $("#chgender").value; g.dispatchEvent(new Event("change", {bubbles: true})) });
BLD.onRender(sum); sum();

/* screenshots */
async function shots(files){
  $("#chst").textContent = "Reading…";
  try { await SHOTS.handle(files) } catch(e){ console.error(e) }
  $("#chst").textContent = ($("#pimpst")?.textContent || "").trim() + " Open the calculator to see the result.";
}
$("#chfile").addEventListener("change", e => { shots(e.target.files); e.target.value = "" });
const drop = $("#chdrop");
drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over") });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); shots(e.dataTransfer.files) });
document.addEventListener("paste", e => { if ($("#char").hidden) return; const f = [...(e.clipboardData?.files || [])]; if (f.length){ e.preventDefault(); shots(f) } });

/* preview */
const img = $("#chav"), stage = $("#chstage"), POSE = {stand: "stand1", walk1: "walk1", jump: "jump", alert: "alert", prone: "prone"};
let pose = "stand", frame = 0, playing = true, flip = false, timer = 0, ids = "", two = false;
const idsNow = () => { const m = /character\/2000\/([\d,]+)\/(stand\d)/.exec($("#pavatar")?.dataset.src || ""); two = m?.[2] === "stand2"; return m ? m[1] : "20000,30000" };
const anim = () => { const a = POSE[pose]; return two && (a === "stand1" || a === "walk1") ? a.replace("1", "2") : a };
// maplestory.io wraps the frame number by the pose's frame count (checked 11-01: stand 3, walk 4, alert 3, jump 1, prone 1), so the
// counts are fixed here; each frame is preloaded so the picture never blanks between frames
const FRAMES = {stand1: 3, stand2: 3, walk1: 4, walk2: 4, alert: 3, jump: 1, prone: 1};
let seq = 0;
function draw(){
  ids = idsNow(); const key = anim(), src = `https://maplestory.io/api/MCW/CBT2/character/2000/${ids}/${key}/${frame}`, mine = ++seq, t = new Image();
  t.onload = () => { if (mine !== seq) return; img.src = src; img.hidden = false; $("#chavnote").textContent = "Drawn live by maplestory.io from Classic World client data." };
  t.onerror = () => { if (mine !== seq) return; img.hidden = true; $("#chavnote").textContent = "The preview couldn't load (maplestory.io is blocked or offline)." };
  t.src = src;
}
function tick(){
  clearInterval(timer); const key = anim();
  timer = setInterval(() => { if ($("#char").hidden || !playing || FRAMES[key] === 1) return; frame = (frame + 1) % FRAMES[key]; draw() }, pose === "walk1" ? 180 : 320);
}
function setPose(p){ pose = p; frame = 0; document.querySelectorAll("#chpose button").forEach(b => b.setAttribute("aria-checked", b.dataset.p === p)); draw(); tick() }
$("#chpose").addEventListener("click", e => { const b = e.target.closest("button"); if (b) setPose(b.dataset.p) });
$("#chplay").addEventListener("click", () => { playing = !playing; $("#chplay").textContent = playing ? "Pause" : "Play"; $("#chplay").setAttribute("aria-pressed", playing) });
const setFlip = f => { flip = f; img.style.transform = f ? "scaleX(-1)" : ""; $("#chflip").textContent = f ? "Face left" : "Face right" };
$("#chflip").addEventListener("click", () => setFlip(!flip));
stage.addEventListener("click", () => stage.focus());
stage.addEventListener("keydown", e => { const k = {ArrowLeft: () => { setFlip(false); setPose("walk1") }, ArrowRight: () => { setFlip(true); setPose("walk1") },
  ArrowUp: () => setPose("jump"), " ": () => setPose("jump"), ArrowDown: () => setPose("prone")}[e.key]; if (k){ e.preventDefault(); k() } });
stage.addEventListener("keyup", e => { if (e.key.startsWith("Arrow") || e.key === " ") setPose("stand") });
// the calculator's picture is the source of the gear ids, so redraw when it changes and when this page opens
BLD.onRender(() => { if (!$("#char").hidden && idsNow() !== ids) draw() });
const open = () => { sum(); setPose(pose) };
const when = () => document.readyState === "complete" ? open() : addEventListener("load", open, {once: true});
$("#t-char").addEventListener("click", when);
if (!$("#char").hidden) when();
})();
