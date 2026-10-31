// Generates build/release-notes.md from the top app/changelog.js entry, so electron-builder
// publishes the GitHub Release with real patch notes instead of an empty body (every release
// up to 0.3.25 shipped with a bare tag and no notes - backfilled 2026-10-31 from changelog.js).
// The `release` npm script runs this before electron-builder; package.json's build.releaseInfo
// points at the file. Fails loudly if the top entry isn't package.json's version - the same
// guard tests/core.test.js enforces, repeated here so a release can never publish silent.
const fs = require("fs"), path = require("path");
const pkg = require("../package.json");
const LOG = require("../app/changelog.js");
const top = LOG[0];
if (!top || top[0] !== pkg.version) {
  console.error(`changelog.js top entry is ${top && top[0]}, package.json is ${pkg.version} - add the patch-notes line first`);
  process.exit(1);
}
if (!top[1] || !top[2] || !top[2].trim()) {
  console.error(`changelog.js top entry (${top[0]}) has no date or empty text`);
  process.exit(1);
}
const body = `## ${top[0]} - ${top[1]}\n\n${top[2].trim()}\n`;
const out = path.join(__dirname, "..", "build", "release-notes.md");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, body);
console.log(`release notes: ${path.relative(process.cwd(), out)} (${body.length} chars, ${top[0]})`);
