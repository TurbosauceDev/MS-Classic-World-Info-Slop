// node scripts/lint_digest.js <file.md>... — checks a digest against docs/ai/digest-contract.md (no deps, pass/fail).
// The pipeline runs this before posting; CI runs it on the gold standard and the live digest (tests/digest.test.js).
// Exit 1 and one line per violation: "<file>: [rule] message".
const fs = require("fs");

const REQUIRED_FIELDS = ["kind", "status", "issue", "date", "written_utc", "author", "site_version"];
const KINDS = ["digest"], STATUSES = ["live", "gold"];
// h2 headings, in this order, matched by prefix (lets "Wins since digest #3" pass as "Wins since")
const REQUIRED_H2 = ["Where things stand", "Wins since", "Anything broken", "Decisions I need", "Today's priorities", "Where to go deeper"];
const MAX_LINES = 150;
// design.md section 10 copy rules + contract rules. Each: [rule id, regex, message]
const BANNED = [
  ["no-emoji", /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u, "emoji are not allowed"],
  ["no-exclaim", /[A-Za-z0-9)\]*`"]!(\s|$)/, "no exclamation marks"],
  ["no-filler", /\b(simply|just|easily|basically|obviously)\b/i, "banned filler word (simply/just/easily/basically/obviously)"],
  ["no-github-io", /turbosaucedev\.github\.io/i, "link https://maplestory.scumlord.studio, not the github.io URL"],
  ["no-secret", /(github_pat_\w+|ghp_\w{20,}|discord(app)?\.com\/api\/webhooks\/\d+|sk-[A-Za-z0-9]{20,}|xox[bp]-)/i, "secret or webhook URL in text"],
  ["no-em-dash", /—/, "no em-dashes (use a period or colon)"],
];

function parseFront(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1").trim();
  }
  return { fm, body: text.slice(m[0].length), bodyStart: m[0].split("\n").length - 1 };
}

function lint(text, file = "digest") {
  const out = [], bad = (rule, msg) => out.push(`${file}: [${rule}] ${msg}`);
  const p = parseFront(text);
  if (!p) { bad("front-matter", "missing --- front matter block at top"); return out; }
  const { fm, body } = p;
  for (const k of REQUIRED_FIELDS) if (!fm[k]) bad("front-matter", `missing field: ${k}`);
  if (fm.kind && !KINDS.includes(fm.kind)) bad("front-matter", `kind must be one of ${KINDS}`);
  if (fm.status && !STATUSES.includes(fm.status)) bad("front-matter", `status must be one of ${STATUSES}`);
  if (fm.issue && !/^[1-9]\d*$/.test(fm.issue)) bad("front-matter", "issue must be a positive integer");
  if (fm.date && !/^\d{4}-\d{2}-\d{2}$/.test(fm.date)) bad("front-matter", "date must be YYYY-MM-DD");
  if (fm.written_utc && !/^([01]\d|2[0-3]):[0-5]\d$/.test(fm.written_utc)) bad("front-matter", 'written_utc must be "HH:MM" (24h UTC)');
  if (fm.site_version && !/^\d+\.\d+\.\d+$/.test(fm.site_version)) bad("front-matter", "site_version must be X.Y.Z");
  if (fm.status === "gold" && !fm.audited_by) bad("front-matter", "gold digests need audited_by");

  const lines = body.split("\n");
  if (lines.length > MAX_LINES) bad("length", `body is ${lines.length} lines, max ${MAX_LINES}`);
  if (!/^# .+/m.test(body)) bad("structure", "missing # title");
  const h2 = lines.filter(l => /^## /.test(l)).map(l => l.slice(3).trim());
  let at = -1;
  for (const req of REQUIRED_H2) {
    const i = h2.findIndex((h, j) => j > at && h.toLowerCase().startsWith(req.toLowerCase()));
    if (i < 0) bad("structure", `missing or out-of-order section: "## ${req}"`); else at = i;
  }
  if (lines.some(l => /^### /.test(l)) && !h2.length) bad("structure", "use ## for sections, not ###");

  // copy rules on the body only, skipping code spans and fenced blocks so `just` in a command name can't trip it
  let fence = false;
  lines.forEach((l, i) => {
    if (/^```/.test(l)) { fence = !fence; return; }
    if (fence) return;
    const plain = l.replace(/`[^`]*`/g, "").replace(/\]\([^)]*\)/g, "]");
    for (const [rule, re, msg] of BANNED) if (re.test(rule === "no-secret" ? l : plain)) bad(rule, `line ${i + 1 + p.bodyStart}: ${msg}`);
  });
  return out;
}

module.exports = { lint, parseFront };

if (require.main === module) {
  const files = process.argv.slice(2);
  if (!files.length) { console.log("usage: node scripts/lint_digest.js <file.md>..."); process.exit(2); }
  const errs = files.flatMap(f => lint(fs.readFileSync(f, "utf8"), f));
  console.log(errs.length ? errs.join("\n") : `digest lint: ${files.length} file(s) on spec`);
  process.exit(errs.length ? 1 : 0);
}
