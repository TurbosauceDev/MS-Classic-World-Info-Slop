// Tracker colour themes (Danny, 2026-10-18: a slightly brighter purple, a few purple variants and other colourways, and an
// editor to design, save and share your own). A theme is {name, mode: "light" | "dark", c: {token: "#rrggbb"}}; the
// default one follows Windows' light/dark setting. Tokens are the page's CSS variables (index.html :root).
(function (root){
  // token -> [CSS variable, label in the editor]
  const TOKENS = {bg: ["--bg", "Background"], panel: ["--panel", "Boxes"], ink: ["--ink", "Text"], muted: ["--muted", "Faded text"],
    line: ["--line", "Lines"], accent: ["--accent", "Accent"], soft: ["--accent-soft", "Soft accent"], on: ["--on-accent", "Text on accent"],
    leaf: ["--leaf", "Good (green)"], warn: ["--warn", "Warning"], bad: ["--bad", "Bad (red)"]};
  const T = (name, mode, s) => { const [bg, panel, ink, muted, line, accent, soft, on, leaf, warn, bad] = s.split(" ").map(x => "#" + x);
    return {name, mode, c: {bg, panel, ink, muted, line, accent, soft, on, leaf, warn, bad}} };
  // "Purple" is the 0.2.42 look a little brighter (lighter background and boxes, a livelier accent); it has a light and a dark side
  const PURPLE = {name: "Purple", mode: "system",
    light: T("Purple", "light", "f8f6fe ffffff 2b2638 6c6580 e3dcf2 8566d6 efe8ff ffffff 3f8f5a b7791f c0392b").c,
    dark: T("Purple", "dark", "1d1929 282338 f0ecf8 aba3bf 3e3651 b49bff 362d4e 1d1929 64c784 e6ad52 f2705f").c};
  // "Default" is the planner site's own colours (src/styles.css :root, light and dark; text on accent = --panel like the
  // site's buttons) so the tracker sits next to the site seamlessly (Danny, 2026-10-18)
  const DEFAULT = {name: "Default", mode: "system",
    light: T("Default", "light", "e7ddf9 f7f1ff 2a2142 685c94 cfbff0 7d58d6 dccbfa f7f1ff 3d7a5c 9a6a00 a3322b").c,
    dark: T("Default", "dark", "1f1931 2a2243 f0eafd b6aad8 453a64 d2bffb 41346a 2a2243 7cc9a2 e2b44a ef7a70").c};
  // the light presets use tinted backgrounds and boxes, not pure white (Danny: Lilac/Henesys/Perion sand were "flash bang" white)
  const PRESETS = [DEFAULT, PURPLE,
    T("Purple night", "dark", "1a1430 241c40 f3eeff b0a6cc 3a3060 c4a5ff 34295a 1a1430 6fd394 f0b95a ff7a6b"),
    T("Amethyst", "dark", "160f1f 21172e f2e9fb b39fc6 3b2a50 e08cff 3a2350 160f1f 6fcf97 f2b25c ff6f7d"),
    T("Grape soda", "dark", "120d26 1d1640 f5f2ff aaa0d8 362b6e 9d7bff 2c2263 120d26 6fd394 f0b95a ff7a6b"),
    T("Lilac", "light", "e6dff7 f2edfc 2a2140 625880 d2c6ee 7a4fe0 e9e0ff ffffff 2f8a4f a8680f c0392b"),
    T("Slime", "dark", "111a14 18241c e8f5ea 9cb5a3 2b3d30 6fdc8c 213a29 0f1a12 6fdc8c e5b45a ef6b5b"),
    T("Ellinia", "dark", "0f1a1c 162527 e4f4f2 98b6b2 26393b 4fd1c5 1d3a3b 0f1a1c 7ed37f e6b85c f07167"),
    T("Kerning neon", "dark", "0e0f17 171926 eef0ff 9ea3c2 2a2d44 ff4fd8 3a1d40 0e0f17 4fe3a1 ffc857 ff5c7a"),
    T("Midnight", "dark", "0f1420 171e2e e9eef8 9aa6bf 2a3449 6ea8ff 1f2c47 0f1420 5fcf8a e8b65a f26d6d"),
    T("Henesys", "light", "efe3d1 f8f0e4 33281c 6f5f4d dfccb2 b0560b f2dcc3 ffffff 3f8f5a a8680f c0392b"),
    T("Perion sand", "light", "e9dfcf f4ede1 3a2d22 6f5f51 d9c8b1 9c4f2b e7d5c1 ffffff 4d8b3a a8680f b8322a"),
    T("High contrast", "dark", "000000 0d0d0d ffffff d0d0d0 6a6a6a ffd400 2b2600 000000 4cff7a ffb000 ff5050")];
  const HEX = /^#[0-9a-f]{6}$/i;
  // a theme from outside (a share code, a file, settings): only a name, light/dark and the known tokens as #rrggbb survive
  function clean(t){
    if (!t || typeof t !== "object" || !t.c || typeof t.c !== "object") return null;
    const c = {};
    for (const k of Object.keys(TOKENS)){ if (!HEX.test(t.c[k] || "")) return null; c[k] = t.c[k].toLowerCase() }
    const name = String(t.name || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 30) || "My theme";
    return {name, mode: t.mode === "light" ? "light" : "dark", c};
  }
  // share code: "MSCT1." + base64 of the JSON (one line, pastes into Discord)
  const encode = t => "MSCT1." + btoa(unescape(encodeURIComponent(JSON.stringify({name: t.name, mode: t.mode, c: t.c}))));
  function decode(s){
    const m = /MSCT1\.([A-Za-z0-9+/=]{20,4000})/.exec(String(s || "").replace(/\s+/g, ""));
    if (!m) return null;
    try { return clean(JSON.parse(decodeURIComponent(escape(atob(m[1]))))) } catch { return null }
  }
  // WCAG contrast ratio of two #rrggbb colours (the editor warns under 4.5 for text)
  function contrast(a, b){
    const lum = h => { const v = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2] };
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05);
  }
  // the colours in use now: a "system" theme picks its light or dark side
  const resolve = (t, dark) => t.mode === "system" ? {name: t.name, mode: dark ? "dark" : "light", c: dark ? t.dark : t.light} : t;
  function apply(t, dark, el = root.document?.documentElement){
    const r = resolve(t, dark);
    if (el) for (const [k, [v]] of Object.entries(TOKENS)) el.style.setProperty(v, r.c[k]);
    if (el) el.style.colorScheme = r.mode;
    return r;
  }
  // setup code (layout + theme in one line, for sharing a whole setup with friends): "MSCS1." + base64 of
  // {layout: {v: 2, order: {dock}, folded, h}, theme: {preset: name} | {name, mode, c}}. Only what the window can use survives:
  // box ids from `ids` (each once), rows of 2-8 parts, columns of 2-8 boxes, widths/heights as bounded numbers, a known preset
  // or a theme clean() accepts. A code with no usable layout and no usable theme is null
  const num = (v, lo, hi) => { v = +v; return Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : undefined };
  function cleanLayout(l, ids){
    if (!l || typeof l !== "object" || !l.order || !Array.isArray(l.order.dock)) return null;
    const ok = new Set(ids), seen = new Set(), id = v => typeof v === "string" && ok.has(v) && !seen.has(v) ? (seen.add(v), v) : null, dock = [];
    for (const it of l.order.dock.slice(0, 64)){
      if (typeof it === "string"){ const b = id(it); if (b) dock.push(b); continue }
      if (!it || typeof it !== "object" || !Array.isArray(it.row)) continue;
      const row = [], w = [];
      it.row.slice(0, 8).forEach((p, i) => { let e = null;
        if (Array.isArray(p)){ const c = p.slice(0, 8).map(id).filter(Boolean); e = c.length > 1 ? c : c[0] || null } else e = id(p);
        if (e){ row.push(e); w.push(num(it.w?.[i], 1, 1e5) || 1) } });
      if (row.length > 1){ const r = {row, w}, h = num(it.h, 40, 4000); if (h) r.h = h; dock.push(r) } else if (row.length) dock.push(...[].concat(row[0]));
    }
    if (!dock.length) return null;
    const folded = (Array.isArray(l.folded) ? l.folded : []).filter(v => typeof v === "string" && ok.has(v)).slice(0, 64), h = {};
    if (l.h && typeof l.h === "object") for (const [k, v] of Object.entries(l.h)){ const n = num(v, 40, 4000); if (ok.has(k) && n) h[k] = n }
    return {v: 2, order: {dock}, folded: [...new Set(folded)], h};
  }
  function cleanSetup(x, ids){
    if (!x || typeof x !== "object") return null;
    const layout = cleanLayout(x.layout, ids), p = x.theme && typeof x.theme === "object" ? x.theme : null;
    const theme = p && typeof p.preset === "string" ? (PRESETS.some(t => t.name === p.preset) ? {preset: p.preset} : null) : clean(p);
    return layout || theme ? {layout, theme} : null;
  }
  const encodeSetup = (x, ids) => { const c = cleanSetup(x, ids); return c ? "MSCS1." + btoa(unescape(encodeURIComponent(JSON.stringify(c)))) : null };
  function decodeSetup(s, ids){
    const m = /MSCS1\.([A-Za-z0-9+/=]{20,12000})/.exec(String(s || "").replace(/\s+/g, ""));
    if (!m) return null;
    try { return cleanSetup(JSON.parse(decodeURIComponent(escape(atob(m[1])))), ids) } catch { return null }
  }
  const api = {TOKENS, PRESETS, clean, encode, decode, contrast, resolve, apply, cleanLayout, encodeSetup, decodeSetup};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.TrackerThemes = api;
})(typeof window !== "undefined" ? window : globalThis);
