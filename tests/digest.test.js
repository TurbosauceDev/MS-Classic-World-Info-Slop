// node tests/digest.test.js — executable spec for digests and the design guide (no deps, ~0.1 s; CI: docs.yml).
// 1. config/digest.json names secrets but holds none; archive thread id is digits or null.
// 2. The gold digest passes scripts/lint_digest.js, the live digest passes it, and each rule fails on a broken copy.
// 3. Every command in docs/ai/design.md does what it claims (a "run this" script is standalone; a "helper" is loaded by others).
// 4. design.md section 10 copy rules hold in UI text (src pages + tracker): no exclamation marks, emoji, simply/easily/just.
const fs = require("fs"), path = require("path");
const { lint } = require("../scripts/lint_digest");
const root = path.join(__dirname, ".."), rd = p => fs.readFileSync(path.join(root, p), "utf8");
let fail = 0;
const bad = (where, msg) => { fail++; console.log(`${where}: ${msg}`) };

// 1. config
const cfg = JSON.parse(rd("config/digest.json"));
for (const [k, v] of Object.entries({ "discord.webhook_secret": cfg.discord.webhook_secret })) if (!/^[A-Z][A-Z0-9_]+$/.test(v || "")) bad("config/digest.json", `${k} must be an UPPER_SNAKE secret name`);
const tid = cfg.discord.archive_thread_id;
if (tid !== null && !/^\d{6,}$/.test(String(tid))) bad("config/digest.json", "archive_thread_id must be null or a digits string");
if (/discord(app)?\.com\/api\/webhooks|https?:\/\/[^"]*token/i.test(JSON.stringify(cfg))) bad("config/digest.json", "contains a webhook URL or token; keep it in secrets");
for (const k of ["live_digest", "live_briefing", "gold_digest"]) if (!fs.existsSync(path.join(root, cfg.files[k]))) bad("config/digest.json", `files.${k} points at a missing file: ${cfg.files[k]}`);
if (!/\{date\}/.test(cfg.files.attachment_name) || !/\{issue\}/.test(cfg.files.attachment_name)) bad("config/digest.json", "attachment_name needs {date} and {issue}");

// 2. digest lint: gold + live pass; each rule trips on a mutated gold copy
const gold = rd(cfg.files.gold_digest);
for (const f of [cfg.files.gold_digest, cfg.files.live_digest]) for (const e of lint(rd(f), f)) bad(f, e.replace(/^[^:]*: /, ""));
const cases = [
  ["front-matter", gold.replace(/^---\n[\s\S]*?\n---\n/, "")],
  ["front-matter", gold.replace(/^date: .*$/m, "date: 25/10/2026")],
  ["front-matter", gold.replace(/^author: .*$/m, "")],
  ["front-matter", gold.replace(/^audited_by: .*$/m, "")],
  ["structure", gold.replace("## Anything broken or weird", "## Problems")],
  ["structure", gold.replace("## Where things stand", "## Where to go deeper2").replace("## Where to go deeper\n", "## Where things stand\n")],
  ["no-emoji", gold.replace("Nothing.", "Nothing \u{1F389}.")],
  ["no-exclaim", gold.replace("Nothing.", "Nothing!")],
  ["no-filler", gold.replace("Nothing.", "Just nothing.")],
  ["no-github-io", gold + "\nhttps://turbosaucedev.github.io/MS-Classic-World-Info-Slop/\n"],
  ["no-secret", gold + "\nhttps://discord.com/api/webhooks/123456789/abcdef\n"],
  ["no-em-dash", gold.replace("Nothing.", "Nothing — really.")],
  ["length", gold + "x\n".repeat(200)],
];
for (const [rule, text] of cases) if (!lint(text, "mutant").some(e => e.includes(`[${rule}]`))) bad("scripts/lint_digest.js", `rule ${rule} did not fire on its broken copy`);
if (lint(gold.replace("`tests/golden.js`", "`just-a-name.js`"), "x").length) bad("scripts/lint_digest.js", "banned words inside `code spans` must not trip the lint");

// 3. design.md commands
const design = rd("docs/ai/design.md"), others = fs.readdirSync(path.join(root, "tests")).filter(f => f.endsWith(".js"));
const isHelper = src => /module\.exports\s*=/.test(src) && !/require\.main\s*===\s*module/.test(src) && !/require\(["']playwright["']\)|chromium/.test(src);
for (const m of design.matchAll(/`(node|python3) ([\w./-]+)`/g)) {
  const [, , file] = m, line = design.slice(0, m.index).split("\n").length;
  if (!fs.existsSync(path.join(root, file))) { bad(`design.md:${line}`, `${m[0]} names a missing file`); continue }
  if (file.endsWith(".js") && isHelper(rd(file)) && !/does nothing|not (a )?standalone/i.test(design.split("\n").slice(Math.max(0, line - 2), line + 1).join(" ")))
    bad(`design.md:${line}`, `${m[0]} is a loaded helper, not a standalone script; the guide must not tell people to run it`);
}
for (const m of design.matchAll(/`tests\/([\w-]+\.js)`/g)) {
  const f = "tests/" + m[1];
  if (fs.existsSync(path.join(root, f)) && isHelper(rd(f)) && !others.some(o => o !== m[1] && new RegExp(`require\\(["']\\./${m[1].replace(".js", "")}["']\\)`).test(rd("tests/" + o))))
    bad("design.md", `${f} is described as a helper but no test loads it`);
}
// design.md says smoke runs the boxgap check at 6px on every page and craftplan runs it on the craft planner
for (const f of ["tests/smoke.js", "tests/craftplan.js"]) if (!/evaluate\(boxGaps,\s*\[6,/.test(rd(f))) bad("design.md", `claims ${f} runs the boxgap check at 6px; it does not`);

// 4. UI copy (design.md section 10): visible text only
const uiFiles = [...fs.readdirSync(path.join(root, "src/pages")).filter(f => f.endsWith(".html")).map(f => "src/pages/" + f), "src/index.html", "tracker/app/index.html"];
for (const f of uiFiles) {
  const text = rd(f).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ");
  for (const [re, msg] of [[/\b(simply|easily|just)\b/i, "banned word (simply/easily/just)"], [/[A-Za-z0-9)]!(\s|$)/, "exclamation mark"], [/[\u{1F300}-\u{1FAFF}]/u, "emoji"]]) {
    const hit = text.match(re); if (hit) bad(f, `${msg}: "${text.slice(Math.max(0, hit.index - 25), hit.index + 25).replace(/\s+/g, " ")}"`);
  }
}

console.log(fail ? `${fail} problem(s)` : "digest + design spec: ok");
process.exit(fail ? 1 : 0);
