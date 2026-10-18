// Reader worker: the screen readers run here, off the window's thread, so the tracker window never stutters while a
// frame is read. Messages from renderer.js: reset (new session: icons, potion box), area (potion box changed), frame.
importScripts("gamedata.js", "shot.js", "readers.js");
let rd = null, all = null;
// every item picture (for reading the inventory window): decoded once, here, in the background (~2 s)
const allIcons = GrindReaders.loadIcons(GAMEDATA, GAMEDATA.iicons).then(l => (all = l, rd?.setInvIcons(l), l)).catch(() => null);
onmessage = ({data: m}) => {
  if (m.type === "reset"){ rd = GrindReaders.createReaders(GAMEDATA, m.icons); rd.setArea(m.area); rd.setInvHint(m.invHint); if (all) rd.setInvIcons(all); return }
  if (m.type === "area") return rd?.setArea(m.area);
  if (m.type === "invnow") return rd?.invNow();
  if (m.type === "invhint") return rd?.setInvHint(m.area);
  try {
    const out = GrindReaders.work(rd, m);
    postMessage({id: m.id, ...out}, Object.values(out.crops).filter(Boolean).map(c => c.d.buffer));
  } catch (err){ postMessage({id: m.id, error: err.message}) }
};
