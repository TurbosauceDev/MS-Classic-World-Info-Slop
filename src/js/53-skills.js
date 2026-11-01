/* ---------------- skill database ---------------- */
let openSkillPage;   // (key "job|id"): open that skill's page (used by Search everything)
(() => {
// every 1st and 2nd job skill in the launch game files (D.skills: job -> skills, D.icons: id -> png). Clicking a skill opens
// its page: description, every level's effect, what it needs and what it unlocks.
const CLASS = {Warrior: ["Warrior", 1], Fighter: ["Warrior", 2], Page: ["Warrior", 2], Spearman: ["Warrior", 2],
  Magician: ["Magician", 1], "F/P Wizard": ["Magician", 2], "I/L Wizard": ["Magician", 2], Cleric: ["Magician", 2],
  Archer: ["Bowman", 1], Hunter: ["Bowman", 2], Crossbowman: ["Bowman", 2], Rogue: ["Thief", 1], Assassin: ["Thief", 2], Bandit: ["Thief", 2]};
// our label from the game files' skill kind; Slow/Threaten are "attack" there but deal no damage
const typeOf = s => { const top = s.st[s.st.length - 1] || "";
  if (s.k === "passive" || (!s.k && !/MP -/.test(top))) return "Passive";
  if (!s.k || s.k === "self_buff") return "Buff";
  if (s.k === "party_support") return "Party buff";
  if (s.k === "mobility") return "Movement";
  return s.k === "attack" && !/damage|Basic Attack|Attack \d+x/i.test(top) ? "Debuff" : "Attack" };
const TYPEPILL = {Attack: "p-bad", Buff: "p-good", "Party buff": "p-good", Passive: "p-hot", Debuff: "p-warn", Movement: "p-warn"};
const K = [];
for (const [job, list] of Object.entries(D.skills)) for (const s of list){ const [cls, tier] = CLASS[job] || [job, 0];
  K.push({key: job + "|" + s.id, job, cls, tier, s, type: typeOf(s), hay: [s.n, job, cls, s.d, ...s.st].join("|").toLowerCase()}) }
const OPEN = {}; for (const o of K) OPEN[o.key] = o;
const NEEDED = {}; for (const o of K) for (const [n] of o.s.req){ const r = K.find(x => x.job === o.job && x.s.n === n) || K.find(x => x.cls === o.cls && x.tier === 1 && x.s.n === n);
  if (r) (NEEDED[r.key] = NEEDED[r.key] || []).push(o) }
const reqOf = o => o.s.req.map(([n, lv]) => [K.find(x => x.job === o.job && x.s.n === n) || K.find(x => x.cls === o.cls && x.tier === 1 && x.s.n === n), n, lv]);
$("#skjob").innerHTML += Object.keys(D.skills).map(j => `<option>${esc(j)}</option>`).join("");
$("#sktype").innerHTML += [...new Set(K.map(o => o.type))].sort().map(t => `<option>${t}</option>`).join("");

const DEF = {q: "", cls: "", job: "", tier: "", type: "", sort: "job", dir: 1};
let S = {...DEF, open: null};
try { Object.assign(S, savedState("skills", S), {q: "", open: null}) } catch(e) {}
const save = () => { try { localStorage.setItem("skills", JSON.stringify(S)) } catch(e) {} };
const FIELDS = [["cls", "#skcls"], ["job", "#skjob"], ["tier", "#sktier"], ["type", "#sktype"]];
const sync = () => { $("#sksearch").value = S.q; for (const [k, el] of FIELDS) $(el).value = S[k] };
sync();

const icon = (o, big) => D.icons[o.s.id] ? `<img${big ? ' class="sprite"' : ""} src="data:image/png;base64,${D.icons[o.s.id]}" alt="">` : "<i></i>";
const link = o => `<button class="linkbtn" data-skopen="${esc(o.key)}">${esc(o.s.n)}</button>`;
const pill = o => `<span class="pill ${TYPEPILL[o.type] || "p-hot"}">${o.type}</span>`;
const tierTxt = o => o.tier === 1 ? "1st job" : o.tier === 2 ? "2nd job (Lv 30+)" : "";

// ---- range and hitbox (D.skills[..].rv + D.hitact, both from the OSMS export; see scripts/skill_range.py) ----
// Game pixels, facing right: x > 0 in front of you, y < 0 above your feet. skRange() is pure (tests/golden.js checks it).
const atLv = (v, lv) => Array.isArray(v) ? v[Math.min(v.length, Math.max(1, lv)) - 1] : v;
const FAM = {fixed_rectangle: "Stored attack rectangle", effect_rectangle: "Stored party-effect rectangle", ranged_corridor: "Widening ranged corridor",
  action_hitbox: "Weapon swing area", action_extended: "Weapon swing area + forward extension", piercing_line: "Piercing arrow path", teleport_range: "Teleport distance"};
// One row per weapon type AND swing family: the box belongs to the item (items.json after_image), so a Gladius (short swing)
// reaches less than a Sword (long swing). H.sk = the client's weapon codes per skill (Final Attack: Sword = swords only).
const skWeapons = (job, id) => { const H = D.hitact; if (!H) return [];
  const keys = H.sk[String(id)] || H.cls[job] || [], only = H.anim[String(id)];
  return H.weap.filter(w => keys.includes(w[4])).map(([key, label, set, acts, base, v, items]) => {
    const box = Object.fromEntries((H.sets[set] || []).map(a => [a[0], a]));
    return {key, label, base, v, items, acts: acts.filter(a => box[a] && (!only || only.includes(a))).map(a => box[a])} }).filter(w => w.acts.length) };
function skRange(job, s, lv, plv, wk, ak){
  const v = s.rv; if (!v) return null;
  lv = Math.min(s.max, Math.max(1, lv || s.max));
  const out = {fam: v.f, label: FAM[v.f] || "Target area", boxes: [], ext: null, poly: null, path: null, tp: null, aim: null, mob: null, facts: []};
  const box = (l, r, t, b) => ({l, r, t, b});
  if (v.L){ const g = [...v.L].reverse().find(x => x[0] <= lv) || v.L[0]; out.from = g[0]; out.boxes = g[1].map(b => box(...b)) }
  let far = null;
  if (v.b){ far = atLv(v.b[0], lv) + (v.p && plv > 0 ? atLv(v.p[2], plv) : 0); out.far = far }
  if (v.f === "ranged_corridor" && v.g){
    const [near, refY, bh, div] = v.g, nh = bh + Math.trunc(near / div), fh = bh + Math.trunc(far / div);
    out.poly = [[near, -nh], [far, -fh], [far, fh], [near, nh]]; out.aim = [near, refY, far]; out.mob = Math.round(far * .73);
    out.facts.push(["Reach", `${far} px in front`], ["Starts", `${near} px ahead`], ["Height at the far end", `${fh} px above and below your feet`]);
  } else if (v.f === "piercing_line"){
    out.boxes = [box(65, far, -72, 0)]; out.path = [23, -30, far];
    out.facts.push(["Path", `${far} px in front`]);
  } else if (v.f === "action_hitbox" || v.f === "action_extended"){
    const W = skWeapons(job, s.id), w = W.find(x => x.key === wk) || W[0];
    if (w){ const a = w.acts.find(x => x[0] === ak) || w.acts[0]; out.weapons = W; out.wk = w.key; out.base = w.base; out.ak = a[0];
      out.boxes = [box(a[1], a[2], a[3], a[4])];
      out.facts.push(["Swing box", `${a[1]} to ${a[2]} px in front`], ["Height", vert(a[3], a[4])]);
      if (w.v){ const n = w.items.map(i => D.items?.[i]?.n).filter(Boolean);
        out.facts.push([`${w.v} weapons`, esc(n.slice(0, 4).join(", ")) + (n.length > 4 ? ` +${n.length - 4} more` : "")]) }
      if (v.f === "action_extended"){ const lim = Math.max(a[2], atLv(v.r, lv) || 0); out.ext = box(a[2], lim, a[3], a[4]);
        out.facts.push(["Forward limit", `${lim} px (${lim - a[2]} px past the swing)`]) }
      out.mob = (out.ext ? out.ext.r : a[2]) + 10 }
  } else if (v.f === "teleport_range"){ out.tp = atLv(v.d, lv); out.facts.push(["Distance", `up to ${out.tp} px`]) }
  // Explosion around the first target (client: the hidden follow-up skill's lt/rb, e.g. Arrow Bomb 3101005; meowdb agrees).
  // Anchored on the target's feet, like its position; which point the client centres it on is unconfirmed.
  const X = D.hitact?.ex?.[String(s.id)];
  if (X && out.mob != null){ const [l, r, t, b] = ([...X.L].reverse().find(x => x[0] <= lv) || X.L[0])[1][0];
    out.blast = box(out.mob + l, out.mob + r, t, b);
    out.facts.push(["Explosion", `${r - l} × ${b - t} px around the first target, up to ${atLv(s.mob, lv)} monsters`]) }
  if (out.boxes.length && !out.facts.length){ const b = out.boxes[0];
    out.facts.push(["In front", `${Math.max(0, b.r)} px`], ...(b.l ? [[b.l < 0 ? "Behind" : "Starts", `${Math.abs(b.l)} px${b.l < 0 ? "" : " in front"}`]] : []),
      ["Height", vert(b.t, b.b)]);
    if (out.mob == null) out.mob = b.l < 0 && b.r > 0 ? Math.max(60, b.r * .62) : (b.l + b.r) / 2 }
  if (v.f === "fixed_rectangle" && v.r != null) out.facts.push(["Stored range value", `${atLv(v.r, lv)} px (not the hit box)`]);
  if (v.t) out.facts.push(["Walls", "Needs a clear line to the target"]);
  out.lv = lv; out.plv = plv; return out;
}
// "56 px (6 to 62 px above your feet)" / "140 px (70 above to 70 below your feet)"
function vert(top, bot){ const h = bot - top;
  return bot <= 0 ? `${h} px (${-bot} to ${-top} px above your feet)` : top >= 0 ? `${h} px (${top} to ${bot} px below your feet)` : `${h} px (${-top} above to ${bot} below your feet)` }
const ACTNAME = a => { const m = /^(swing|stab)([OTP])(\d|F)$/.exec(a); return m ? `${{O: "1H", T: "2H", P: "Polearm"}[m[2]]} ${m[1]} ${m[3]}` : a };
const SKR = {lv: 0, plv: 0, wk: "", ak: "", key: ""};
const pngSize = b64 => { try { const s = atob(b64.slice(0, 32)); return [s.charCodeAt(18) * 256 + s.charCodeAt(19), s.charCodeAt(22) * 256 + s.charCodeAt(23)] } catch(e) { return [37, 26] } };
// Preview animation (plays on open, weapon/swing change and Replay, then repeats after a pause: skrLoop; sliders redraw still). With D.skanim (Classic client
// frames from maplestory.io MCW, scripts/fetch_skill_anim.py) the character really swings/shoots/casts and the skill's own
// effect, projectile and hit frames play at their client delays; without it (Pages: until the lazy assets arrive) only the
// area, a dot shot and the target flash move. Release = start of the action's last frame and the projectile speed are for
// show, not game data. CSS: .skr-play rules in styles.css; reduced motion shows the still diagram.
const SKR_SPEED = .9;   // projectile px per ms in the preview (for show; the client's speed isn't in our data)
const durOf = fr => fr.reduce((a, f) => a + f[3], 0);
// Attack time (meowdb attack speed guide, COT2 frames; SPEED_MS in 50-builder.js): ordinary swings/stabs/shots take the ladder
// time for the weapon's speed tier (crossbow and spear/polearm stab have their own columns); other actions (Rush, Savage Blow,
// alert2 buffs) scale their client frame delays by (10 + tier) / 16, rounded up to 30 ms (fits meowdb's Rush 360/450, Savage
// 780/840, Heal 600). Spells always use tier 6. The preview's weapon is the item fetch_skill_anim.py draws (A.wid).
let SKR_WT;
const skrTier = w => { if (/^wand/.test(w)) return 6; SKR_WT = SKR_WT || Object.fromEntries(D.weapons.map(x => [x[12], x[9]]));
  return +(SKR_WT[String(D.skanim.wid[w])] ?? 6) };
const skrTime = (an, raw, t) => { const S = window.SPEED_MS; t = Math.max(0, Math.min(10, t));
  if (S && /^(swing|stab|shoot)/.test(an)) return S[t][an === "shoot2" ? 2 : /^stabT/.test(an) ? 1 : 0];
  return 30 * Math.ceil(durOf(raw) * (10 + t) / 16 / 30) };
// Projectiles per use: Double Shot's 2nd arrow leaves 100 ms after the 1st (client Skill/300.img 3001002 common/ballDelay);
// Lucky Seven's 2nd star gap isn't in the client data: 100 ms is a guess (in-game test list, docs/notes.md).
const SKR_BALLS = {"3001002": [0, 100], "4001003": [0, 100]};
// Mid-jump use (meowdb "Attacks You Can Use Mid-Jump", all COT2 active skills checked, 2026-10-23): only these start in the air.
const SKR_AIR = new Set(["Power Strike", "Slash Blast", "Threaten", "Heal", "Power Knockback", "Lucky Seven", "Double Stab", "Disorder", "Drain", "Savage Blow", "Steal"]);
// Sprite timeline for one preview: what the player draws, and when the area/hit CSS should fire. Pure (tests/golden.js).
function skrSprites(r, id){
  const A = D.skanim, k = A?.sk?.[String(id)]; if (!k) return null;
  const w = r.wk || k.w, two = ["2h-sword", "2h-axe", "2h-blunt", "spear", "polearm"].includes(w.split(":")[0]);
  const an = k.a || r.ak || "", raw = A.act[`${w}|${an}`] || null, tier = skrTier(w), cd = raw ? skrTime(an, raw, tier) : 0;
  const act = raw && raw.map(f => [f[0], f[1], f[2], Math.round(f[3] * cd / durOf(raw)), f[4], f[5]]), idle = (A.act[`${w}|${two ? "stand2" : "stand1"}`] || [])[0] || null;
  const rel = act && act.length > 1 ? durOf(act.slice(0, -1)) : act ? 0 : 120;
  const shot = r.poly || r.path, ball = shot ? (k.b.length ? k.b : A.ammo?.[w] || []) : [];
  const from = r.path ? r.path[0] : r.aim ? r.aim[0] : 0, y = (r.path || r.aim || [0, -30])[1];
  const to = r.path ? r.path[2] : r.mob ?? from, travel = ball.length ? Math.round(Math.max(0, to - from) / SKR_SPEED) : 0;
  const mobX = r.path ? [.3, .6, .86].map(f => Math.round(65 + (r.far - 65) * f)) : r.mob != null && r.fam !== "effect_rectangle" ? [r.mob] : [];
  const hits = mobX.map(x => rel + (ball.length ? Math.round(Math.max(0, x - from) / SKR_SPEED) : 0));
  const balls = shot && ball.length ? SKR_BALLS[String(id)] || [0] : [0];
  const end = Math.max(act ? durOf(act) : 0, durOf(k.e), ball.length ? rel + travel + balls[balls.length - 1] : 0, ...hits.map(t => t + durOf(k.h.length ? k.h : k.x || []))) + 450;
  return {w, tier, cd, balls, act, idle, eff: k.e, hit: k.h.length ? k.h : k.x || [], ball, rel, travel, from, to, y, mobX, hits, end} }
const skrAnim = r => { const a = {lunge: 0, area: 120, hits: []};
  if (r.poly || r.path){ const from = r.path ? r.path[0] : r.aim[0], to = r.path ? r.path[2] : r.mob, dur = Math.round(Math.min(560, Math.max(260, (to - from) * 1.1)));
    a.shot = {from, y: (r.path || r.aim)[1], dx: to - from, at: 300, dur};
    a.hits = r.path ? [.3, .6, .86].map(f => Math.round(a.shot.at + dur * (Math.round(65 + (r.far - 65) * f) - from) / (to - from))) : [a.shot.at + dur] }
  else if (r.tp) a.tp = {at: 160}; else if (r.mob != null && r.fam !== "effect_rectangle") a.hits = [r.ext ? 560 : 320];
  return a };
// Playable preview (Danny 11-01): the player (SKP) walks, jumps and turns; the hit area moves with them. skrHits says which drawn
// Stumps the attack reaches from there and when each is hit (pl = {x, y: jump height, dir: 1 right / -1 left}). Pure
// (tests/golden.js): at the start spot it gives the same hits as the plain preview.
function skrHits(r, SP, pl, mw = 46, mh = 46){
  const mobX = SP ? SP.mobX : r.path ? [.3, .6, .86].map(f => Math.round(65 + (r.far - 65) * f)) : r.mob != null && r.fam !== "effect_rectangle" ? [r.mob] : [];
  const A = SP ? null : skrAnim(r), xs = [], ys = [];
  for (const b of [...r.boxes, r.ext].filter(Boolean)){ xs.push(b.l, b.r); ys.push(b.t, b.b) }
  if (r.poly) for (const [x, y] of r.poly){ xs.push(x); ys.push(y) }
  if (!xs.length && r.mob != null){ xs.push(0, r.mob); ys.push(-60, 0) }
  const ax0 = Math.min(...xs), ax1 = Math.max(...xs), ay0 = Math.min(...ys), ay1 = Math.max(...ys);
  return mobX.map((m, i) => { const c = (m - pl.x) * pl.dir;   // Stump centre in the attack's own frame (facing right)
    if (!xs.length || c + mw / 2 < ax0 || c - mw / 2 > ax1 || pl.y - mh > ay1 || pl.y < ay0) return null;
    if (SP) return SP.rel + (SP.ball.length ? Math.round(Math.max(0, c - SP.from) / SKR_SPEED) : 0);
    return A.shot ? Math.round(A.shot.at + A.shot.dur * Math.max(0, c - A.shot.from) / A.shot.dx) : A.hits[i] ?? 320 }) }
const SKP = {x: 0, y: 0, dir: 1, vy: 0, vx: 0, keys: new Set(), pad: null, ctl: 0, busy: 0, raf: 0, lt: 0, focus: false};
const skpReset = () => Object.assign(SKP, {x: 0, y: 0, dir: 1, vy: 0, vx: 0, busy: 0});
const skpXf = () => `translate(${SKP.x} ${-SKP.y})${SKP.dir < 0 ? " scale(-1 1)" : ""}`;
const skImg = f => "data:image/webp;base64," + f[0];
const skImgW = f => f[4], skImgH = f => f[5];
function rangeSvg(r, play, id){
  const SP = skrSprites(r, id), xs = [-45, 90], ys = [-90, 30], P = [], A = SP ? {lunge: 0, area: SP.rel, tp: r.tp ? {at: 160} : null} : skrAnim(r), st = o => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(";");
  for (const b of [...r.boxes, r.ext, r.blast].filter(Boolean)){ xs.push(b.l, b.r); ys.push(b.t, b.b) }
  if (r.poly) for (const [x, y] of r.poly){ xs.push(x); ys.push(y) }
  if (r.tp) xs.push(r.tp + 20);
  if (r.mob != null) xs.push(r.mob + 34);
  if (SP) for (const f of SP.eff){ xs.push(-(skImgW(f) - f[1]), f[1]); ys.push(-f[2], skImgH(f) - f[2]) }
  if (SP && SP.mobX.length) for (const f of SP.hit) ys.push(Math.max(-170, -23 - f[2]));   // tall hits (Thunder Bolt) capped
  const x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 40, y0 = Math.min(...ys) - 26, y1 = Math.max(...ys) + 22, w = x1 - x0, h = y1 - y0;
  const fs = Math.max(10, Math.round(w / 48)), T = (x, y, t, c = "") => `<text x="${x}" y="${y}" class="skr-t ${c}" font-size="${fs}">${t}</text>`;
  P.push(`<defs><pattern id="skrgrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" class="skr-grid"/></pattern></defs>`,
    `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="url(#skrgrid)"/>`, `<line x1="${x0}" y1="0" x2="${x1}" y2="0" class="skr-ground"/>`);
  const mob = D.mobimg?.["6"];   // Stump, as a size reference
  { const [mw, mh] = mob ? pngSize(mob) : [46, 46]; A.hits = skrHits(r, SP, SKP, mw, mh) }
  let hit = 0;
  const mobAt = x => { const [mw, mh] = mob ? pngSize(mob) : [46, 46], at = A.hits[hit++];
    return `<g class="skr-target"${at != null ? ` style="--dl:${at}ms"` : ""}>` + (mob ? `<image href="data:image/png;base64,${mob}" x="${x - mw / 2}" y="${-mh}" width="${mw}" height="${mh}" class="skr-spr"/>` : "")
      + `<rect x="${x - mw / 2}" y="${-mh}" width="${mw}" height="${mh}" class="skr-mob"/></g>` };
  if (r.path) for (const f of [.3, .6, .86]) P.push(mobAt(Math.round(65 + (r.far - 65) * f)));
  else if (r.mob != null && r.fam !== "effect_rectangle") P.push(mobAt(r.mob));
  // Explosion: stays on the first target (outside the player group); only when the attack reaches it.
  if (r.blast && A.hits[0] != null){ const b = r.blast; P.push(`<g class="skr-area skr-fade" style="--dl:${A.hits[0]}ms"><rect x="${b.l}" y="${b.t}" width="${b.r - b.l}" height="${b.b - b.t}" class="skr-hit skr-ext"/></g>`) }
  P.push(`<g class="skr-pl" transform="${skpXf()}">`);
  // Area: corridor widens out from where it starts, stored boxes grow from your feet, swing boxes fade in, the extension slides forward.
  const grow = (ox, sy) => `class="skr-area" style="${st({"--dl": A.area + "ms", "--ox": ox + "px", "--sy": sy})}"`;
  if (r.poly) P.push(`<g ${grow(r.poly[0][0], 1)}><polygon points="${r.poly.map(p => p.join(",")).join(" ")}" class="skr-hit"/></g>`);
  const swing = r.fam.startsWith("action"), boxes = r.boxes.map(b => `<rect x="${b.l}" y="${b.t}" width="${Math.max(1, b.r - b.l)}" height="${Math.max(1, b.b - b.t)}" class="skr-hit"/>`).join("");
  if (boxes) P.push(r.path ? `<g ${grow(65, 1)}>${boxes}</g>` : swing ? `<g class="skr-area skr-fade" style="--dl:${A.area}ms">${boxes}</g>` : `<g ${grow(0, .15)}>${boxes}</g>`);
  if (r.ext && r.ext.r > r.ext.l) P.push(`<g class="skr-area" style="${st({"--dl": "330ms", "--ox": r.ext.l + "px", "--sy": 1})}"><rect x="${r.ext.l}" y="${r.ext.t}" width="${r.ext.r - r.ext.l}" height="${r.ext.b - r.ext.t}" class="skr-hit skr-ext"/></g>`);
  if (r.aim) P.push(`<line x1="${r.aim[0]}" y1="${r.aim[1]}" x2="${r.aim[2]}" y2="${r.aim[1]}" class="skr-aim"/>`);
  if (r.path) P.push(`<line x1="${r.path[0]}" y1="${r.path[1]}" x2="${r.path[2]}" y2="${r.path[1]}" class="skr-aim"/>`);
  if (A.shot && !SP) P.push(`<g class="skr-shot" style="${st({"--dl": A.shot.at + "ms", "--du": A.shot.dur + "ms", "--dx": A.shot.dx + "px"})}"><line x1="${A.shot.from - 12}" y1="${A.shot.y}" x2="${A.shot.from + 4}" y2="${A.shot.y}"/><circle cx="${A.shot.from + 4}" cy="${A.shot.y}" r="2.5"/></g>`);
  // You: OSMS's standing character (faces left in the file, mirrored like OSMS addCharacter), outline box as a fallback.
  const ch = D.hitact?.char, you = (x, cls) => ch ? `<image href="data:image/png;base64,${ch}" x="${x - 23}" y="-66" width="39" height="66" transform="translate(${2 * x - 7} 0) scale(-1 1)" class="${cls}"/>`
    : `<rect x="${x - 20}" y="-66" width="39" height="66" rx="6" class="skr-you ${cls}"/>`;
  // Client frames face left; each layer is mirrored around its anchor so the scene faces right like the diagram.
  const spr = (f, cls) => f ? `<g class="${cls}"><g transform="scale(-1 1)"><image href="${skImg(f)}" x="${-f[1]}" y="${-f[2]}" width="${skImgW(f)}" height="${skImgH(f)}" class="skr-spr"/></g></g>` : "";
  const me = SP && (SP.idle || SP.act?.[0]) ? spr(SP.idle || SP.act[0], "skr-me-spr") : you(0, "skr-me");
  if (r.tp) P.push(`<g class="skr-tpto" style="--dl:${A.tp.at}ms;--dx:${-r.tp}px">${SP && SP.idle ? `<g transform="translate(${r.tp} 0)" class="skr-ghost">${spr(SP.idle, "skr-ghost-spr")}</g>` : you(r.tp, "skr-ghost")}</g><line x1="24" y1="-80" x2="${r.tp - 4}" y2="-80" class="skr-aim"/>`);
  P.push(`<g class="skr-actor${r.tp ? " skr-tpfrom" : ""}" style="--dl:${r.tp ? A.tp.at : A.lunge}ms">${me}</g>`);
  if (SP) P.push(`<g class="skr-fx" data-l="e"></g>`);
  P.push(`<circle cx="0" cy="0" r="3" class="skr-origin"/></g><g class="skr-plt" transform="translate(${SKP.x} ${-SKP.y})">${T(0, -72, "you", "skr-mid")}</g>`);
  if (SP) P.push(SP.balls.map(() => `<g class="skr-fx" data-l="b"></g>`).join("") + SP.mobX.map((x, i) => `<g class="skr-fx" data-l="h" data-i="${i}"></g>`).join(""));
  const right = r.ext?.r ?? r.poly?.[1][0] ?? r.boxes[0]?.r ?? r.tp;
  if (right != null) P.push(`<line x1="${right}" y1="${y1 - 14}" x2="${right}" y2="${y0 + 4}" class="skr-dim"/>`, T(right, y1 - 4, right + " px", "skr-mid"));
  return `<svg class="skr-svg${play ? " skr-play" : ""}${SP ? " skr-sp" : ""}" viewBox="${x0} ${y0} ${w} ${h}" tabindex="0" data-skrstage role="application" aria-roledescription="playable preview" aria-label="${esc(r.label)}: measured from your feet, facing right. Focused: A/D or arrows walk, W, up or Space jumps, Ctrl, 1, 4, 6 or click uses the skill.">${P.join("")}</svg>`;
}
const skpPose = (me, f) => { if (!me || !f || me.__f === f) return; me.__f = f;
  me.setAttribute("href", skImg(f)); me.setAttribute("x", -f[1]); me.setAttribute("y", -f[2]); me.setAttribute("width", f[4]); me.setAttribute("height", f[5]) };
// Flipbook player for the sprite layers (one at a time; stops when its svg is replaced). Reduced motion: never starts.
let skrRaf = 0;
function skrPlay(svg, r, id, hits, pl = {x: 0, y: 0, dir: 1}){
  cancelAnimationFrame(skrRaf); const SP = skrSprites(r, id); hits = hits || SP?.hits;
  if (!SP || !svg || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const L = (q, i) => svg.querySelector(`.skr-fx[data-l="${q}"]${i != null ? `[data-i="${i}"]` : ""}`), me = svg.querySelector(".skr-me-spr image");
  const at = (fr, t, loop) => { const d = durOf(fr); if (!fr.length || t < 0 || (!loop && t >= d)) return null; t %= d || 1;
    for (const f of fr){ if (t < f[3]) return f; t -= f[3] } return fr[fr.length - 1] };
  const draw = (g, f) => { if (g.__f === f) return; g.__f = f;
    g.innerHTML = f ? `<g transform="scale(-1 1)"><image href="${skImg(f)}" x="${-f[1]}" y="${-f[2]}" width="${f[4]}" height="${f[5]}" class="skr-spr"/></g>` : "" };
  const pose = f => skpPose(me, f);
  const t0 = performance.now(), E = L("e"), B = [...svg.querySelectorAll('.skr-fx[data-l="b"]')], H = SP.mobX.map((x, i) => L("h", i));
  H.forEach((g, i) => g && g.setAttribute("transform", `translate(${SP.mobX[i]} -23)`));   // hit frames on the Stump's middle
  const tick = now => { if (!svg.isConnected) return; const t = now - t0;
    const af = at(SP.act || [], t, false); if (af || !SKP.raf) pose(af || SP.idle);
    if (E) draw(E, at(SP.eff, t, false));
    B.forEach((g, i) => { const u = t - SP.rel - SP.balls[i], on = SP.ball.length && u >= 0 && u < SP.travel; draw(g, on ? at(SP.ball, u, true) : null);
      // once released, a projectile flies on its own from where it left: it doesn't follow the player
      if (on) g.setAttribute("transform", `translate(${pl.x + pl.dir * (SP.from + u * SKR_SPEED)} ${SP.y - pl.y})${pl.dir < 0 ? " scale(-1 1)" : ""}`) });
    H.forEach((g, i) => g && hits[i] != null && draw(g, at(SP.hit, t - hits[i], false)));
    if (t < SP.end) skrRaf = requestAnimationFrame(tick); else if (!SKP.raf) pose(SP.idle) };
  skrRaf = requestAnimationFrame(tick);
}
function rangeHtml(o, play){
  const s = o.s; if (!s.rv) return "";
  if (SKR.key !== o.key){ Object.assign(SKR, {key: o.key, lv: s.max, plv: s.rv.p ? s.rv.p[2].length : 0, wk: "", ak: ""}); skpReset() }
  const r = skRange(o.job, s, SKR.lv, SKR.plv, SKR.wk, SKR.ak); if (!r) return "";
  const pas = s.rv.p, seg = (attr, list, cur) => `<div class="seg small" role="radiogroup">${list.map(([k, t]) => `<button role="radio" data-${attr}="${esc(k)}" aria-checked="${k === cur}">${esc(t)}</button>`).join("")}</div>`;
  const W = r.weapons || [], acts = W.find(w => w.key === r.wk)?.acts || [], bases = W.filter((w, i) => W.findIndex(x => x.base === w.base) === i), vars = W.filter(w => w.base === r.base);
  const src = s.rv.f.startsWith("action") ? "the client's swing boxes (Character Afterimage, OSMS export + maplestory.io MCW) for the weapon's swing family (each weapon item names its own) and the swing picked above"
    : s.rv.L ? "OSMS export: the box stored with the skill" : s.rv.b?.[1] === "client_default" ? `OSMS export: the client's ${s.rv.b[0]} px default for this kind of attack`
    : s.rv.b?.[1] === "weapon" ? "OSMS export: the weapon's base range" : "OSMS export: the skill's stored values";
  return `<h3 class="msec">Range and hitbox</h3><div class="card skr" id="skr">
    <div class="skr-ctl">${s.max > 1 ? `<label>Skill level <b>${r.lv}</b><input type="range" data-skrlv min="1" max="${s.max}" value="${r.lv}"></label>` : ""}
      ${pas ? `<label>${esc(pas[1])} <b>${r.plv || "not learned"}</b><input type="range" data-skrplv min="0" max="${pas[2].length}" value="${r.plv}"></label>` : ""}</div>
    ${bases.length > 1 ? seg("skrw", bases.map(w => [w.base, w.label]), r.base) : ""}${vars.length > 1 ? seg("skrv", vars.map(w => [w.key, w.v]), r.wk) : ""}${acts.length > 1 ? seg("skra", acts.map(a => [a[0], ACTNAME(a[0])]), r.ak) : ""}
    ${rangeSvg(r, play, s.id)}<button class="btn skr-replay" data-skrplay aria-label="Replay the range preview">▶ Replay</button>
    <dl class="stats mgrid"><div><dt>Shape</dt><dd>${esc(r.label)}</dd></div>${r.facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
    <p class="sub skr-keys">Click the preview to play: A/D or arrows walk, W, up or Space jumps, and Ctrl, 1, 4, 6 or a click uses the skill. A controller works too (stick or d-pad walks, the bottom face button jumps, the other face buttons use the skill). Walking (150 px/s), jumping (77 px high) and the attack time follow the game at base Speed and Jump; only the skills the game allows mid-jump work in the air. <span class="skr-msg" aria-live="polite"></span></p>
    <p class="sub">Game pixels from your feet, facing right; the Stump shows monster size.${D.skanim?.sk?.[s.id] ? " Character, skill effect, projectile and hit frames come from the Classic World client (maplestory.io MCW); when the hit lands and how fast the shot flies are drawn for show." : ""} Source: ${src}${r.from ? `, level ${r.from}+ box` : ""}${r.blast ? "; explosion box from the client's hidden follow-up skill (maplestory.io MCW, same size on meowdb)" : ""}.</p></div>`;
}

function page(o){
  const s = o.s, st = (k, v) => v == null || v === "" ? "" : `<div><dt>${k}</dt><dd>${v}</dd></div>`;
  const req = reqOf(o).map(([r, n, lv]) => `<li>${r ? link(r) : esc(n)} <span class="sub">level ${lv}+</span></li>`).join("");
  const unl = (NEEDED[o.key] || []).map(x => `<li>${link(x)} <span class="sub">${esc(x.job)} · needs level ${x.s.req.find(r => r[0] === s.n)[1]}</span></li>`).join("");
  const same = K.filter(x => x !== o && x.s.n === s.n).map(x => `<li>${link(x)} <span class="sub">${esc(x.job)}</span></li>`).join("");
  const card = (h, body, empty) => `<div><h4>${h}</h4>${body ? `<ul class="mlist">${body}</ul>` : `<p class="sub">${empty}</p>`}</div>`;
  const desc = s.d.replace(/\n?Required Skills?:.*$/s, "").trim();
  return `<div class="mpage">
    <div class="mpbar"><button class="btn" id="skback">← All skills</button><button class="btn" id="skshare">Copy link</button></div>
    <div class="mtop">${icon(o, true)}<div><h2>${esc(s.n)}</h2>
      <p class="sub">${esc(o.job)} · ${esc(o.cls)} ${tierTxt(o)} · max level ${s.max} · skill ID ${esc(s.id)}</p><p class="mflags">${pill(o)}</p></div></div>
    ${desc ? `<p class="idesc">${esc(desc).replace(/\n/g, "<br>")}</p>` : ""}
    <dl class="stats mgrid">${st("Max level", s.max)}${o.type === "Attack" ? st("Monsters hit", s.mob) + st("Hits per use", s.att) : ""}${s.rg ? st("Reach", s.rg[0] + " px" + (s.rg[1] ? ` (+${s.rg[1]} behind)` : "")) : ""}</dl>
    ${rangeHtml(o, true)}
    <div class="mcols">
      ${card("Needs", req, "No other skill needed.")}
      ${card("Unlocks", unl, "No skill needs it.")}
      ${same ? card("Same skill in other jobs", same) : ""}
    </div>
    <h3 class="msec">Every level</h3>
    <div class="tblwrap"><table class="mini"><thead><tr><th class="num">Lv</th><th>Effect</th></tr></thead>
      <tbody>${s.st.map((t, i) => `<tr><td class="num">${i + 1}</td><td>${esc(t)}</td></tr>`).join("")}</tbody></table></div>
  </div>`;
}

const JOBORDER = Object.keys(D.skills);
const COLS = {name: o => o.s.n, job: o => JOBORDER.indexOf(o.job), type: o => o.type, max: o => o.s.max};
function render(){
  const q = S.q.trim().toLowerCase(), f = COLS[S.sort] || COLS.job;
  const rows = K.filter(o => (!S.cls || o.cls === S.cls) && (!S.job || o.job === S.job) && (!S.tier || o.tier === +S.tier) && (!S.type || o.type === S.type) && (!q || o.hay.includes(q)))
    .sort((a, b) => { const x = f(a), y = f(b); return (typeof x === "string" ? x.localeCompare(y) : x - y) * S.dir || JOBORDER.indexOf(a.job) - JOBORDER.indexOf(b.job) || a.s.id - b.s.id });
  document.querySelectorAll("#skhead th[data-k]").forEach(th => { const on = th.dataset.k === S.sort;
    th.setAttribute("aria-sort", on ? (S.dir > 0 ? "ascending" : "descending") : "none");
    th.querySelector("button").dataset.arrow = on ? (S.dir > 0 ? "▲" : "▼") : "" });
  $("#skcount").textContent = `${rows.length} skill${rows.length === 1 ? "" : "s"}`;
  $("#skrows").innerHTML = rows.map(o => `<tr data-key="${esc(o.key)}"><td><button class="mbtn skbtn">${icon(o)}<span><b>${esc(o.s.n)}</b></span></button></td>
      <td>${esc(o.job)} <span class="sub">${o.tier === 1 ? "1st" : "2nd"}</span></td><td>${pill(o)}</td><td class="num">${o.s.max}</td>
      <td class="sub">${o.s.req.map(([n, lv]) => `${esc(n)} ${lv}`).join(", ") || "–"}</td><td class="sub">${esc(o.s.st[o.s.st.length - 1] || "")}</td></tr>`).join("")
    || `<tr><td colspan="6" class="sub">No skill matches.</td></tr>`;
}
function show(){
  const o = S.open && OPEN[S.open];
  $("#sklist").hidden = !!o; $("#skpage").hidden = !o;
  if (!o){ render(); return }
  $("#skpage").innerHTML = page(o); skrStart(o);
}
// The preview repeats SKR_PAUSE ms after it ends (Danny 11-01, overrides design.md's no-loop rule for this card), only while
// this skill's card is on screen and the tab is visible; never under reduced motion. Slider moves push the next play back.
const SKR_PAUSE = 2500; let skrT = 0;
const skrCalm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function skrLoop(ms){ clearTimeout(skrT); if (skrCalm()) return; const key = S.open;
  skrT = setTimeout(() => { if (S.open !== key || !$("#skr")) return;
    if (document.hidden || $("#skpage").hidden || $("#skills").hidden || skpLive()) return skrLoop(SKR_PAUSE);
    if (SKP.x || SKP.y || SKP.dir < 0) skpReset();   // player let go: next replay starts from the start spot again
    redrawRange(true) }, ms) }
function skrStart(o){ const r = o.s.rv && skRange(o.job, o.s, SKR.lv, SKR.plv, SKR.wk, SKR.ak); if (!r) return;
  const SP = skrSprites(r, o.s.id), mob = D.mobimg?.["6"], [mw, mh] = mob ? pngSize(mob) : [46, 46];
  skrPlay($("#skr .skr-svg"), r, o.s.id, skrHits(r, SP, SKP, mw, mh), {x: SKP.x, y: SKP.y, dir: SKP.dir}); skrLoop((SP ? SP.end : 1300) + SKR_PAUSE); return {r, SP} }
function openSkill(key){ S.open = key; save(); show(); $("#skills").scrollIntoView({block: "start"}) }
$("#sksearch").addEventListener("input", e => { S.q = e.target.value; render() });
for (const [k, el] of FIELDS) $(el).addEventListener("change", e => { S[k] = e.target.value; save(); render() });
$("#skreset").addEventListener("click", () => { Object.assign(S, DEF); save(); sync(); render() });
document.querySelectorAll("#skhead th[data-k] button").forEach(b => b.addEventListener("click", () => {
  const k = b.parentElement.dataset.k; S.dir = S.sort === k ? -S.dir : (k === "max" ? -1 : 1); S.sort = k; save(); render();
}));
$("#skrows").addEventListener("click", e => { const b = e.target.closest(".skbtn"); if (b) openSkill(b.closest("tr").dataset.key) });
$("#skpage").addEventListener("click", e => {
  if (e.target.id === "skback"){ S.open = null; save(); show(); return }
  if (e.target.id === "skshare") return copyShare(e.target, shareUrl("s", S.open));
  const l = e.target.closest("[data-skopen]"); if (l) openSkill(l.dataset.skopen);
  const w = e.target.closest("[data-skrw],[data-skrv],[data-skra]");
  if (w){ if (w.dataset.skrw) Object.assign(SKR, {wk: w.dataset.skrw, ak: ""}); else if (w.dataset.skrv) SKR.wk = w.dataset.skrv; else SKR.ak = w.dataset.skra; redrawRange(true) }
  if (e.target.closest("[data-skrplay]")) redrawRange(true);
});
function redrawRange(play){ const o = S.open && OPEN[S.open], el = $("#skr"); if (!o || !el) return;
  const a = document.activeElement, f = el.contains(a) ? ["skrlv", "skrplv", "skrplay", "skrw", "skrv", "skra", "skrstage"].map(k => k in a.dataset ? `[data-${k}${a.dataset[k] ? `="${a.dataset[k]}"` : ""}]` : "").find(Boolean) : null;
  const tmp = document.createElement("div"); tmp.innerHTML = rangeHtml(o, play); SKP.swap = true; el.replaceWith(tmp.querySelector("#skr"));
  const out = play ? skrStart(o) : skrLoop(SKR_PAUSE); if (f) $("#skr " + f)?.focus({preventScroll: true}); SKP.swap = false; return out }
// Player controls. Keys only while the preview has focus (no page scroll, no typing hijack); a controller (Gamepad API, standard
// mapping: button 0 = bottom face = jump, 1-3 = other face buttons = skill, axis 0 / d-pad 14-15 = walk) works while the card is
// on screen. Auto-replay waits while either is in use (skpLive).
// Physics (client Map/Physics.img via maplestory.io MCW: walkSpeed 125, jumpSpeed 555, gravityAcc 2000, fallSpeed 670, all per
// second): Classic adds 20 Speed, so base walking is 125 × 1.2 = 150 px/s (meowdb speed guide, measured; jump 77 px, 0.555 s).
// Approximate, on the in-game test list (docs/notes.md): no steering in the air (take-off speed kept, facing can turn); a ground
// attack stops you and you can't jump or turn until it ends; an air attack keeps your momentum.
const SKP_WALK = .15, SKP_JUMP = .555, SKP_G = .002, SKP_FALL = .67;   // px/ms, px/ms, px/ms², px/ms
const SKP_KEYS = {ArrowLeft: "l", KeyA: "l", ArrowRight: "r", KeyD: "r", ArrowUp: "j", KeyW: "j", Space: "j", ArrowDown: "", KeyS: "",
  ControlLeft: "f", ControlRight: "f", Digit1: "f", Digit4: "f", Digit6: "f", Numpad1: "f", Numpad4: "f", Numpad6: "f"};
const skpLive = () => SKP.focus || SKP.raf || performance.now() - SKP.ctl < 3000;
const skpStage = () => $("#skr [data-skrstage]");
const skpMsg = t => { const m = $("#skr .skr-msg"); if (m) m.textContent = t };
function skpFire(){ const now = performance.now(); SKP.ctl = now; if (now < SKP.busy) return;
  const o = OPEN[S.open]; if (!o) return;
  if ((SKP.y > 0 || SKP.vy) && !SKR_AIR.has(o.s.n)){ if (!SKP.noair) skpMsg(`${o.s.n} can't be used mid-jump in Classic (meowdb's mid-jump list).`); SKP.noair = 1; return }
  const out = redrawRange(true); if (!out) return; const {r, SP} = out;
  SKP.busy = now + (SP?.cd || 450);
  if (r.tp){ const key = S.open; setTimeout(() => { if (S.open !== key) return; skpMoveTo(SKP.x + SKP.dir * r.tp); redrawRange() }, 480) } }
function skpMoveTo(x){ const vb = skpStage()?.viewBox.baseVal; SKP.x = vb ? Math.max(vb.x + 22, Math.min(vb.x + vb.width - 22, x)) : x }
function skpTick(now){
  const svg = skpStage(), dt = Math.min(50, now - (SKP.lt || now)); SKP.lt = now;
  if (!svg || $("#skpage").hidden){ SKP.raf = 0; SKP.keys.clear(); return }
  const k = SKP.keys, pad = SKP.pad, dx = (k.has("r") || pad?.dx > 0 ? 1 : 0) - (k.has("l") || pad?.dx < 0 ? 1 : 0);
  const air = SKP.y > 0 || SKP.vy > 0, busy = now < SKP.busy;
  if (air){ if (dx && !busy) SKP.dir = dx; skpMoveTo(SKP.x + SKP.vx * dt) }   // in the air: take-off speed kept, facing can turn
  else if (dx && !busy){ SKP.dir = dx; skpMoveTo(SKP.x + dx * SKP_WALK * dt) }   // a ground attack roots you until it ends
  if ((k.has("j") || pad?.jump) && !air && !busy) skpJump(dx);
  if (SKP.vy || SKP.y){ SKP.y = Math.max(0, SKP.y + SKP.vy * dt); SKP.vy = Math.max(-SKP_FALL, SKP.vy - SKP_G * dt); if (!SKP.y && SKP.vy < 0){ SKP.vy = 0; SKP.vx = 0; SKP.noair = 0; skpMsg("") } }
  if (k.has("f") || pad?.fire) skpFire();
  svg.querySelector(".skr-pl")?.setAttribute("transform", skpXf());
  svg.querySelector(".skr-plt")?.setAttribute("transform", `translate(${SKP.x} ${-SKP.y})`);
  const o = OPEN[S.open], r = o && skRange(o.job, o.s, SKR.lv, SKR.plv, SKR.wk, SKR.ak), SP = r && skrSprites(r, o.s.id);
  if (SP && now >= SKP.busy){ const A = D.skanim.act, two = SP.idle === (A[`${SP.w}|stand2`] || [])[0];
    const walk = A[`${SP.w}|${two ? "walk2" : "walk1"}`], jump = A[`${SP.w}|jump`], d = walk ? durOf(walk) : 1;
    let f = SP.idle; if (SKP.y > 0 && jump) f = jump[0]; else if (dx && walk){ let t = now % d; f = walk.find(x => (t -= x[3]) < 0) || walk[0] }
    skpPose(svg.querySelector(".skr-me-spr image"), f) }
  if (dx || SKP.y || SKP.vy || k.size || pad?.on) SKP.raf = requestAnimationFrame(skpTick);
  else { SKP.raf = 0; SKP.lt = 0; if (SP && now >= SKP.busy) skpPose(svg.querySelector(".skr-me-spr image"), SP.idle) } }
const skpJump = dx => { SKP.vy = SKP_JUMP; SKP.vx = dx * SKP_WALK };
const skpGo = () => { SKP.ctl = performance.now(); if (!SKP.raf){ SKP.lt = 0; SKP.raf = requestAnimationFrame(skpTick) } };
$("#skpage").addEventListener("keydown", e => { if (!e.target.matches?.("[data-skrstage]") || e.altKey || e.metaKey || (e.ctrlKey && !/^Control/.test(e.code))) return;
  const a = SKP_KEYS[e.code]; if (a == null) return; e.preventDefault(); if (!a) return;
  if (a === "f"){ if (!e.repeat) skpFire(); SKP.keys.add("f") } else SKP.keys.add(a);
  if (a === "j" && !SKP.y && !SKP.vy && performance.now() >= SKP.busy) skpJump((SKP.keys.has("r") ? 1 : 0) - (SKP.keys.has("l") ? 1 : 0));   // a quick tap still jumps
  skpGo() });
$("#skpage").addEventListener("keyup", e => { const a = SKP_KEYS[e.code]; if (a) SKP.keys.delete(a) });
$("#skpage").addEventListener("focusin", e => { if (e.target.matches?.("[data-skrstage]")) SKP.focus = true });
$("#skpage").addEventListener("focusout", e => { if (!e.target.matches?.("[data-skrstage]") || SKP.swap) return; SKP.focus = false; SKP.keys.clear(); SKP.ctl = performance.now() });
$("#skpage").addEventListener("pointerdown", e => { if (e.button === 0 && e.target.closest?.("[data-skrstage]")){ e.preventDefault(); e.target.closest("[data-skrstage]").focus({preventScroll: true}); skpFire() } });
// Gamepads: polled only while one is connected (browsers expose a pad after its first button press).
let skpPads = 0;
function skpPoll(){ let pad = null; try { pad = [...navigator.getGamepads()].find(Boolean) } catch(e) {}
  if (!pad){ SKP.pad = null; skpPads = 0; return }
  const b = i => pad.buttons[i]?.pressed, ax = pad.axes[0] || 0, dx = b(14) || ax < -.4 ? -1 : b(15) || ax > .4 ? 1 : 0;
  const st = {dx, jump: b(0), fire: b(1) || b(2) || b(3)}; st.on = !!(st.dx || st.jump || st.fire);
  const live = $("#skr [data-skrstage]") && !$("#skpage").hidden && !$("#skills").hidden && !document.hidden;
  SKP.pad = live ? st : null; if (live && st.on) skpGo();
  skpPads = requestAnimationFrame(skpPoll) }
addEventListener("gamepadconnected", () => { if (!skpPads) skpPads = requestAnimationFrame(skpPoll) });
$("#skpage").addEventListener("input", e => { if (e.target.matches("[data-skrlv]")) SKR.lv = +e.target.value; else if (e.target.matches("[data-skrplv]")) SKR.plv = +e.target.value; else return; redrawRange() });
window.skRange = skRange; window.skrAnim = skrAnim; window.skrSprites = skrSprites; window.skrHits = skrHits;
ASSETS.then(() => { if (S.open && $("#skr") && !$("#skr .skr-sp")) redrawRange(true) }, () => {});   // Pages: frames arrive with the lazy assets
openSkillPage = key => { if (!OPEN[key]) return; $("#t-skills").click(); openSkill(key) };
if (HASH.s && OPEN[HASH.s]) S.open = String(HASH.s);
show();
navReg("skills", () => S.open, v => { S.open = v; save(); show() });
})();
