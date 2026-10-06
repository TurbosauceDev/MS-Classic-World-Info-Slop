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

/* meowdb second-job guides, levels 30-70 (read 2026-10-06): one per branch. {W} = the weapon family's skill name
   (Sword, Axe, Blunt Weapon, Spear, Polearm). Maps are names (resolved to open launch maps at run time). */
const GUIDE2_SRC = b => `https://meowdb.com/msclassic/guides/${{"F/P Wizard": "fp-wizard", "I/L Wizard": "il-wizard"}[b] || b.toLowerCase()}-class-guide`;
const WAR_AP = [[31, 36, {STR: 3, DEX: 2}], [37, 57, {STR: 4, DEX: 1}], [58, 70, {STR: 5}]];
const MAGE_AP = [[31, 40, {INT: 3, LUK: 2}], [41, 63, {INT: 4, LUK: 1}], [64, 70, {INT: 5}]];
const WAR30 = ["Line 1 <Area 1>", "Tree Dungeon, Forest Up North IV"], MAGE30 = ["Transfer Area", "Dungeon, Southern Forest IV"];
const MAGE_W = {30: ["Mithril Wand"], 40: ["Fairy Wand"], 45: ["Arc Staff"], 50: ["Cromi"], 55: ["Thorns"], 60: ["Evil Tale"], 65: ["Evil Wings"], 70: ["Angel Wings"]};
const MAGE_SP = (main, aoe) => ({30: {"Teleport": 1}, ...gRange(31, 39, {[main]: 3}), 40: {[main]: 3}, ...gRange(41, 50, {[aoe]: 3}),
  51: {"MP Eater": 3}, ...gRange(52, 57, {"Meditation": 3}), 58: {"Meditation": 2, "MP Eater": 1}, ...gRange(59, 63, {"MP Eater": 3}),
  64: {"MP Eater": 1, "Teleport": 2}, ...gRange(65, 69, {"Teleport": 3}), 70: {"Teleport": 2, "Slow": 1}});
const GUIDE2 = {
  Fighter: {ap: WAR_AP,
    sp: {30: {"Rush": 1}, 31: {"Rage": 1, "{W} Mastery": 2}, 32: {"{W} Mastery": 3}, 33: {"{W} Booster": 1, "Final Attack: {W}": 1, "{W} Mastery": 1},
      ...gRange(34, 37, {"{W} Mastery": 3}), 38: {"{W} Mastery": 2, "Final Attack: {W}": 1}, ...gRange(39, 47, {"Rage": 3}), 48: {"Rage": 2, "Final Attack: {W}": 1},
      ...gRange(49, 57, {"Final Attack: {W}": 3}), ...gRange(58, 63, {"{W} Booster": 3}), 64: {"{W} Booster": 1, "Rush": 2}, ...gRange(65, 69, {"Rush": 3}), 70: {"Rush": 2}},
    weapons: {30: ["Gladius", "Fireman's Axe", "Scimitar", "Blue Axe"], 40: ["Traus", "Blue Counter", "Zard", "Sabretooth"], 50: ["Jeweled Katar", "Buck", "Lion's Fang", "The Rising"],
      60: ["Neocora", "Hawkhead", "Sparta", "The Shining"], 70: ["Red Katana", "Mikhail", "Doombringer", "Chrono"]},
    maps: {30: WAR30, 35: ["Ant Tunnel II", "Ant Tunnel III"], 40: ["Ant Tunnel Park", "Deep Ant Tunnel II"], 45: ["The Burnt Land I", "The Burnt Land III"],
      50: ["Tree Dungeon, Monkey Forest II", "Monkey Forest II"], 55: ["The Forest of Evil II", "Perilous Descent III"], 60: ["The Forest of Evil II", "Line 2 <Area 3>"],
      65: ["Perilous Descent III", "The Forest of Evil II"], 70: ["Perilous Descent III", "The End of Fleeting Light"]},
    note: "Rush first, then Rage, Mastery, Booster and Final Attack. Choose sword or axe before spending weapon SP. Sabretooth and The Rising are Weaponcrafting 8 and 10 crafts; most 40+ weapons are drops or Free Market."},
  Page: {ap: WAR_AP,
    sp: {30: {"Rush": 1}, 31: {"{W} Mastery": 3}, 32: {"{W} Mastery": 2, "{W} Booster": 1}, 33: {"Threaten": 1, "{W} Mastery": 2}, ...gRange(34, 37, {"{W} Mastery": 3}),
      38: {"{W} Mastery": 1, "Final Attack: {W}": 2}, ...gRange(39, 47, {"Final Attack: {W}": 3}), 48: {"Final Attack: {W}": 1, "Threaten": 2}, ...gRange(49, 57, {"Threaten": 3}),
      58: {"{W} Booster": 3}, ...gRange(59, 63, {"{W} Booster": 3}), 64: {"{W} Booster": 1, "Rush": 2}, ...gRange(65, 69, {"Rush": 3}), 70: {"Rush": 2}},
    weapons: {30: ["War Hammer", "Mithril Maul", "Gladius", "Scimitar"], 35: ["Heavy Hammer", "Sledgehammer"], 40: ["Jacker", "Titan", "Traus", "Zard"],
      50: ["Knuckle Mace", "Golden Mole", "Jeweled Katar", "Lion's Fang"], 60: ["Tamus", "The Blessing", "Neocora", "Sparta"], 70: ["The Judgement", "Gigantic Sledge", "Red Katana", "Doombringer"]},
    maps: {30: WAR30, 35: ["Ant Tunnel II", "Ant Tunnel III"], 40: ["Ant Tunnel Park", "Deep Ant Tunnel II"], 50: ["Tree Dungeon, Forest Up North IX", "Tree Dungeon, Forest Up North VIII"],
      55: ["Monkey Forest II", "Tree Dungeon, Forest Up North IX"], 60: ["The Forest of Evil II", "Forgotten Entrance III"], 65: ["Tree Dungeon, Monkey Forest II", "Monkey Forest II"],
      70: ["The End of Fleeting Light", "Collision of Ice and Fire"]},
    note: "Rush, then Mastery, Booster, Final Attack and Threaten. The guide is written for blunt weapons; sword Pages use the Fighter guide's swords at the same levels. Titan and Golden Mole are Weaponcrafting 8 and 10 crafts."},
  Spearman: {ap: WAR_AP,
    sp: {30: {"Rush": 1}, 31: {"{W} Mastery": 3}, 32: {"{W} Mastery": 2, "{W} Booster": 1}, 33: {"{W} Mastery": 1, "Final Attack: {W}": 2}, ...gRange(34, 37, {"{W} Mastery": 3}),
      38: {"{W} Mastery": 2, "Final Attack: {W}": 1}, ...gRange(39, 47, {"Final Attack: {W}": 3}), 48: {"{W} Booster": 3}, ...gRange(49, 53, {"{W} Booster": 3}),
      54: {"{W} Booster": 1, "Rush": 2}, ...gRange(55, 59, {"Rush": 3}), 60: {"Rush": 2, "Iron Will": 1}, ...gRange(61, 69, {"Iron Will": 3}), 70: {"Iron Will": 2}},
    weapons: {30: ["Forked Spear", "Mithril Pole Arm"], 35: ["Nakamaki", "Axe Pole Arm"], 40: ["Zeco", "Crescent Polearm"], 50: ["Serpent's Tongue", "The Nine Dragons"],
      60: ["Holy Spear", "Skylar"], 70: ["Redemption", "The Gold Dragon"]},
    maps: {30: WAR30, 35: ["Ant Tunnel IV", "Ant Tunnel I"], 40: ["Ant Tunnel II", "Ant Tunnel III"], 50: ["The Burnt Land I", "The Burnt Land III"],
      60: ["The Faded Canopy", "Perilous Descent I"], 65: ["Perilous Descent III", "Perilous Descent II"], 70: ["The Forest of Evil II", "Perilous Descent III"]},
    note: "Rush, then Mastery, Final Attack, Booster and Iron Will. River or Scott sell the 30-35 spears; Axe Pole Arm, Crescent Polearm and The Nine Dragons are Weaponcrafting 7, 8 and 10."},
  Hunter: {ap: [[31, 70, {STR: 1, DEX: 4}]],
    sp: {30: {"Arrow Bomb: Bow": 1}, 31: {"Bow Mastery": 3}, 32: {"Bow Mastery": 2, "Bow Booster": 1}, 33: {"Bow Booster": 3}, 34: {"Bow Booster": 1, "Soul Arrow: Bow": 1, "Bow Mastery": 1},
      ...gRange(35, 38, {"Bow Mastery": 3}), 39: {"Bow Mastery": 2, "Final Attack: Bow": 1}, ...gRange(40, 48, {"Arrow Bomb: Bow": 3}), 49: {"Arrow Bomb: Bow": 2, "Final Attack: Bow": 1},
      ...gRange(50, 58, {"Final Attack: Bow": 3}), 59: {"Final Attack: Bow": 1, "Amazon's Judgement": 2}, ...gRange(60, 65, {"Amazon's Judgement": 3}), 66: {"Bow Booster": 3},
      67: {"Bow Booster": 2, "Soul Arrow: Bow": 1}, ...gRange(68, 70, {"Soul Arrow: Bow": 3})},
    weapons: {30: ["Ryden"], 35: ["Red Viper"], 40: ["Vaulter 2000"], 50: ["Olympus"], 60: ["Asianic Bow"], 70: ["Golden Hinkel"]},
    maps: {30: ["Transfer Area", "Line 1 <Area 1>"], 40: ["Dangerous Steam", "Dark Cave"], 50: ["Ant Tunnel Park", "Ant Tunnel III"], 60: ["The Burnt Land V", "The Burnt Land IV"],
      70: ["Line 1 <Area 2>", "Monkey Forest II"]},
    note: "Arrow Bomb 1 first, then Mastery and Booster before maxing Arrow Bomb. No shop sells the 35-60 bows: Red Viper, Vaulter 2000 and Olympus are Woodcrafting 7, 8 and 10 crafts (start Woodcrafting by 25 for the Olympus)."},
  Crossbowman: {ap: [[31, 70, {STR: 1, DEX: 4}]],
    sp: {30: {"Iron Arrow: Crossbow": 1}, 31: {"Crossbow Mastery": 3}, 32: {"Crossbow Mastery": 2, "Crossbow Booster": 1}, 33: {"Crossbow Booster": 2, "Final Attack: Crossbow": 1},
      34: {"Crossbow Booster": 1, "Soul Arrow: Crossbow": 1, "Crossbow Mastery": 1}, ...gRange(35, 38, {"Crossbow Mastery": 3}), 39: {"Crossbow Mastery": 2, "Crossbow Booster": 1},
      ...gRange(40, 48, {"Iron Arrow: Crossbow": 3}), 49: {"Iron Arrow: Crossbow": 2, "Amazon's Judgement": 1}, ...gRange(50, 55, {"Amazon's Judgement": 3}),
      56: {"Amazon's Judgement": 1, "Crossbow Booster": 2}, ...gRange(57, 60, {"Crossbow Booster": 3}), 61: {"Crossbow Booster": 1, "Soul Arrow: Crossbow": 2},
      ...gRange(62, 66, {"Soul Arrow: Crossbow": 3}), 67: {"Soul Arrow: Crossbow": 2, "Final Attack: Crossbow": 1}, ...gRange(68, 70, {"Final Attack: Crossbow": 3})},
    weapons: {30: ["Eagle Crow"], 40: ["Heckler"], 50: ["Rower"], 60: ["Golden Crow"], 70: ["Gross Jaeger"]},
    maps: {30: ["Transfer Area", "Line 1 <Area 1>"], 40: ["Dark Cave", "Dangerous Steam"], 50: ["The Burnt Land V", "Monkey Forest II"], 60: ["The Burnt Land V", "Line 1 <Area 2>"],
      70: ["Forgotten Entrance III", "Lorang Lorang"]},
    note: "Iron Arrow 1 first, then Mastery and Booster before maxing Iron Arrow. Every crossbow from Heckler on needs STR = its level minus 10."},
  Assassin: {ap: [[31, 70, {DEX: 1, LUK: 4}]],
    sp: {30: {"Haste": 1}, 31: {"Claw Mastery": 3}, 32: {"Claw Mastery": 2, "Claw Booster": 1}, ...gRange(33, 37, {"Claw Mastery": 3}), ...gRange(38, 47, {"Critical Throw": 3}),
      ...gRange(48, 53, {"Haste": 3}), 54: {"Haste": 1, "Claw Booster": 2}, ...gRange(55, 56, {"Claw Booster": 3}), ...gRange(57, 62, {"Critical Recovery": 3}),
      63: {"Critical Recovery": 2, "Claw Booster": 1}, ...gRange(64, 66, {"Claw Booster": 3}), 67: {"Claw Booster": 1, "Drain": 2}, ...gRange(68, 70, {"Drain": 3})},
    weapons: {30: ["Adamantium Guards"], 35: ["Dark Guardian"], 50: ["Dark Slain"], 60: ["Dark Gigantic"], 70: ["Black Scarab"]},
    maps: {30: ["Transfer Area", "Dangerous Steam"], 35: ["Ant Tunnel II"], 40: ["Ant Tunnel Park", "Deep Ant Tunnel II"], 50: ["Monkey Forest II", "Forgotten Entrance II"],
      60: ["Monkey Forest II", "Tree Dungeon, Monkey Forest II"], 70: ["The Forest of Evil II", "Tree Dungeon, Monkey Forest II"]},
    note: "Haste 1, then max Claw Mastery (it adds Attack Power and opens Booster) and Critical Throw. Dark Guardian and the Slains are Weaponcrafting 7 and 10 crafts. Buy the best stars you can afford; carry several stacks."},
  Bandit: {ap: [[31, 61, {DEX: 1, LUK: 4}], [62, 70, {LUK: 5}]],
    // "Sindit": Lucky Seven and a claw until 40, then an SP Reset Scroll (Cash Shop, 7,000 NX) moves first-job SP to Double Stab
    reset: {at: 40, first: {"Nimble Body": 15, "Disorder": 20, "Dark Sight": 6, "Double Stab": 20}},
    sp: {30: {"Haste": 1}, ...gRange(31, 36, {"Haste": 3}), 37: {"Haste": 1, "Nimble Recovery": 2}, ...gRange(38, 39, {"Nimble Recovery": 3}),
      40: {"__reset": 1, "Dagger Mastery": 20, "Dagger Booster": 1, "Savage Blow": 10}, ...gRange(41, 43, {"Savage Blow": 3}), 44: {"Savage Blow": 2, "Haste": 1},
      ...gRange(45, 47, {"Savage Blow": 3}), ...gRange(48, 53, {"Haste": 3}), 54: {"Haste": 1, "Nimble Recovery": 2}, ...gRange(55, 57, {"Nimble Recovery": 3}),
      58: {"Nimble Recovery": 1, "Steal": 2}, ...gRange(59, 67, {"Steal": 3}), 68: {"Steal": 1, "Dagger Booster": 2}, ...gRange(69, 70, {"Dagger Booster": 3})},
    weapons: {30: ["Adamantium Guards"], 40: ["Gephart"], 50: ["Shinkita"], 60: ["Deadly Fin"], 70: ["Kandine"]},
    maps: {30: ["Transfer Area", "Dangerous Steam"], 35: ["Ant Tunnel II"], 40: ["Ant Tunnel Park", "Deep Ant Tunnel II"], 42: ["The Burnt Land I", "The Burnt Land III"],
      45: ["Tree Dungeon, Forest Up North IX", "The Burnt Land V"], 50: ["Tree Dungeon, Monkey Forest II", "Monkey Forest II"], 55: ["Primeval Forest I"],
      60: ["Perilous Descent III", "The End of Fleeting Light"], 65: ["The Forest of Evil II", "Perilous Descent III"]},
    note: "Level as a \"Sindit\": keep Lucky Seven and a claw, Haste first. At 40 an SP Reset Scroll (7,000 NX) moves first-job SP into Double Stab and you switch to DEX daggers; Savage Blow takes over at 42. Without a reset, the guide's alternative needs a dagger first-job build from level 10."},
  "F/P Wizard": {ap: MAGE_AP, sp: MAGE_SP("Fire Arrow", "Poison Breath"), weapons: MAGE_W,
    maps: {30: MAGE30, 40: ["Line 1 <Area 2>", "Ant Tunnel Park"], 50: ["Ant Tunnel III", "Tree Dungeon, Forest Up North IX"], 60: ["Ant Tunnel Park", "Forgotten Dungeon Tunnel"],
      70: ["Line 1 <Area 2>", "Line 2 <Area 3>"]},
    note: "Teleport 1, max Fire Arrow, then Poison Breath (swap them if you hit 3+ monsters per cast), Meditation, MP Eater. Spells always cast at the same speed, so take the highest Magic Attack you can equip, plus a shield (Pan Lid's Guard is best)."},
  "I/L Wizard": {ap: MAGE_AP, sp: MAGE_SP("Cold Beam", "Thunder Bolt"), weapons: MAGE_W,
    maps: {30: MAGE30, 40: ["The Burnt Land I", "Ant Tunnel Park"], 50: ["Ant Tunnel IV", "Tree Dungeon, Forest Up North IX"], 60: ["Ant Tunnel III", "Perilous Descent III"],
      70: ["Line 1 <Area 2>", "Line 2 <Area 3>"]},
    note: "Teleport 1, max Cold Beam, then Thunder Bolt (swap them if you hit 3+ monsters per cast), Meditation, MP Eater. Fire Boars and Copper Drakes are ice-weak; Aqumander resists ice but is lightning-weak."},
  Cleric: {ap: [[31, 70, {INT: 4, LUK: 1}]],
    sp: {30: {"Heal": 1}, 31: {"Teleport": 1, "MP Eater": 1, "Heal": 1}, ...gRange(32, 41, {"Holy Arrow": 3}), 42: {"Heal": 3}, ...gRange(43, 48, {"Invincible": 3}),
      49: {"Invincible": 2, "MP Eater": 1}, ...gRange(50, 55, {"MP Eater": 3}), ...gRange(56, 61, {"Teleport": 3}), 62: {"Teleport": 1, "Heal": 2}, ...gRange(63, 69, {"Heal": 3}), 70: {"Heal": 2, "Bless": 1}},
    weapons: {30: ["Mithril Wand"], 40: ["Fairy Wand"], 50: ["Cromi"], 55: ["Thorns"], 60: ["Evil Tale"], 65: ["Evil Wings"], 70: ["Angel Wings"]},
    maps: {30: MAGE30, 41: ["Line 1 <Area 1>", "Line 1 <Area 2>"], 50: ["Ant Tunnel II", "Ant Tunnel III"], 70: ["Ant Tunnel Park", "Line 2 <Area 3>"]},
    note: "Solo order: Heal and Teleport 1, max Holy Arrow (keep Energy Bolt until Holy Arrow beats it, around 38-41), Invincible, MP Eater, Teleport, Heal. Party Clerics put 15 of Invincible's points into Bless. Green Goldwind Shoes (Tailoring 10, +5 LUK) cover the LUK for every wand from 50."}
};
// second-job skill points by name at level L (levels above 70 keep the level-70 result); "{W}" -> weapon family; a
// "__reset" level (Bandit SP reset) throws away what came before
const famSkill = fam => fam === "Blunt" ? "Blunt Weapon" : fam;
function guideSP2(branch, L, fam){
  const g = GUIDE2[branch], out = {}; if (!g) return out;
  for (const [l, o] of Object.entries(g.sp).sort((a, b) => a[0] - b[0])) if (+l <= L){
    if (o.__reset) for (const k in out) delete out[k];
    for (const k in o) if (k !== "__reset"){ const n = k.replace("{W}", famSkill(fam)); out[n] = (out[n] || 0) + o[k] }
  }
  return out;
}
// AP rules after 30 (the last rule carries on above 70)
const apRule = (rules, L) => rules.find(([a, b]) => L >= a && L <= b) || (L > rules[rules.length - 1][1] ? rules[rules.length - 1] : null);
function guideAP2(cls, branch, L, fam){
  const ap = guideAP(cls, 30, fam), g = GUIDE2[branch]; if (!g) return ap;
  for (let l = 31; l <= L; l++){ const r = apRule(g.ap, l); if (r) for (const k in r[2]) ap[k] += r[2][k] }
  return ap;
}
// "Rage +1, Axe Mastery +2 · STR +3, DEX +2" for a level-up past 30
function guideLevelText2(branch, L, fam){
  const g = GUIDE2[branch]; if (!g) return "";
  const o = g.sp[L] || {}, r = apRule(g.ap, L);
  const sp = o.__reset ? [`SP reset: ${Object.entries(g.reset.first).map(([k, v]) => `${k} ${v}`).join(", ")}; then ${Object.entries(o).filter(([k]) => k !== "__reset").map(([k, v]) => `${k.replace("{W}", famSkill(fam))} ${v}`).join(", ")}`]
    : Object.entries(o).map(([k, v]) => `${k.replace("{W}", famSkill(fam))} +${v}`);
  return [sp.join(", "), r ? Object.entries(r[2]).map(([k, v]) => `${k} +${v}`).join(", ") : ""].filter(Boolean).join(" · ");
}
