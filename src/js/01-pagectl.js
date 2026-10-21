/* Same Reset filters + Copy link pair at the right end of every list page's filter row (audit 10-21: some pages had one,
   some the other, some neither). Defaults are read here, before the page scripts restore saved state, so Reset goes back
   to the page's own starting values. A list link is #L={p: page, v: {id: value}} with only the changed fields;
   76-pagectl.js applies it once the pages are drawn. Pages that already had one of the buttons keep their own handler. */
const PAGECTL = {items: ["itreset", null], mobs: ["mbreset", null], skills: ["skreset", null], quests: [null, "qshare"],
  keep: [null, null], wmap: [null, null], maps: [null, "tshare"], snipe: ["snreset", "snshare"]};
const ctlFields = p => [...document.querySelectorAll(`#${p} .controls`)].filter(c => !c.closest("details,.modal") && (h => !h || h.tagName === "SECTION")(c.closest("[hidden]")))
  .flatMap(c => [...c.querySelectorAll("input[id],select[id],button.tgl[id]")]).filter(e => e.type !== "file");
const CTLDEF = {};
for (const p of Object.keys(PAGECTL)) CTLDEF[p] = Object.fromEntries(ctlFields(p).map(e => [e.id,
  e.tagName === "BUTTON" ? e.getAttribute("aria-pressed") === "true" : e.type === "checkbox" ? e.defaultChecked
  : e.tagName === "SELECT" ? ([...e.options].find(o => o.defaultSelected) || e.options[0])?.value ?? "" : e.defaultValue]));
const ctlGet = e => e.tagName === "BUTTON" ? e.getAttribute("aria-pressed") === "true" : e.type === "checkbox" ? e.checked : e.value;
// set one field the way a person would, so the page's own listeners redraw it
const ctlSet = (e, v) => { if (ctlGet(e) === v) return;
  if (e.tagName === "BUTTON") return e.click();
  if (e.type === "checkbox") e.checked = !!v;
  else if (e.tagName === "SELECT"){ if (![...e.options].some(o => o.value === String(v))) return; e.value = v }
  else e.value = String(v).slice(0, 80);
  e.dispatchEvent(new Event("input", {bubbles: true})); e.dispatchEvent(new Event("change", {bubbles: true})) };
const ctlReset = p => { for (const e of ctlFields(p)) if (Object.hasOwn(CTLDEF[p], e.id)) ctlSet(e, CTLDEF[p][e.id]) };
const ctlState = p => Object.fromEntries(ctlFields(p).filter(e => Object.hasOwn(CTLDEF[p], e.id) && ctlGet(e) !== CTLDEF[p][e.id]).map(e => [e.id, ctlGet(e)]));
