// node tests/empty_catch_test.js [--write] (CI: docs.yml): a ratchet on silent `catch {}` blocks (Hermes review B1, 2026-11-02).
// An empty catch hides the error that would have explained "it just stopped working". Many existing ones are fine
// (JSON.parse-or-default, localStorage in private mode), so this is a ratchet, not a ban: tests/empty_catch_baseline.json holds
// today's count per file; a file that gets MORE fails. A justified one doesn't count: put the reason in a comment on the
// same line (`catch {}   // storage full: keep going`). Fewer than the baseline? Run with --write to lower it.
const fs = require("fs"), path = require("path"), {execFileSync} = require("child_process");
const root = path.join(__dirname, ".."), BASE = path.join(__dirname, "empty_catch_baseline.json");
const DIRS = ["src/js", "tracker/app", "tracker/core", "server/src", "scripts"];
const RE = /catch\s*(\([^)]*\))?\s*\{\s*\}(?![^\n]*\/\/)/g;
const files = execFileSync("git", ["ls-files", ...DIRS], {cwd: root, encoding: "utf8"}).split("\n").filter(f => /\.(js|cjs|mjs)$/.test(f) && !f.includes("/archive/"));
const now = {};
for (const f of files){ const n = (fs.readFileSync(path.join(root, f), "utf8").match(RE) || []).length; if (n) now[f] = n }
if (process.argv.includes("--write")){ fs.writeFileSync(BASE, JSON.stringify(now, Object.keys(now).sort(), 1) + "\n"); console.log("baseline written: " + Object.values(now).reduce((a, b) => a + b, 0)); process.exit(0) }
const base = JSON.parse(fs.readFileSync(BASE, "utf8"));
let fail = 0, better = [];
for (const [f, n] of Object.entries(now)) if (n > (base[f] || 0)){ fail++; console.log(`FAILED: ${f}: ${n} silent catch {} (baseline ${base[f] || 0}). Handle or log the error, or say why on the same line: catch {}   // reason`) }
for (const [f, n] of Object.entries(base)) if ((now[f] || 0) < n) better.push(`${f} ${n}->${now[f] || 0}`);
if (better.length) console.log(`better (lower the baseline with --write): ${better.join(", ")}`);
const total = Object.values(now).reduce((a, b) => a + b, 0);
console.log(fail ? `${fail} file(s) over the ratchet` : `empty-catch ratchet held (${total} silent catches, baseline ${Object.values(base).reduce((a, b) => a + b, 0)})`);
process.exit(fail ? 1 : 0);
