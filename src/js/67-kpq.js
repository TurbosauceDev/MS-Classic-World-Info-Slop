/* ---------------- KPQ guide ---------------- */
(() => {
// Kerning City Party Quest ("First Time Together", maps 1st Accompaniment 80000000-80000600). Maps, NPC and monster spots,
// monster stats and the quest come from the launch export (D.kpq, D.mobdb, D.quests); puzzle answers, Cloto's questions,
// box contents and tips from meowdb's KPQ guide (read 2026-10-08), which cites Nexon's Founder's Access notes for Ch 3-5.
const MEOW = "https://meowdb.com/msclassic/guides/kerning-city-party-quest-kpq-guide";
const NPCNAME = {"800001": "Cloto", "800002": "Nella"};
const BYNAME = {}; for (const [id, it] of Object.entries(D.items)) BYNAME[it.n] ??= id;
const item = name => { const id = BYNAME[name]; return id ? `<span class="iname">${itemIcon(id, 1, true)}<span class="itname" tabindex="0" data-item="${id}">${esc(name)}</span></span>` : esc(name) };
const mob = id => D.mobdb[id] ? mobLink(id) : esc(id);
const npc = id => { const img = D.npcimg[id]; return `<span class="kpqnpc">${img ? `<img src="data:image/png;base64,${img}" alt="">` : ""}<b>${NPCNAME[id] || id}</b></span>` };
const map = i => D.kpq[i];
const COLOR = {"800000": 0, "800001": 2, "800002": 3, "800003": 6, "19": 4, "13": 5};   // dot colour per monster

// minimap of a KPQ map with monster dots and NPC name tags (positions from the export)
function mm(m){
  if (!m?.mm) return "";
  const [w0, h0] = m.dim, k = Math.min(360 / w0, 300 / h0, 3), w = Math.round(w0 * k), h = Math.round(h0 * k);
  const pos = (x, y) => `left:${(x * 100).toFixed(1)}%;top:${(y * 100).toFixed(1)}%`;
  const dots = m.mob.filter(p => p[1] != null).map(([id, x, y]) => `<span class="mspot c${COLOR[id] ?? 7}" style="${pos(x, y)}"></span>`).join("");
  const stars = m.npc.filter(p => p[1] != null).map(([id, x, y]) => `<span class="npcl" style="${pos(x, y)}" title="${NPCNAME[id] || ""}">${(NPCNAME[id] || "?")[0]}</span>`).join("");
  const n = {}; for (const [id] of m.mob) n[id] = (n[id] || 0) + 1;
  const key = Object.entries(n).map(([id, c]) => `<span class="mspot c${COLOR[id] ?? 7} key"></span>${mob(id)} ×${c}`).join(" · ");
  return `<div class="mfmap"><div class="mmwrap" style="width:${w}px;height:${h}px"><img class="mm" src="data:image/${D.mmapType};base64,${m.mm}" alt="Minimap of ${esc(m.name)}" width="${w}" height="${h}">${dots}${stars}</div>
    <p class="sub">${key ? key + " · " : ""}${m.npc.map(([id]) => `<b>${(NPCNAME[id] || "?")[0]}</b> = ${NPCNAME[id] || id}`).join(", ")}</p></div>`;
}
// all combinations of k picked from 1..n, as a try table
function combos(n, k, label){
  const out = [], go = (s, a) => { if (a.length === k) return out.push(a); for (let i = s; i <= n; i++) go(i + 1, [...a, i]) }; go(1, []);
  return `<div class="tblwrap"><table class="kpqtry"><thead><tr><th class="num">Try</th><th>${label}</th>${Array.from({length: n}, (_, i) => `<th class="num">${i + 1}</th>`).join("")}</tr></thead><tbody>
    ${out.map((a, j) => `<tr><td class="num">${j + 1}</td><td>${a.join("-")}</td>${Array.from({length: n}, (_, i) => `<td class="num">${a.includes(i + 1) ? "●" : "○"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
const ROPES = [["A, B, C", "D"], ["A, B, D", "C"], ["A, C, D", "B"], ["B, C, D", "A"]];
const CLOTO = [["Magician job advancement level", 10], ["Warrior, Bowman or Thief job advancement level", 10], ["EXP from level 1 to level 2", D.exp[1]],
  ["INT a Magician needs", 20], ["DEX a Bowman or Thief needs", 25], ["STR a Warrior needs", 35]];
// Companion's Magic Box: what players report getting (meowdb, community, read 2026-10-08), [name, count]
const BOX = [["Ores and gems", [["Gold Ore", 5], ["Silver Ore", 8], ["Topaz Ore", 8], ["Adamantium Ore", 8], ["Amethyst Ore", 8], ["Aquamarine Ore", 8], ["Black Crystal Ore", 3],
    ["Diamond Ore", 3], ["Emerald Ore", 8], ["Garnet Ore", 8], ["Iron Ore", 8], ["Mithril Ore", 8], ["Sapphire Ore", 8], ["Screw", 10]]],
  ["Use", [["Hat Accuracy Scroll: Greater", 1], ["Overall Armor DEF Scroll: Greater", 1], ["Overall Armor INT Scroll: Greater", 1], ["Overall Armor STR Scroll: Greater", 1],
    ["Bottomwear DEF Scroll: Greater", 1], ["Elixir", 3], ["Pure Water", 10], ["Unagi", 10], ["Blue Potion", 10], ["Orange Potion", 10], ["Red Potion", 5]]],
  ["Equipment", [["Blue Bamboo Hat", 1], ["Brown Bamboo Hat", 1], ["Green Bamboo Hat", 1], ["Yellow Square", 1], ["Gold Earrings", 1], ["Red Cross Earrings", 1], ["Emerald Earrings", 1], ["Star Earrings", 1], ["Sapphire Earrings", 1]]]];

function render(){
  const q = D.quests.find(r => r.id === "10311"), ks = D.mobdb["800003"];
  const kpqMobs = Object.entries(D.mobdb).filter(([, m]) => m.maps.some(x => x[4] === "KPQ"));
  const stage = (i, title, body) => `<div class="card kpqstage"><div class="cardhead"><h3>${title}</h3><span class="sub">${esc(map(i)?.name || "")}</span></div>
    <div class="kpqcols"><div>${body}</div>${mm(map(i))}</div></div>`;
  $("#kpqbody").innerHTML = `
  <div class="grid2 kpqfacts">
    <div class="card"><h3>Getting in</h3><ul>
      <li><b>Party of exactly 4</b>, everyone <b>level 21+</b>. No level cap found in the launch files, no job limits.</li>
      <li>The leader talks to ${npcLink("Lakelis")} next to the sewer entrance in ${mapLink("10003000", "Kerning City")}.</li>
      <li><b>30 minutes</b> for the whole run. Several parties can run it at once.</li>
      <li><b>Channels 3, 4 and 5 only</b> (Nexon's Founder's Access notes, Oct 7 2026).</li>
      <li>Looking for a party: stand by Lakelis and type <code>J&gt;PQ</code> with your level and class (<code>L&gt;PQ</code> / <code>R&gt;PQ</code> if you're building one).</li>
    </ul></div>
    <div class="card"><h3>Before your first run</h3>
      ${q ? `<p>Take <span class="name qname" tabindex="0" data-src="q" data-i="${D.quests.indexOf(q)}">${esc(q.name)}</span> from Lakelis: kill King Slime once for <b>${fmt(q.exp)} EXP</b>, <b>${fmt(q.mesos)} mesos</b>, 1 fame (meowdb) and one random Intermediate earring scroll:</p>
      <p>${["Earring STR Scroll: Intermediate", "Earring DEX Scroll: Intermediate", "Earring INT Scroll: Intermediate", "Earring LUK Scroll: Intermediate"].map(item).join("<br>")} <span class="sub">(25% each)</span></p>
      <p class="sub">One-time quest.</p>` : ""}
    </div>
    <div class="card"><h3>What you get</h3><ul>
      <li>EXP from every monster inside, ${ks ? `${fmt(ks.exp)} EXP from King Slime` : "King Slime"}, and EXP for clearing stages (amounts aren't in the game files or published yet).</li>
      <li>King Slime can drop ${item("Squishy Shoes")}: level 28, any class, +1 all stats, 18 W.DEF, 7 M.DEF, 5 slots, tradeable.</li>
      <li>Every member gets a ${item("Companion's Magic Box")} at the end (contents below).</li>
    </ul></div>
  </div>

  <h2 class="kpqh">Stage by stage</h2>
  ${stage(0, "Stage 1 · Ligators and Cloto's questions", `<ul>
    <li>Kill the ${fmt(map(0)?.mob.length)} ${mob("800000")}s; each drops a ${item("Coupon")}.</li>
    <li>${npc("800001")} asks every member <b>except the leader</b> a question. Hand Cloto exactly that many coupons and you get a ${item("Pass")}. Drop spare coupons.</li>
    <li>The leader gives Cloto the 3 passes to open the next stage.</li></ul>
    <div class="tblwrap"><table><thead><tr><th>Cloto asks about</th><th class="num">Coupons</th></tr></thead><tbody>
      ${CLOTO.map(([a, n]) => `<tr><td>${a}</td><td class="num"><b>${n}</b></td></tr>`).join("")}</tbody></table></div>
    <p class="sub">From meowdb; questions may change. Members have also needed 21 and 30, so more questions exist. Drew the 35? Make that player leader: the leader never gets asked, and the old leader draws a fresh question.</p>`)}
  ${stage(1, "Stage 2 · Ropes", `<ul>
    <li>Four ropes: A and B hang from the high branch, C and D from the low ones. Three members hang on three ropes, one stays empty, then the leader checks with Cloto.</li>
    <li>Only 4 options; go down the list until Cloto says it's right.</li></ul>
    <div class="tblwrap"><table class="kpqtry"><thead><tr><th class="num">Try</th><th>Members on</th><th>Empty</th></tr></thead><tbody>
      ${ROPES.map(([on, off], i) => `<tr><td class="num">${i + 1}</td><td>${on}</td><td>${off}</td></tr>`).join("")}</tbody></table></div>`)}
  ${stage(2, "Stage 3 · Kitten platforms", `<ul>
    <li>Five platforms, named by how many kittens sit on them (1-5). Three members stand on three platforms, the leader checks with Cloto.</li>
    <li>10 options. The list that goes around has 9 and drops 3-4-5: don't skip it.</li></ul>${combos(5, 3, "Platforms")}`)}
  ${stage(3, "Stage 4 · Barrels", `<ul>
    <li>Six numbered barrels in a stack (1 on top, then 2-3, then 4-5-6). Three members stand on three barrels, the leader checks with Cloto.</li>
    <li>20 options.</li></ul>${combos(6, 3, "Barrels")}`)}
  ${stage(4, "Last stage · King Slime", `<ul>
    <li>Four tiers joined by ladders: ${mob("800002")}s at the top, ${mob("800001")}s in the middle, ${mob("800003")} at the bottom. Cloto and Nella stand at the top, so climb back up after the boss.</li>
    <li>All 10 monsters (${D.mobdb["800001"] ? "6 Jr. Necki, 3 Curse Eye, 1 King Slime" : ""}) drop a coupon. The leader hands all 10 to Cloto.</li>
    <li>Jr. Necki has ${D.mobdb["800001"]?.eva ?? "high"} avoidability: bring someone with the accuracy to hit it.</li>
    <li>Jr. Necki and Curse Eye come back every 3 minutes (game files); King Slime doesn't.</li></ul>
    ${ks ? `<div class="tblwrap"><table><tbody>
      <tr><td>Level</td><td class="num">${ks.level}</td><td>HP</td><td class="num">${fmt(ks.hp)}</td></tr>
      <tr><td>EXP</td><td class="num">${fmt(ks.exp)}</td><td>Weapon / magic attack</td><td class="num">${ks.PADamage} / ${ks.MADamage}</td></tr>
      <tr><td>W.DEF / M.DEF</td><td class="num">${ks.PDDamage} / ${ks.MDDamage}</td><td>Accuracy / avoid</td><td class="num">${ks.acc} / ${ks.eva}</td></tr>
      <tr><td>Knock-back at</td><td class="num">${fmt(ks.pushed)}</td><td>Resists</td><td>${Object.keys(ks.elements || {}).join(", ")}</td></tr></tbody></table></div>
    <ul><li>On death it splits into ${(ks.revives || []).map(r => `${r.count} ${mob(r.id)}s`).join(", ")}. Killing them doesn't change the reward, by player reports.</li>
      <li>Not confirmed for Classic yet: the old game's ground slam. It hops before it lands; jump just before it touches down and the shockwave passes under you.</li>
      <li>Melee players have taken big hits in the tests: bring potions.</li></ul>` : ""}`)}
  ${stage(5, "Bonus stage and leaving", `<ul>
    <li>${map(5)?.mob.length} monsters in one small map, one wave: ${mob("19")}s and ${mob("13")}s. Free EXP and drops.</li>
    <li>No map in KPQ has a normal exit portal: talk to ${npc("800002")} to leave. She's on every stage, the bonus room and the exit map.</li></ul>`)}

  <div class="grid2">
    <div class="card"><h3>If someone dies or drops</h3><ul>
      <li>Dying no longer ends your run (seen in the August test): walk back in.</li>
      <li>3 players can still finish: stage 1 needs only 2 passes, and the leader fills the third spot on the ropes, platforms and barrels.</li>
      <li>Down to 2 before the puzzles are done: leave and rebuild. 2 players already at the boss can still finish.</li>
      <li>A trade-blocked player can't drop passes: make them leader.</li>
      <li>Don't leave or kick mid-run.</li>
    </ul></div>
    <div class="card"><h3>Be a good party member</h3><ul>
      <li>Done with your coupons, or leading? Help whoever is slowest.</li>
      <li>Pick up stray coupons and passes and drop them in front of Cloto.</li>
      <li>Explain the combination order calmly to first-timers.</li>
      <li>Say so before you go AFK.</li>
    </ul></div>
  </div>

  <h2 class="kpqh">Monsters inside</h2>
  <p class="sub">KPQ has its own copies of these monsters, weaker than the field ones (KPQ Ligator is level ${D.mobdb["800000"]?.level}).</p>
  <div class="tblwrap"><table><thead><tr><th>Monster</th><th class="num">Lv</th><th class="num">HP</th><th class="num">EXP</th><th class="num">ACC</th><th class="num">Avoid</th><th>Where</th></tr></thead><tbody>
    ${kpqMobs.sort((a, b) => a[1].level - b[1].level).map(([id, m]) => { const at = m.maps.filter(x => x[4] === "KPQ");
      return `<tr><td>${mob(id)}</td><td class="num">${m.level}</td><td class="num">${fmt(m.hp)}</td><td class="num">${fmt(m.exp)}</td><td class="num">${m.acc}</td><td class="num">${m.eva}</td>
        <td>${at.map(x => `${esc(x[1].replace("1st Accompaniment ", ""))} ×${x[2]}${x[3] && x[3] !== "7.56" ? `, respawn ${Math.round(+x[3] / 60)} min` : ""}`).join("; ")}</td></tr>` }).join("")}</tbody></table></div>

  <h2 class="kpqh">Companion's Magic Box</h2>
  <p class="sub">What players report pulling from it on meowdb (community reports, read Oct 8 2026; not from the game files, chances unknown).</p>
  <div class="grid2">${BOX.map(([h, l]) => `<div class="card"><h3>${h}</h3><div class="kpqbox">${l.map(([n, c]) => `<div>${item(n)}${c > 1 ? ` <span class="sub">×${c}</span>` : ""}</div>`).join("")}</div></div>`).join("")}</div>

  <p class="sub kpqsrc">Sources: maps, monster stats/spawns, the quest, item stats and NPC spots from the launch game files (OSMS export).
    Puzzle answers, Cloto's questions, box contents, the channel limit and tips from the <a href="${MEOW}" target="_blank" rel="noopener">meowdb KPQ guide</a> (read Oct 8 2026).</p>`;
}
render();
})();
