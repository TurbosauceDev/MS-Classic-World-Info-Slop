/* meowdb class guides, levels 1-30 (read 2026-10-06 with headless Chromium). What the Path Planner follows when
   "Follow class guides" is on: SP order, AP per level, weapons, gear, ammo, citizenship town and Training Advisor maps.
   Every value below is from the guide named in GUIDE_SRC; map ids are the export's ids for the maps the guides name. */
const GUIDE_SRC = {
  Warrior: "https://meowdb.com/msclassic/guides/warrior-class-guide",
  Magician: "https://meowdb.com/msclassic/guides/magician-class-guide",
  Bowman: "https://meowdb.com/msclassic/guides/bowman-class-guide",
  Thief: "https://meowdb.com/msclassic/guides/thief-class-guide",
  Beginner: "https://meowdb.com/msclassic/guides/beginners-guide-first-steps-in-maple-world"
};
// {level: {skill: points added}} for levels a..b
const gRange = (a, b, o) => Object.fromEntries(Array.from({length: b - a + 1}, (_, i) => [a + i, o]));
const GM = {rain: "10001070", garden: "10001021", sf1: "10002031", lith: "10000010", fun4: "10002075", sf3: "10002033", sf4: "10002034",
  fun1: "10002072", line1: "10003061", transfer: "10003062", hillw: "10001020", damp: "10005031", steam: "10005065"};
const GUIDE = {
  Warrior: {
    start: {STR: 12, DEX: 5},
    sp: {10: {"Power Strike": 1}, 11: {"Power Strike": 2, "Slash Blast": 1}, 12: {"Power Strike": 1, "Slash Blast": 2},
      13: {"Slash Blast": 1, "Precise Strikes": 2}, 14: {"Precise Strikes": 3}, ...gRange(15, 19, {"Power Strike": 3}),
      20: {"Power Strike": 1, "Slash Blast": 2}, ...gRange(21, 24, {"Slash Blast": 3}), 25: {"Slash Blast": 2, "Precise Strikes": 1},
      ...gRange(26, 28, {"Precise Strikes": 3}), 29: {"Improved HP Recovery": 3}, 30: {"Max HP Increase": 3}},
    ap: [[11, 12, {STR: 4, DEX: 1}], [13, 14, {STR: 3, DEX: 2}], [15, 19, {STR: 4, DEX: 1}], [20, 20, {STR: 3, DEX: 2}], [21, 29, {STR: 4, DEX: 1}], [30, 30, {STR: 5}]],
    weapons: {10: ["Wooden Sword", "Metal Axe", "Long Sword"], 15: ["Sabre", "Battle Axe"], 20: ["Two-Handed Sword", "Viking Sword", "Iron Axe"],
      25: ["Broadsword", "Mithril Axe", "Two-Handed Axe"], 30: ["Scimitar", "Blue Axe", "Gladius", "Fireman's Axe"]},
    gear: {10: "Metal Koif (+1 DEX, +2 ACC; Smithing Lv 1 craft), Juno (+1 ACC; Stump drop or Smithing Lv 2). River in Perion sells the weapons.",
      15: "Steel Fitted Mail (+2 STR, +1 DEX; female characters only until the Kendo Robes at 20). River and Harry in Perion.",
      20: "Red Kendo Robe (+4 STR; Harry), Iron Viking Helm (+2 DEX, +3 ACC; Smithing Lv 4). The guide's DEX counts the helmet's +2 for 20-DEX weapons.",
      25: "White Fingerless Gloves (+2 ACC, +1% crit; Smithing Lv 5).",
      30: "Jousting Helmet (+3 DEX, +3 ACC; Harry), Red Cross Shield (River), Steel Missel (+3 STR; Smithing Lv 6). The helmet's DEX gets you to 30 for Blue Axe or Scimitar."},
    maps: {10: [GM.rain, GM.garden], 15: [GM.sf1, GM.lith], 20: [GM.fun4, GM.sf3], 25: [GM.fun4, GM.sf3], 30: [GM.line1, GM.fun4]},
    town: ["Henesys", "Arthur in Henesys Town Hall", "Raymond sells Supreme Sniper Potion (+7 ACC); later grades add Overall STR and Gloves Attack scrolls."],
    skills: "Power Strike first for sure kills, then Slash Blast (use it on 3+ monsters) and Precise Strikes; 3 each in Improved HP Recovery and Max HP Increase at 29-30."
  },
  Magician: {
    start: {INT: 12, LUK: 5},
    sp: {10: {"Energy Bolt": 1}, 11: {"Energy Bolt": 2, "Improved MP Recovery": 1}, ...gRange(12, 16, {"Energy Bolt": 3}),
      17: {"Energy Bolt": 2, "Magic Guard": 1}, 18: {"Magic Guard": 2, "Improved MP Recovery": 1}, 19: {"Improved MP Recovery": 1, "Max MP Increase": 2},
      ...gRange(20, 25, {"Magic Armor": 3}), 26: {"Magic Armor": 2, "Max MP Increase": 1}, ...gRange(27, 30, {"Max MP Increase": 3})},
    ap: [[11, 19, {INT: 5}], [20, 20, {LUK: 5}], [21, 24, {INT: 5}], [25, 25, {LUK: 5}], [26, 29, {INT: 5}], [30, 30, {LUK: 5}]],
    weapons: {10: ["Wooden Wand"], 15: ["Hardwood Wand"], 20: ["Metal Wand"], 25: ["Ice Wand"], 30: ["Mithril Wand"]},
    gear: {10: "You get a free Beginner's Wooden Wand (26 M.ATK) at advancement; the shop Wooden Wand has 27. Brown Apprentice Hat. Always wear a shield: Stolen Fence (Silver, Lith Harbor) or Pan Lid (Green Mushroom drop).",
      15: "Blue Plain Robe (+3 INT, male) or Yellow Arianne + skirt (+1 INT each, female). Flora the Fairy (wands) and Serabi the Fairy (armor) in Ellinia.",
      20: "Blue Morrican (+2 INT, +1% crit). Mystic Shield at 22 (needs 34 INT, 12 LUK).",
      25: "Blue Doros Robe (+5 INT, male) or Brown Doroness Robe (+5 INT, female).",
      30: "Blue Wizard Robe (+6 INT, male) or Blue Fairy Top + Skirt (+3 INT each, female)."},
    maps: {10: [GM.rain, GM.hillw], 15: [GM.rain, GM.hillw], 20: [GM.transfer, GM.fun1], 25: [GM.line1, GM.fun4], 30: [GM.transfer, GM.sf4]},
    town: ["Kerning City", "Roxy in the Kerning City Civic Center", "The scroll shop later unlocks Overall Armor INT and Gloves Magic Attack scrolls."],
    skills: "Max Energy Bolt by 17 (same damage as Magic Claw for less MP), Magic Guard 3 to open Magic Armor, Armor to 20, then Max MP Increase."
  },
  Bowman: {
    start: {DEX: 12, STR: 5},
    sp: {10: {"Arrow Blow": 1}, 11: {"Arrow Blow": 3}, 12: {"Arrow Blow": 2, "The Eye of Amazon": 1}, ...gRange(13, 14, {"Arrow Blow": 3}),
      15: {"Arrow Blow": 1, "The Eye of Amazon": 2}, ...gRange(16, 17, {"Arrow Blow": 3}), 18: {"Arrow Blow": 1, "Critical Shot": 2},
      ...gRange(19, 22, {"Critical Shot": 3}), 23: {"Critical Shot": 1, "The Eye of Amazon": 2}, ...gRange(24, 26, {"The Eye of Amazon": 3}),
      27: {"The Eye of Amazon": 1, "Focus": 2}, ...gRange(28, 29, {"Focus": 3}), 30: {"Focus": 2, "Power Knockback": 1}},
    ap: [[11, 15, {STR: 2, DEX: 3}], [16, 30, {STR: 1, DEX: 4}]],
    apXbow: [[11, 15, {DEX: 5}], [16, 30, {STR: 1, DEX: 4}]],   // crossbows need less STR
    weapons: {10: ["War Bow", "Crossbow"], 15: ["Composite Bow", "Battle Crossbow"], 20: ["Hunter's Bow", "Balanche"], 25: ["Battle Bow", "Mountain Crossbow"], 30: ["Ryden", "Eagle Crow"]},
    gear: {10: "Green Winter Hat, Green Archer Top. Karl sells the bows and crossbows in Henesys, Sam the armor.",
      15: "Green Feather Hat, Basic Archer Gloves (gloves are Leatherworking Lv 3-6 crafts).", 20: "Green Robin Hat, Blue Diros.",
      25: "Green Hunter, Blue Savata.", 30: "Green Hawkeye, Green Marker. Any class can wear a Sauna Robe at 30 (+1 all stats, 10 slots)."},
    ammo: {from: 25, Bow: "Bronze Arrows for Bows", Crossbow: "Bronze Arrows for Crossbows",
      txt: "Bronze arrows (+1 ATK, 2 mesos each) from Raymond in Henesys once your citizenship reaches Helpful Stranger (grade 3: level 22 and 2,000 contribution). The plan assumes you get there by 25."},
    maps: {15: [GM.sf1, GM.garden], 20: [GM.fun4, GM.sf3], 25: [GM.fun4, GM.sf3], 30: [GM.transfer, GM.line1]},
    town: ["Henesys", "Arthur in Henesys Town Hall", "Raymond sells Supreme Sniper Potion (+7 ACC) and, at grade 3, Bronze arrows."],
    skills: "Arrow Blow (less MP, one arrow, 50 px more range than Double Shot) with Eye of Amazon 1 at 12 and 3 at 15, Arrow Blow max at 18, then Critical Shot, Eye, Focus."
  },
  Thief: {
    start: {LUK: 12, DEX: 5},
    sp: {10: {"Lucky Seven": 1}, 11: {"Nimble Body": 3}, 12: {"Keen Eyes": 1, "Lucky Seven": 2}, ...gRange(13, 17, {"Lucky Seven": 3}),
      18: {"Lucky Seven": 2, "Keen Eyes": 1}, ...gRange(19, 22, {"Keen Eyes": 3}), 23: {"Keen Eyes": 1, "Nimble Body": 2},
      ...gRange(24, 26, {"Nimble Body": 3}), 27: {"Nimble Body": 1, "Disorder": 2}, 28: {"Disorder": 1, "Dark Sight": 2}, ...gRange(29, 30, {"Dark Sight": 3})},
    ap: [[11, 13, {LUK: 5}], [14, 15, {DEX: 5}], [16, 19, {LUK: 5}], [20, 20, {DEX: 5}], [21, 24, {LUK: 5}], [25, 25, {DEX: 5}], [26, 29, {LUK: 5}], [30, 30, {DEX: 5}]],
    weapons: {10: ["Beginner's Garnier"], 15: ["Steel Titans"], 20: ["Steel Igor"], 25: ["Meba"], 30: ["Adamantium Guards"]},
    claw: true,   // future Bandits level as a "Sindit": claw + Lucky Seven through 1st job
    gear: {10: "Beginner's Garnier comes free when you become a Rogue; Subi stars from Dr. Faymus, Black Ghetto Beanie (+1 LUK) from Don Hwang, Kerning City.",
      15: "Black Duo (+1 LUK). Cutthroat Manny sells the claws.", 20: "Black Loosecap (+2 LUK; Don Hwang).",
      25: "Dark Wolfskin (+2 LUK). Meba is the only Speed 3 claw before 30.", 30: "Dark Guise (+3 LUK; Don Hwang), Steel Sylvia, Sauna Robe from Mr. Wetbottom's chain in Sleepywood."},
    ammo: {from: 25, Claw: "Wolbi Throwing Stars",
      txt: "Wolbi stars (+17 ATK vs Subi's +15, 1,000 mesos) from Max in the Kerning City Civic Center once your citizenship reaches Helpful Stranger (grade 3: level 22 and 2,000 contribution, about two weeks of dailies). The plan assumes you get there by 25."},
    maps: {10: [GM.rain, GM.sf1], 15: [GM.fun4, GM.sf3], 20: [GM.transfer, GM.damp], 25: [GM.transfer, GM.steam], 30: [GM.transfer, GM.steam]},
    town: ["Kerning City", "Roxy in the Kerning City Civic Center", "Max sells Wolbi stars at grade 3; later grades add Overall LUK and Gloves Attack scrolls."],
    skills: "Lucky Seven for every Thief (future Bandits too), Keen Eyes 1 at 12 for +50 range, Lucky Seven max at 18, then Keen Eyes, Nimble Body, Disorder 3 and Dark Sight."
  }
};
const GUIDE_FREE = {"Beginner's Garnier": "Given free when you become a Rogue (meowdb Thief guide).", "Beginner's Wooden Wand": "Given free when you become a Magician (meowdb Magician guide)."};
// checkpoint level of a guide table at level L (the highest key <= L), or null
const guideAt = (tbl, L) => { const ks = Object.keys(tbl || {}).map(Number).filter(k => k <= L); return ks.length ? Math.max(...ks) : null };
// base AP at level L following the guide (creation stats, all level 2-10 AP in the main stat, then the guide's table)
function guideAP(cls, L, fam){
  const g = GUIDE[cls], ap = {STR: 4, DEX: 4, INT: 4, LUK: 4};
  Object.assign(ap, g.start);
  const main = Object.keys(g.start)[0];
  ap[main] += 5 * (Math.min(L, 10) - 1);
  for (const [a, b, o] of (fam === "Crossbow" && g.apXbow) || g.ap) for (let l = a; l <= Math.min(b, L); l++) for (const k in o) ap[k] += o[k];
  return ap;
}
// first-job skill points by name at level L (levels above 30 keep the level-30 result)
function guideSP(cls, L){
  const out = {};
  for (const [l, o] of Object.entries(GUIDE[cls].sp)) if (+l <= L) for (const k in o) out[k] = (out[k] || 0) + o[k];
  return out;
}
// "Power Strike +2, Slash Blast +1 · STR +4, DEX +1" for one level-up
function guideLevelText(cls, L, fam){
  const g = GUIDE[cls], sp = Object.entries(g.sp[L] || {}).map(([k, v]) => `${k} +${v}`);
  if (L <= 10) sp.push(`${L <= 4 ? "Nimble Feet" : L <= 7 ? "Three Snails" : "Recovery"} +1`);   // beginner guide order
  const ap = {}; if (L <= 10) ap[Object.keys(g.start)[0]] = 5;
  for (const [a, b, o] of (fam === "Crossbow" && g.apXbow) || g.ap) if (L >= a && L <= b) Object.assign(ap, o);
  return [sp.join(", "), Object.entries(ap).map(([k, v]) => `${k} +${v}`).join(", ")].filter(Boolean).join(" · ");
}
