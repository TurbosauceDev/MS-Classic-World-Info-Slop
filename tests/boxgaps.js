// Danny 10-21: nested boxes keep padding from their container on every side, stacked boxes never touch.
// A "box" is any block with a border and rounded corners (cards, table wraps, drop zones, controls). Run in the page:
// `await p.evaluate(boxGaps, [minPx, sectionId])` -> list of offenders (empty = fine). Boxes inside a scrolling area are skipped.
module.exports = function boxGaps([min, sid]){
  const sec = document.getElementById(sid); if (!sec || !sec.getClientRects().length) return [];
  const isBox = e => { if (!e.getClientRects().length || /^(BUTTON|INPUT|SELECT|TEXTAREA|IMG|CANVAS|SUMMARY|TD|TH|TR|TABLE|THEAD|TBODY|LABEL|A|SPAN|B)$/.test(e.tagName)) return false;
    const s = getComputedStyle(e);
    return !s.display.startsWith("inline") && parseFloat(s.borderTopWidth) > 0 && parseFloat(s.borderBottomWidth) > 0 && s.borderTopStyle !== "none" && parseFloat(s.borderRadius) > 0 };
  const name = e => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\s+/).join(".") : "");
  // inside a folded <details> (not its summary) nothing shows, so nothing can touch
  const folded = e => { const d = e.parentElement?.closest("details:not([open])"); return !!d && !d.querySelector(":scope > summary")?.contains(e) };
  const boxes = [...sec.querySelectorAll("*")].filter(e => isBox(e) && !folded(e)), out = [];
  for (const b of boxes){
    let a = b.parentElement, scroll = false;
    while (a && a !== sec && !isBox(a)){ const s = getComputedStyle(a); if (/auto|scroll|hidden/.test(s.overflowX + s.overflowY)) scroll = true; a = a.parentElement }
    const r = b.getBoundingClientRect();
    if (a && a !== sec && !scroll){ const q = a.getBoundingClientRect(), d = [r.left - q.left, q.right - r.right, r.top - q.top, q.bottom - r.bottom];
      if (Math.min(...d) < min) out.push(`${name(b)} in ${name(a)} (left right top bottom ${d.map(Math.round)})`) }
    for (const c of boxes){ if (c === b || c.parentElement !== b.parentElement) continue; const q = c.getBoundingClientRect();
      if (q.top > r.top + 1 && q.left < r.right - 1 && q.right > r.left + 1 && q.top - r.bottom < min) out.push(`${name(c)} touches ${name(b)} (gap ${Math.round(q.top - r.bottom)})`) }
  }
  return out;
};
