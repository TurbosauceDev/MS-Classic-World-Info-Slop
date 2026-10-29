// Reader worker: the screen readers run here, off the window's thread, so the tracker window never stutters while a
// frame is read. Messages from renderer.js: reset (new session: icons, potion box), area (potion box changed), frame.
importScripts("gamedata.js", "shot.js", "../core/chatlines.js", "readers.js");
let rd = null, all = null;
// every item picture (for reading the inventory window): decoded once, here, in the background (~2 s)
const allIcons = GrindReaders.loadIcons(GAMEDATA, GAMEDATA.iicons).then(l => (all = l, rd?.setInvIcons(l), l)).catch(() => null);
onmessage = ({data: m}) => {
  if (m.type === "reset"){ rd = GrindReaders.createReaders(GAMEDATA, m.icons); rd.setArea(m.area); rd.setInvHint(m.invHint); rd.setInvLast(m.invLast); GrindReaders.addGlyphs(m.glyphs); if (all) rd.setInvIcons(all); return }
  if (m.type === "area") return rd?.setArea(m.area);
  if (m.type === "invnow") return rd?.invNow();
  if (m.type === "invhint") return rd?.setInvHint(m.area);
  try {
    const out = GrindReaders.work(rd, m);
    // the frame buffer goes back to the window with the reply: it lent it out from a pool (core/bufpool.js), so the next
    // read reuses the same memory instead of allocating another 3.7-14.7 MB frame for us to throw away
    const back = m.frame?.d?.buffer ?? null;
    try { postMessage({id: m.id, ...out, back}, [...Object.values(out.crops).filter(Boolean).map(c => c.d.buffer), ...(out.chat?.items || []).map(i => i.crop.d.buffer), ...(back ? [back] : [])]) }
    catch { postMessage({id: m.id, ...out}) }   // the transfer list was refused (a crop sharing the frame's buffer): answer anyway, buffers copied instead
  } catch (err){ postMessage({id: m.id, error: err.message}) }
};
