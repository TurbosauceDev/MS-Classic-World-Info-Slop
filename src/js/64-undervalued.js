/* ---------------- possibly undervalued training maps (World Map "Undervalued maps" button) ---------------- */
// A hand-picked vibes list, not game data and not the EXP model: maps that public guides call quieter, overflow or
// lesser-known spots, or that have the same monsters as a famous map (checked against the launch spawn data).
// Researched 2026-10-10. Reddit was unreachable and the official forums had no map threads, so "crowded" comes from
// what the guides say, not from in-game counts. No pre-Classic (2008-era) crowd lore is used.
const UV_SRC = {
  M: ["meowdb grind maps (Oct 7)", "https://meowdb.com/msclassic/guides/best-grind-maps-every-level"],
  W: ["mapleclassic.wiki training guide (Oct 9)", "https://mapleclassic.wiki/wiki/Training_guide"],
  H: ["henesys.gg training guide", "https://henesys.gg/guides/training"],
  S: ["ssegold 1-50 guide", "https://www.ssegold.com/maplestory-classic-world-training-leveling-spots"],
  U: ["u4n training maps (Oct 9)", "https://www.u4n.com/news/best-maplestory-classic-world-training-maps-for-fast-grinding.html"],
  X: ["mmoexp 1-70 guide (Sep 26)", "https://www.mmoexp.com/News/maplestory-classic-world-level-1-70-training-guide-best-maps-and-drops.html"],
  G: ["launch game data (spawns)", ""],
  A: ["this site's EXP model, Oct 8 check", ""],
  T: ["meowdb thief guide", "https://meowdb.com/msclassic/guides/thief-class-guide"],
  O: ["meowdb forum training guide", "https://meowdb.com/msclassic/forum/guides/Hour/general-training-guide-2"],
};
// [map ids, level from, level to, instead of, why, sources]
const UV_PICKS = [
  [["10000012"], 11, 14, "Henesys Hunting Ground", "48 monsters, mostly Pigs and Slimes, three maps from Lith Harbor. Off the Henesys path most new players take.", "W"],
  [["10000021"], 12, 20, "Henesys Hunting Ground", "Pigs, Ribbon Pigs and an hourly Iron Hog; drops Leather, Stiff Feathers, Pig's Head. Called \"usually less frustrating than fighting for a crowded HHG map\".", "OX"],
  [["10002031"], 10, 15, "Henesys Hunting Ground I", "\"Slime Tree\": dense Slimes, simple layout, called the quieter option.", "X"],
  [["10004022"], 13, 20, "Henesys Hunting Ground III", "32 Green Mushrooms; meowdb puts it at about 2× the East Rocky Mountain maps. Perion is a long walk from where most players start.", "MH"],
  [["10003102"], 15, 21, "Line 1 <Area 1>", "The same Bubblings as Line 1 Area 1, but only 9 of them: a solo spot, too small for a party to bother with.", "GA"],
  [["10003081"], 16, 19, "Caution Falling Down", "Same monsters as Caution Falling Down (12 Octopus, Orange and Blue Mushrooms) at 21 spawns vs 20. No guide lists it.", "G"],
  [["10002032", "10002033"], 16, 21, "Tree Dungeon, Forest Up North IV", "16 Green Mushrooms each. The wiki calls Southern Forest III \"the overflow when Forest Up North IV is crowded\".", "WA"],
  [["10002020"], 18, 21, "Tree Dungeon, Forest Up North IV", "30 Green Mushrooms with Slime filler, on the way into Ellinia.", "W"],
  [["10002074"], 20, 24, "Line 1 Area 1 / Transfer Area", "meowdb: \"the pick when both Kerning maps are crowded\". Green and Horny Mushrooms.", "M"],
  [["10005065"], 20, 25, "Transfer Area", "38 Stirges, the same count as Transfer Area, plus a few mushrooms. Within a few % of Transfer Area on the EXP model. meowdb's thief guide: Transfer Area's \"crowding and KS can erase its EXP advantage\"; Dangerous Steam is its second-best pick at 25 and 30.", "MAT"],
  [["10005063", "10005061"], 22, 30, "Ant Tunnel I", "Ant Tunnel I has only 26 monsters; IV has 64 and II has 47 of the same mushrooms. Three guides name IV as the alternative.", "SUX"],
  [["10005066"], 24, 30, "Ant Tunnel I", "66 monsters with Evil Eyes mixed in; meowdb's broadest spread in the cluster.", "MA"],
  [["10005072"], 27, 35, "The Cave of Evil Eye III", "36 Evil Eyes and nothing else. Guides name III; II gets skipped on the way.", "GA"],
  [["10005070"], 24, 33, "Line 2 subway", "Called \"a reliable alternative when Subway maps are crowded\"; henesys.gg rates it above the Evil Eye caves.", "SHM"],
  [["10003110"], 30, 35, "The Swamp of Despair", "16 Jr. Necki and 17 Ligators. Top for Thief at 35 on the EXP model; few drop reports for its monsters.", "A"],
  [["10001004"], 28, 35, "Land of Wild Boar", "22 Iron Hogs next to Henesys; the wiki's \"convenience option\".", "W"],
  [["10004113", "10004115"], 32, 39, "Line 2 <Area 1>", "24-26 Fire Boars; meowdb's \"best non-subway option\" for the bracket. Burnt Land V pays quest EXP.", "MW"],
  [["10003063"], 32, 40, "Line 2 <Area 1>", "69 Jr. Wraiths. meowdb: \"less popular than Line 2, so it may be quieter\".", "M"],
  [["10007020"], 38, 44, "A Look-Out Shed Around the Beach", "35 Lorangs. meowdb: \"can be quieter when the main Lorang spot is packed\".", "MW"],
  [["10002024"], 41, 50, "Monkey Forest II", "26 Zombie Lupins. meowdb: \"Hidden Street alternative that fewer players know about\".", "MW"],
  [["10005076"], 43, 48, "Line 2 <Area 2>", "32 Cold Eyes and 20 Drakes. henesys.gg: \"few guides mention it yet\". The wiki says only strong 43-47 characters should try it.", "HWS"],
  [["10005091", "10005101"], 40, 48, "Drake maps", "Small single-monster Cold Eye maps (13-17). Wild Kargo's Area: \"a strong alternative when Drake maps become overcrowded\"; Cold Eye/Drake area called \"a less crowded option\".", "OSA"],
  [["10003065"], 48, 57, "Line 2 <Area 3>", "59 Wraiths and nothing else. Three guides: take whichever of the two is quieter.", "MWU"],
  [["10005052"], 55, 62, "Sleepy Dungeon V", "Same monsters, half the spawns. meowdb: \"go here when V is crowded\".", "M"],
];
// maps the guides single out as busy or as the consensus pick: expect company there
const UV_PACKED = {
  "10001010": "\"tends to be busy\" (u4n); \"crowded platforms\" (mmoexp)", "10001011": "the wiki's recommended 11-15 map", "10001012": "the most-named 13-20 map",
  "1003": "\"the busiest Maple Island map\" (henesys.gg)", "10001021": "\"the busiest Maple Island map\" (henesys.gg)", "1000": "named in every 1-10 list",
  "10003061": "\"consensus pick\" (henesys.gg); \"heavy player traffic\" (u4n)", "10003011": "\"may become crowded\" (ssegold)", "10003062": "\"expect heavy traffic at Kerning subway Stirges\" (meowdb thief guide)",
  "10005060": "\"usually the most popular\" (ssegold)", "10002075": "the wiki's recommended 16-20 map", "10003066": "\"consensus pick for the 30s\" (henesys.gg)",
  "10003067": "\"the best map on Victoria Island\" (henesys.gg)", "10003068": "the wiki's recommended 51-55 map", "10005054": "\"most players stay here\" (henesys.gg)",
  "10007010": "the top 41-45 pick in two guides", "10005064": "the wiki's recommended 26-30 map", "10004091": "\"a common party spot\" (henesys.gg)",
};
const UV = {}; UV_PICKS.forEach((p, i) => p[0].forEach(id => UV[id] = i));
