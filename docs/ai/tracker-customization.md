# Tracker customization study (ElvUI + WeakAuras) — 2026-10-28

Thread: "Make tracker customizable like ElvUI and WeakAuras" (Danny). Design/UX patterns only.

## Hard line (Danny, repeated every time)
Computer vision only. Pixels from the captured game window are the only game input. No memory reading, packet inspection,
injection, input automation, or anything that reads or touches game data. Every new data source must come from
`tracker/core/session.js` / `tracker/app/readers.js` output (frames → events) or the site's own data. Reject any idea needing more.

## Licensing (read before borrowing)
- **ElvUI is proprietary**; its repo agent-instructions file forbids AI use of repo content (training, retrieval, code generation) without the
  holder's written permission. We did NOT read its source. The ElvUI notes below are from its public look/behaviour only
  (what a user sees), and we copy no code, names, art or strings. Do not fetch ElvUI source in later threads.
- **WeakAuras2** (GPL): read only its public architecture summary. Same rule: concepts, not code.

## ElvUI — what makes it feel "clean, crisp, professional" (user-visible patterns)
1. **One flat dark style**: thin 1 px borders, tight consistent padding, one font, one accent colour; nothing decorative.
2. **Toggle Anchors (movers)**: every element has a named mover box; edit mode shows all of them at once with names, a nudge
   box (exact x/y, arrows), snap to other movers/screen, Reset one / Reset all, and a lock to leave. Already mirrored by overlay Edit mode v2 (0.2.75).
3. **Profiles**: named, copyable between characters, import/export as a string with a preview. Mirrored by `OVL1.`/`MSCS1`.
4. **Install/setup wizard** on first run (pick layout, pick theme). Tracker lacks one.
5. **Config tree with search + per-section Reset**. Our Settings popup has chips, no search, no per-section reset.
6. **Every element is individually configurable** (size, font size, alpha, text format, visibility), not a global switch.

## WeakAuras — the model for "track anything, anywhere, however"
Concepts (from its public architecture): an *aura* = **trigger(s)** (data) + **region** (display type) + **conditions**
(if data X then change style/play sound) + **actions** (on show/hide) + **animations** (start/main/finish) + **load**
rules (only when in context) + **anchoring** (any point of any frame/other display, with offsets). Auras are **grouped**
(move together) and **dynamic groups** auto-stack visible children. Everything exports as one string, with a **Modernize**
migration step so old strings keep working. Region types: icon, progress bar, texture, text; subregions (extra text, glow, border).

## Where our tracker stands (0.2.83)
| WeakAuras idea | Ours | Gap |
|---|---|---|
| Many displays, user-made | Overlay has **9 fixed widgets**, one each | cannot add a second EXP card or a custom one |
| Trigger = data source | `core/alerts.js` KINDS (13) drive alerts only | widgets are not trigger-driven; alerts and widgets are separate worlds |
| Display types | cards only | no bar, icon, big-text, compact text-line types |
| Conditions → style | none | e.g. EXP/hr card turns red under goal |
| Actions | sound/toast/flash/log exist (alerts) | fine, reuse |
| Load rules | none | show only on a map / in KPQ / while tracking |
| Groups / dynamic groups | none | cards float freely only |
| Anchoring | free x/y + snap | cannot anchor card to another card |
| Animations | flash pulse only | optional, low priority |
| Text templates | fixed text | tokens like `{exp.hr}` per widget |
| Import/export per element | whole-layout `OVL1.` only | per-widget share code + preview |
| Migration on shape change | `cleanLayout` only | add a version field to `OVL1.` before the shape grows |

## Proposed roadmap (each its own release; Danny picks order)
1. **Widget instances + display types**: `settings.overlay.widgets` becomes a list of instances `{id, type, src, x, y, s, o, ...}`;
   types: card (today's), big number, bar (progress to level / goal), text line. "Add widget" in the edit panel. Needs a version
   bump + migration of existing saves and `OVL1.` (accept old codes).
2. **Data tokens**: one registry (pure, a new core tokens module) of CV-derived values (exp/hr, mesos/hr, kills, time to level, loot value,
   respawn due, KPQ clock, price from `core/prices.js`); text templates and bars read it; alerts reuse the same registry.
3. **Conditions**: per widget, `{token, op, value, style:{color, flash, hide}}`, evaluated with the existing alerts engine pattern.
4. **Load rules**: tracking / on map / KPQ / party size.
5. **Groups**: dynamic vertical/horizontal stack with spacing; cards join a group instead of floating.
6. **Per-widget share codes** + preview (reuse `OVL1.`), then setup wizard and Settings search.

## Open questions for Danny
- Order of the above (recommend 1 → 2 → 3).
- Restyle Simple Mode as a *preset overlay layout* (so one system) or keep as a separate window? Recommend: keep the window, restyle to match overlay cards.
