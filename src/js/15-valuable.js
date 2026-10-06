/* ---------------- valuable quests ----------------
   Community picks, not game data: tiers and reasons from the guides in VSRC (read 2026-10-06). Reddit was not reachable.
   quest id -> [tier 1-5, reward, why, class only (or ""), sources]. Forgotten Hollow picks are left out (not at launch). */
const VSRC = {
  mr: ["metaroad.gg Must-Do Quests guide (Jota, Sep 2026)", "https://metaroad.gg/maplestory-classic/archives/must-do-quests-valuable-rewards-guide"],
  mq: ["maplestory.quest Valuable quest rewards (Chief Stan)", "https://maplestory.quest/guides/valuable-quest-rewards"],
  mdb: ["meowdb Beginner's Guide (Oct 2026)", "https://meowdb.com/msclassic/guides/beginners-guide-first-steps-in-maple-world"]
};
const VTIER = {1:["Must do","p-hot"], 2:["Recommended","p-good"], 3:["Worth doing","p-good"], 4:["Situational","p-warn"], 5:["Skip","p-bad"]};
const VALUE = {
  "1012":  [1, "The Green Relaxer chair", "Untradeable chair you can only get on Maple Island. Do it before boarding the ship.", "", ["mr","mdb"]],
  "10305": [2, "Work Gloves", "All-class gloves with 5 slots: an early scrolling base without buying one. Nella charges 1,000 mesos to start the chain.", "", ["mr","mdb"]],
  "10400": [4, "Wooden Buckler (90%) / Steel Shield (10%)", "Only for shield users (Warrior-only shields). Easy if you're training around Perion anyway.", "Warrior", ["mr"]],
  "10104": [3, "Random Hat Accuracy scroll", "Accuracy matters in Classic. Save your Green and Blue Mushroom Caps.", "", ["mr"]],
  "10302": [3, "Weighted Earrings or Yellow Square", "End of Alex's chain: 3,701 EXP, 10 Blue Potions and earrings. Nice, not mandatory.", "", ["mr","mdb"]],
  "10113": [3, "Random refined gem", "Gems feed crafting. Easy if you're already killing Jr. Neckis and Stirges.", "", ["mr"]],
  "10002": [2, "Random Intermediate weapon scroll", "First quest where the item is worth more than the EXP. Check the scroll's price even if it's for another class.", "", ["mr","mdb"]],
  "10112": [3, "Brown Bamboo Hat", "Lv 25 hat: 24 W.DEF, +1 ACC, +10 HP, 7 slots. Long 7-quest chain (14,693 EXP total), so good but not mandatory.", "", ["mr"]],
  "10311": [2, "+1 Fame, random Earring stat scroll (60%)", "Have it active before you kill King Slime in Kerning PQ. Free scroll for a boss you'd kill anyway.", "", ["mr"]],
  "10308": [3, "Class shoes", "End of Nella's level 22 set (6,918 EXP total). Easy side goal while grinding Evil Eyes.", "", ["mr"]],
  "10310": [2, "Old Raggedy Cape", "Early cape with 5 slots. The guide says the chain deserves priority.", "", ["mr","mdb"]],
  "10105": [4, "30% Pig Illustrated, else 30 Cakes", "Lv 25 weapon lottery. Easy, but don't count on the weapon.", "", ["mq","mr"]],
  "10510": [3, "Star Rock, +2 Fame, free Forest of Patience entry", "Keep the Star Rock: Manji's Old Gladius at 50 needs it. Jump quest.", "", ["mr"]],
  "10509": [4, "Random Overall DEF scroll, +1 Fame", "DEF scrolls sell poorly. Do it for the jump quest or because it unlocks Anti-Aging Medicine.", "", ["mq","mr"]],
  "80009": [1, "Smithing catalyst", "Profession step at crafting Lv 5. Mandatory if you craft, useless if you don't.", "", ["mq","mr"]],
  "80012": [1, "Weaponcrafting catalyst", "Profession step at crafting Lv 5. Mandatory if you craft.", "", ["mq","mr"]],
  "80015": [1, "Tailoring catalyst", "Profession step at crafting Lv 5. Mandatory if you craft.", "", ["mq","mr"]],
  "80018": [1, "Carpentry catalyst", "Profession step at crafting Lv 5. Mandatory if you craft.", "", ["mq","mr"]],
  "80021": [1, "Leatherworking catalyst", "Profession step at crafting Lv 5. Mandatory if you craft.", "", ["mq","mr"]],
  "80024": [1, "Arcforging catalyst", "Profession step at crafting Lv 5. Mandatory if you craft.", "", ["mq","mr"]],
  "10200": [4, "Piece of Ice or Fairy Wing (repeatable)", "Piece of Ice is needed for the Old Gladius at 50. Keep any Arwen's Glass Shoe from Fire Boars.", "", ["mq","mr"]],
  "10317": [2, "Starts the Icarus chain", "Start at 31: it's the first step toward the Icarus Cape at 46. Save Stirge Wings, Stiff Feathers, Processed Wood.", "", ["mr"]],
  "10508": [1, "Sauna Robe (Blue male / Red female)", "All-class overall with 10 slots, tradeable. Both guides call it a must. Don't sell it to an NPC.", "", ["mq","mr"]],
  "10314": [3, "10,000 mesos, +3 Fame, 30 Mana Elixirs", "Best if you're fine with jump quests. Whole chain is 12,046 mesos and +6 Fame.", "", ["mr","mdb"]],
  "10204": [2, "Gloves ATT or M.ATT scroll (60%)", "Rowen's 150-doll step. Save Cursed Dolls from Zombie Lupins instead of selling them.", "", ["mr"]],
  "10205": [3, "Lv 40 class hat", "End of Rowen's chain. Do it while training on Zombie Lupins.", "", ["mq","mr"]],
  "10703": [3, "Free Florina Beach travel for good, +2 Fame", "Convenience: the 4-part chain removes the travel fee.", "", ["mr"]],
  "10209": [3, "Shoes Speed scroll (60% or 10%)", "Worth it if you're farming Drakes. Don't overpay for the Diamond.", "", ["mq"]],
  "10122": [4, "Random Greater cape stat scroll", "Excellent reward, expensive inputs (Black Crystal, Ancient Scroll, 30 Weird Vibes Medicine...). Price it before buying materials.", "", ["mq","mr"]],
  "10005": [1, "Gloves ATT or M.ATT scroll (60% or 10%)", "Every outcome is offensive. One of the best launch quests. Don't overpay for the Moon Rock.", "", ["mq","mr"]],
  "10007": [4, "Class gloves", "Jump quest. Worth it if you're good at them; 30 Screws from the step before are useful for crafting.", "", ["mq","mr"]],
  "10008": [4, "Pansy Earrings", "Jump quest finale. Good earrings, but the time cost is the jump quests.", "", ["mq","mr"]],
  "10321": [1, "Icarus Cape (+2 DEX, +2 Speed or +2 INT)", "All-class tradeable cape, 5 slots, +3 ACC. Keep it even if it's not your color.", "", ["mq","mr"]],
  "10114": [4, "Bronze Crusader Helm", "Warrior-only helmet for expensive crafting materials. Non-Warriors should skip it; Warriors only if they want the helm.", "Warrior", ["mq","mr"]],
  "10118": [4, "Green Napoleon cape", "Lv 50 DEX/ACC cape, mainly for Bowmen. Needs 100 Golem rubble and a Diamond.", "", ["mr"]],
  "10401": [1, "Greater weapon scroll of your choice", "Needs 10 Fame. Pick by market price if selling. Screws and Processed Wood have crafting value too.", "", ["mq","mr"]],
  "10412": [1, "Greater weapon scroll of your choice", "Maybe the best reward for the effort: just Ligator, Jr. Necki kills and 20 skins.", "", ["mq","mr"]],
  "10413": [2, "60% cape stat scroll of your choice", "You pick the stat, so check market prices first. More farming than part 1.", "", ["mq","mr"]],
  "10404": [4, "Hero's Gladius or Skull Earrings", "Iconic, but the inputs (Star Rock, Piece of Ice, Ancient Scroll, Flaming Feather) are costly.", "", ["mq","mr"]]
};
// the quest a chain starts with (the level you should start working on it)
const chainStart = r => r.chain ? D.quests.filter(x => x.chain === r.chain).sort((a, b) => a.lvl - b.lvl || a.id - b.id)[0] : r;
const vPill = id => { const v = VALUE[id]; return v ? `<span class="pill ${VTIER[v[0]][1]}">${VTIER[v[0]][0]}</span>` : "" };
const vSrc = v => v[4].map(k => `<a href="${VSRC[k][1]}" target="_blank" rel="noopener">${esc(VSRC[k][0].split(" ")[0])}</a>`).join(", ");
