// data/data.json (the site's data) -> app/gamedata.json: only what the tracker needs. Run after build_data.py changes.
const fs = require("fs"), path = require("path");
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/data.json"), "utf8"));
const G = require("./core/gamedata.js").toGamedata(D);
fs.writeFileSync(path.join(__dirname, "app/gamedata.json"), JSON.stringify(G));   // tests
fs.writeFileSync(path.join(__dirname, "app/gamedata.js"), "const GAMEDATA = " + JSON.stringify(G) + ";\n");   // the app (no fetch of file: URLs)
// the site's screenshot reader (game digit font, un-doubling, icon matching) is shared, not forked
fs.copyFileSync(path.join(__dirname, "../src/js/51-shot.js"), path.join(__dirname, "app/shot.js"));
// the QUEST window's reading core (60b-questread.js), shared with the site's Quest log (P1-7) — same deal as shot.js
fs.copyFileSync(path.join(__dirname, "../src/js/60b-questread.js"), path.join(__dirname, "app/questread.js"));

// Skill range overlay (app/overlay.js + core/skillrange.js): every skill with a range (rv) and the weapon swing boxes
const SK = {skills: Object.fromEntries(Object.entries(D.skills).map(([j, l]) => [j, l.filter(s => s.rv).map(s => ({id: s.id, n: s.n, max: s.max, k: s.k, mob: s.mob, rv: s.rv}))])), hitact: D.hitact};
fs.writeFileSync(path.join(__dirname, "app/skilldata.json"), JSON.stringify(SK));   // tests
fs.writeFileSync(path.join(__dirname, "app/skilldata.js"), "const SKILLDATA = " + JSON.stringify(SK) + ";\n");
console.log("gamedata.json", (JSON.stringify(G).length / 1024).toFixed(0), "KB");
