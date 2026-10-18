// snipping-tool style box over the frozen game picture; the box goes back as fractions of the picture
const img = document.getElementById("shot"), box = document.getElementById("box"), dim = document.getElementById("dim");
let start = null;
snip.onImage(url => { img.src = url });
// where the picture really sits on screen (object-fit: contain leaves bars on two sides)
function picRect(){
  const W = innerWidth, H = innerHeight, k = Math.min(W / img.naturalWidth, H / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k;
  return {x: (W - w) / 2, y: (H - h) / 2, w, h};
}
addEventListener("mousedown", e => { start = {x: e.clientX, y: e.clientY}; dim.style.display = "none"; Object.assign(box.style, {display: "block", left: start.x + "px", top: start.y + "px", width: "0", height: "0"}) });
addEventListener("mousemove", e => {
  if (!start) return;
  Object.assign(box.style, {left: Math.min(start.x, e.clientX) + "px", top: Math.min(start.y, e.clientY) + "px", width: Math.abs(e.clientX - start.x) + "px", height: Math.abs(e.clientY - start.y) + "px"});
});
addEventListener("mouseup", e => {
  if (!start) return;
  const p = picRect(), x0 = Math.min(start.x, e.clientX), y0 = Math.min(start.y, e.clientY), x1 = Math.max(start.x, e.clientX), y1 = Math.max(start.y, e.clientY);
  start = null;
  if (x1 - x0 < 8 || y1 - y0 < 8){ box.style.display = "none"; dim.style.display = "block"; return }   // a click, not a box: try again
  const cl = v => Math.min(1, Math.max(0, v));
  snip.done({x: cl((x0 - p.x) / p.w), y: cl((y0 - p.y) / p.h), w: cl((x1 - p.x) / p.w) - cl((x0 - p.x) / p.w), h: cl((y1 - p.y) / p.h) - cl((y0 - p.y) / p.h)});
});
addEventListener("keydown", e => { if (e.key === "Escape") snip.done(null) });
