// node tests/lint_test.js [--write] (CI: tests.yml core shard): ESLint ratchet for bug-shaped code (Hermes review B4, 2026-11-02).
// Only rules that point at real bugs, not style: a name nobody defined (typo, missing import, deleted helper), duplicate
// object keys, unreachable code, x = x, a name declared twice, a value compared with itself.
// Scripts that share one page are linted TOGETHER, as the browser sees them: the site is the one script build.py makes
// (src/js shares a top-level scope), each tracker page is its <script src> list in order. Names a script publishes with
// `window.NAME =` count as defined. Everything else (main process, workers, server) is linted file by file.
// tests/lint_baseline.json holds today's count per unit and rule; more fails, fewer prints "better" (lower it with --write).
// Needs dist/index.html (python3 scripts/build.py).
const fs = require("fs"), path = require("path"), {execFileSync} = require("child_process");
const {Linter} = require("eslint"), globals = require("globals");
const root = path.join(__dirname, ".."), BASE = path.join(__dirname, "lint_baseline.json");
const RULES = {"no-undef": 2, "no-dupe-keys": 2, "no-unreachable": 2, "no-self-assign": 2, "no-redeclare": [2, {builtinGlobals: false}], "no-self-compare": 2, "no-dupe-else-if": 2, "no-unsafe-finally": 2};
const UMD = {module: "readonly", exports: "readonly", require: "readonly", Buffer: "readonly", process: "readonly"};   // `typeof module` guards in shared files
const linter = new Linter(), now = {}, sample = {};
// names a script publishes: window.X = / root.X = (the UMD wrappers in tracker/core) / contextBridge.exposeInMainWorld("X")
const published = code => Object.fromEntries([...code.matchAll(/\b(?:window|self|globalThis|root|global)\.([A-Za-z_$][\w$]*)\s*=(?!=)/g),
  ...code.matchAll(/exposeInMainWorld\(\s*["']([\w$]+)["']/g)].map(m => [m[1], "readonly"]));
const PRELOADS = ["tracker/app/preload.js", "tracker/app/overlay-preload.js", "tracker/app/snip-preload.js"];
const GENERATED = {GAMEDATA: "readonly", SHOT_FONT: "readonly", SKILLDATA: "readonly"};   // tracker `npm run data` output (gitignored)
const lint = (unit, code, g, sourceType = "script") => {
  for (const m of linter.verify(code, [{files: ["**/*.js"], languageOptions: {ecmaVersion: "latest", sourceType, globals: {...g, ...published(code)}}, rules: RULES}], "x.js")){
    if (!m.ruleId) continue; const k = unit + " " + m.ruleId; now[k] = (now[k] || 0) + 1; (sample[k] ||= []).push(m.message + (process.env.LINT_SHOW ? " @" + m.line + ": " + code.split("\n")[m.line - 1].trim().slice(0, 90) : "")) } };
const read = f => fs.readFileSync(path.join(root, f), "utf8");

const html = read("dist/index.html");
const a = html.indexOf("</script>", html.indexOf('id="sitedata"')) + 9, s = html.indexOf("<script>", a) + 8;
lint("site (all src/js)", html.slice(s, html.indexOf("</script>", s)), {...globals.browser, ...UMD, siteTheme: "readonly"});   // siteTheme: the <head> script in src/index.html

const grouped = new Set();
for (const page of ["tracker/app/index.html", "tracker/app/overlay.html", "tracker/app/snip.html"]){
  const srcs = [...read(page).matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map(m => path.posix.normalize(path.posix.join("tracker/app", m[1]))).filter(f => fs.existsSync(path.join(root, f)));
  srcs.forEach(f => grouped.add(f));
  lint(page + " (" + srcs.length + " scripts)", srcs.map(read).join("\n;\n"), {...globals.browser, ...UMD, ...GENERATED, ...published(PRELOADS.map(read).join("\n"))});
}
const ls = d => execFileSync("git", ["ls-files", d], {cwd: root, encoding: "utf8"}).split("\n").filter(f => f.endsWith(".js"));
for (const f of [...ls("tracker/app"), ...ls("tracker/core")]) if (!grouped.has(f)){
  const code = read(f), imported = [...code.matchAll(/importScripts\(([^)]*)\)/g)].flatMap(m => [...m[1].matchAll(/["']([^"']+)["']/g)].map(x => path.posix.join(path.posix.dirname(f), x[1])))
    .filter(p => fs.existsSync(path.join(root, p))).map(read).join("\n");   // a worker sees what it importScripts
  lint(f, code, {...globals.node, ...globals.browser, ...(imported ? globals.worker : {}), ...GENERATED, ...published(imported)});
}
for (const f of ls("server/src")) lint(f, read(f), {...globals.serviceworker}, "module");

const total = o => Object.values(o).reduce((x, y) => x + y, 0);
if (process.argv.includes("--write")){ fs.writeFileSync(BASE, JSON.stringify(now, Object.keys(now).sort(), 1) + "\n"); console.log("baseline written: " + total(now)); process.exit(0) }
const base = JSON.parse(fs.readFileSync(BASE, "utf8"));
let fail = 0; const better = [];
for (const [k, n] of Object.entries(now)) if (n > (base[k] || 0)){ fail++; console.log(`FAILED: ${k}: ${n} (baseline ${base[k] || 0}), e.g. ${[...new Set(sample[k])].slice(-3).join(" | ")}`) }
for (const [k, n] of Object.entries(base)) if ((now[k] || 0) < n) better.push(`${k} ${n}->${now[k] || 0}`);
if (better.length) console.log(`better (lower the baseline with --write): ${better.join(", ")}`);
console.log(fail ? `${fail} lint count(s) went up` : `lint ratchet held (${total(now)} findings, baseline ${total(base)})`);
process.exit(fail ? 1 : 0);
