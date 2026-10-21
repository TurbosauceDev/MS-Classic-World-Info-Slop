// Phone tables (Danny 10-21, audit #3): a table with 4+ columns shows each row as a small card under 600px
// (styles.css "Phone tables"). Every body cell gets its column's header as data-l, shown as a label above the value.
// Long cells (> 28 letters) take two of the three grid columns. Cells are labelled whenever rows are added (lazyRows, re-sorts, filters), so pages need nothing extra.
const STACK_MIN = 4;
function stackTable(t){
  const h = t.tHead && t.tHead.rows[0], ls = [];
  if (h) for (const c of h.cells) { const l = (c.innerText || c.textContent).trim().replace(/\s*\n\s*/g, " / ");
    for (let i = 0; i < (c.colSpan || 1); i++) ls.push(l) }
  // tables with row headers (th down the side, like Craft levels) read across, so they keep their shape
  const on = ls.length >= STACK_MIN && !t.classList.contains("nostk") && !t.querySelector("tbody th");
  t.classList.toggle("stk", on); if (!on) return;
  // card title = first column that isn't a number (# or Lv first: the name heads the card, the number joins the grid)
  let k = [...h.cells].findIndex(c => !c.classList.contains("num") && c.textContent.trim() !== "#"); if (k < 0 || k > 2) k = 0;
  for (const tb of t.tBodies) for (const r of tb.rows){ let at = 0;
    for (const c of r.cells){ const n = c.colSpan || 1, l = n >= ls.length ? "" : ls[at];
      if (c.dataset.l !== l) c.dataset.l = l; c.classList.toggle("stkfull", n >= ls.length)
      c.classList.toggle("stkhead", at === k && n < ls.length)
      c.classList.toggle("stkwide", at !== k && n < ls.length && c.textContent.length > 28); at += n } }
}
{ const todo = new Set(); let raf = 0;
  const run = () => { raf = 0; for (const t of todo) if (t.isConnected) stackTable(t); todo.clear() };
  const add = n => { if (n.nodeType !== 1) return; const t = n.closest("table"); if (t) todo.add(t);
    else for (const x of n.getElementsByTagName("table")) todo.add(x) };
  new MutationObserver(ms => { for (const m of ms) add(m.target); if (todo.size && !raf) raf = requestAnimationFrame(run) })
    .observe(document.body, {childList: true, subtree: true});
  for (const t of document.getElementsByTagName("table")) stackTable(t);
}
