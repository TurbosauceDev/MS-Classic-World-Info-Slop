/* ---------------- citizenship ---------------- */
(() => {
// from meowdb.com/msclassic/citizenship (COT2)
const GRADES = [["Traveler",12,"from quest",5,5,95],["Visitor",17,1000,7,10,90],["Helpful Stranger",22,2000,9,15,85],
  ["Recognized Guest",27,3000,11,20,80],["Town Resident",32,4000,13,25,75],["Trusted Neighbor",37,5000,15,30,70],
  ["Distinguished Citizen",42,6000,17,35,65],["Town Patron",47,7000,19,40,60],["Guardian of the Village",52,8000,21,45,55],
  ["Citizen of Honor",57,10000,25,50,50]];
// [shop, npc, items: [name, price, min grade (1-10), effect]]
const SHOPS = {
  "Henesys": [
    ["Town General Store","Raymond",[["Fried Chicken",60,1,""],["Hot Dog",180,1,""],["Salad",220,2,""],["Pizza",252,4,""],["Hamburger",350,5,""],["Mrs. Ming Ming's Stew",480,6,"300 HP + 300 MP"],["Orange Juice",540,6,"450 MP"],["Supreme Sniper Potion",600,1,"Accuracy +7, 15 min"],["Sharpness Potion",750,3,"Crit rate +3%, 15 min"],["Fat Sausage",800,7,"800 HP"],["Unagi",1000,8,""],["Grape Juice",1260,9,"550 MP"],["Elixir",3000,10,"35% HP + MP"],["Orange Mushroom Daydream",500,10,"Untradeable"],["Bronze Arrows for Bows",2,3,"ATK +1"],["Bronze Arrows for Crossbows",2,3,"ATK +1"]]],
    ["Town Furnishings","Oak",[["Henesys Resident's Chair",10000,2,"+20 HP / 5 MP per 10 s seated"]]],
    ["Town Scroll Shop (100% scrolls)","Flint",[["Earring Crit. Damage Scroll: Lesser",50000,3,""],["Topwear DEF Scroll: Lesser",25000,5,"W.DEF +2"],["Bottomwear DEF Scroll: Lesser",25000,5,"W.DEF +2"],["Overall Armor DEX Scroll: Lesser",35000,7,""],["Overall Armor STR Scroll: Lesser",35000,7,""],["Gloves Attack Scroll: Lesser",50000,9,""],["Gloves Magic Attack Scroll: Lesser",50000,9,""]]]],
  "Kerning City": [
    ["City General Store","Max",[["Fried Chicken",60,1,""],["Dried Squid",180,1,""],["Salad",220,2,"200 MP"],["Pizza",252,4,""],["Hamburger",350,5,""],["Andre's Seafood Soup",480,6,"300 HP + 300 MP"],["Orange Juice",540,6,""],["Supreme Dexterity Potion",600,1,"Avoid +7, 15 min"],["Destructive Potion",750,3,"Crit damage +3%, 15 min"],["Fat Sausage",800,7,""],["Wolbi Throwing Stars",1000,3,"ATK +17"],["Unagi",1000,8,""],["Grape Juice",1260,9,""],["Elixir",3000,10,"35% HP + MP"],["Ribbon Pig Daydream",500,10,"Untradeable"]]],
    ["City Furnishings","Weston",[["Kerning City Resident's Chair",10000,2,"+20 HP / 5 MP per 10 s seated"]]],
    ["City Scroll Shop (100% scrolls)","Ben",[["Earring Evasion Scroll: Lesser",25000,3,""],["Topwear DEF Scroll: Lesser",25000,5,"W.DEF +2"],["Bottomwear DEF Scroll: Lesser",25000,5,"W.DEF +2"],["Overall Armor LUK Scroll: Lesser",35000,7,""],["Overall Armor INT Scroll: Lesser",35000,7,""],["Gloves Attack Scroll: Lesser",50000,9,""],["Gloves Magic Attack Scroll: Lesser",50000,9,""]]]]
};
const JOIN = {"Henesys":"Arthur in Henesys Town Hall", "Kerning City":"Roxy in the Kerning City Civic Center"};
const clean = s => String(s || "").replace(/ \(source n\/a\)/g, "");
const qn = r => `<span class="name qname" tabindex="0" data-src="cit" data-i="${D.citq.indexOf(r)}">${esc(r.name)}</span>`;
let town = "Henesys";
try { town = localStorage.getItem("ctown") || "Henesys" } catch(e) {}

function render(){
  document.querySelectorAll("#ctown button").forEach(b => b.setAttribute("aria-checked", b.dataset.t === town));
  const Q = D.citq.filter(r => (r.town || (r.name.includes("Kerning") ? "Kerning City" : "Henesys")) === town);
  const daily = Q.filter(r => r.pool && /Daily/.test(r.pool)), weekly = Q.filter(r => r.pool && /Weekly/.test(r.pool));
  const story = Q.filter(r => !r.pool && r.grade), intro = Q.find(r => !r.pool && !r.grade);
  const byGrade = (daily.find(r => r.contrib_by_grade) || {}).contrib_by_grade || [];
  const bestWeekly = g => Math.max(0, ...weekly.filter(r => r.grade <= g).map(r => r.contrib || 0));
  const earring = town === "Henesys" ? "Henesys Earrings" : "Kerning City Earrings";
  const eid = town === "Henesys" ? "1032021" : "1032022", ei = D.items[eid], es = ei.st;
  const eicon = `<span class="ri" tabindex="0" data-item="${eid}" data-n="1" style="float:right;margin-left:8px">${D.iicons[eid] ? `<img src="data:image/png;base64,${D.iicons[eid]}" alt="${esc(ei.n)}">` : ""}</span>`;

  $("#cfacts").innerHTML = [
    ["How to join", `At level 12, sign up with ${JOIN[town]}. The intro quest gives ${esc(intro ? intro.reward.replace(/;/g, ",") : "potions")}.`],
    ["Daily board", `${new Set(daily.map(r => r.name.replace(/^(First Greeting with|Asking After) /, "").split(",")[0].replace(/\.$/, "").trim())).size} residents to meet. Each daily gives ${fmt(byGrade[0])} contribution at grade 1, rising 50 per grade to ${fmt(byGrade[9])}. VIP residents unlock at grade 5 and give much more EXP.`],
    ["Weekly donation", `Bring 100 of a monster drop for ${fmt(Math.min(...weekly.map(r => r.contrib)))}–${fmt(Math.max(...weekly.map(r => r.contrib)))} contribution plus up to ${fmt(Math.max(...weekly.map(r => r.exp)))} EXP.`],
    ["Top reward", `${eicon}${earring} at grade 10 (Citizen of Honor): level ${es.reqLevel}, M.DEF +${es.incMDD}, Avoid +${es.incEVA}, Crit damage +${es.incCRD}%, ${es.tuc} upgrade slots. Hover the icon for the full item. Plus ${GRADES[9][3]}% off shops and Elixirs for 3,000 mesos.`]
  ].map(([h, p]) => `<div class="fact"><h3>${esc(h)}</h3><p>${p}</p></div>`).join("");

  const shops = SHOPS[town];
  $("#cgrades").innerHTML = GRADES.map((g, i) => {
    const n = i + 1;
    const unlocks = shops.flatMap(s => s[2].filter(it => it[2] === n && n > 1).map(it => it[0]));
    if (n === 5) unlocks.unshift("VIP dailies");
    if (n === 10) unlocks.unshift(earring);
    return `<tr><td class="num">${n}</td><td class="name">${esc(g[0])}</td><td class="num">${g[1]}</td><td class="num">${typeof g[2] === "number" ? fmt(g[2]) : "intro quest"}</td>
      <td class="num">${g[3]}%</td><td class="num">${g[4]}% <span class="sub">(${g[5]} mesos)</span></td>
      <td class="num">${byGrade[i] != null ? fmt(byGrade[i]) : "–"}</td><td class="num">${fmt(bestWeekly(n))}</td>
      <td class="sub">${unlocks.map(esc).join(", ") || "–"}</td></tr>`;
  }).join("");

  $("#cstory").innerHTML = story.sort((a, b) => a.grade - b.grade || a.id - b.id).map(r => `<tr>
    <td class="num">${r.lvl}</td><td class="num">${r.grade}</td><td>${qn(r)}<div class="sub">${esc(r.npc || "")}</div></td>
    <td class="sub">${esc(clean(r.req))}</td><td class="num">${fmt(r.exp)}</td><td class="num">${fmt(r.mesos)}</td>
    <td class="num">${fmt(r.contrib)}</td><td>${rewardCell(r)}</td></tr>`).join("");

  const pairs = {};
  for (const r of daily){ const who = r.name.replace(/^(First Greeting with|Asking After) /, "").split(",")[0].replace(/\.$/, "").trim(); (pairs[who] = pairs[who] || {})[r.one_time ? "first" : "rep"] = r }
  const cell = r => r ? `${qn(r)}<div class="sub">${fmt(r.exp)} EXP · ${fmt(r.mesos)} mesos</div>${rewardCell(r)}` : "–";
  $("#cdaily").innerHTML = Object.entries(pairs).sort((a, b) => (a[1].first || a[1].rep).grade - (b[1].first || b[1].rep).grade)
    .map(([who, p]) => `<tr><td class="num">${(p.first || p.rep).grade}</td><td class="name">${esc(who)}</td><td>${cell(p.first)}</td><td>${cell(p.rep)}</td></tr>`).join("");
  $("#cdailynote").textContent = `Meet each resident once, then their "Asking After" quest becomes a repeatable daily. The board offers 1 daily a day from this pool of ${daily.length}. Contribution per daily depends on your grade (see the table above), not on the quest.`;

  $("#cweekly").innerHTML = weekly.sort((a, b) => a.grade - b.grade || a.contrib - b.contrib).map(r => `<tr>
    <td class="num">${r.grade}</td><td>${qn(r)}<div class="sub">${esc(clean(r.req))}</div></td><td class="num">${fmt(r.exp)}</td>
    <td class="num">${fmt(r.mesos)}</td><td class="num">${fmt(r.contrib)}</td><td>${rewardCell(r)}</td></tr>`).join("");

  $("#cshops").innerHTML = shops.map(([shop, npc, items]) => `<div class="fact"><h3>${esc(shop)} <span class="sub">· ${esc(npc)}</span></h3>
    <table class="mini"><tbody>${items.slice().sort((a, b) => a[2] - b[2] || a[1] - b[1]).map(it => `<tr><td>${esc(it[0])}${it[3] ? `<div class="sub">${esc(it[3])}</div>` : ""}</td>
      <td class="num">${fmt(it[1])}</td><td class="num"><span class="pill ${it[2] === 1 ? "p-good" : "p-hot"}">${it[2] === 1 ? "all" : "grade " + it[2] + "+"}</span></td></tr>`).join("")}</tbody></table></div>`).join("");
}
document.querySelectorAll("#ctown button").forEach(b => b.addEventListener("click", () => {
  town = b.dataset.t; try { localStorage.setItem("ctown", town) } catch(e) {} render();
}));
render();
})();

