// Settings › Reset (Danny 10-21: a way back to factory new). Look and layout = the keys the <head> script and 70-theme /
// 71-navside / 72-anchors / 74-profiles read; everything = all of this site's storage. A first click arms the button for
// 5 s ("Click again to ..."), the second does it and reloads without the #share part. window.RESET for tests.
const RESET = (() => {
  const LOOK = ["theme", "themec", "navmode", "pagesize", "anchors", "profile"];
  const wipe = all => { try { if (all){ localStorage.clear(); sessionStorage.clear() } else LOOK.forEach(k => localStorage.removeItem(k)) } catch (e) {}
    try { history.replaceState(null, "", location.pathname + location.search) } catch (e) {}   // drop a #share link
    location.reload() };
  const arm = (id, label, all) => { const b = $(id); if (!b) return; let t = null;
    b.addEventListener("click", () => {
      if (t){ clearTimeout(t); t = null; wipe(all); return }
      b.textContent = "Click again to " + label.toLowerCase(); b.classList.add("danger"); $("#rstmsg").textContent = "";
      t = setTimeout(() => { t = null; b.textContent = label; b.classList.remove("danger") }, 5000);
    }) };
  arm("#rstlook", "Reset look and layout", false);
  arm("#rstall", "Erase everything this site saved", true);
  return {LOOK};
})();
window.RESET = RESET;
