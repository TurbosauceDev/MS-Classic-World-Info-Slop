// data/data.json (the site's data) -> app/gamedata.json: only what the tracker needs. Run after build_data.py changes.
const fs = require("fs"), path = require("path");
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/data.json"), "utf8"));
const G = require("./core/gamedata.js").toGamedata(D);
fs.writeFileSync(path.join(__dirname, "app/gamedata.json"), JSON.stringify(G));   // tests
fs.writeFileSync(path.join(__dirname, "app/gamedata.js"), "const GAMEDATA = " + JSON.stringify(G) + ";\n");   // the app (no fetch of file: URLs)
// the site's screenshot reader (game digit font, un-doubling, icon matching) is shared, not forked
fs.copyFileSync(path.join(__dirname, "../src/js/51-shot.js"), path.join(__dirname, "app/shot.js"));
console.log("gamedata.json", (JSON.stringify(G).length / 1024).toFixed(0), "KB");
