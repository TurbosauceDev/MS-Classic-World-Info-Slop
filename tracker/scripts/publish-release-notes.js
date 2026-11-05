// Puts the patch notes on the GitHub Release after electron-builder uploads into it, then publishes it.
// Since 0.3.42 (Hermes 2026-11-05) the release is a draft made by prepare-release.js; release-gh.js finish() checks the
// installer, blockmap and latest.yml all landed before un-drafting it (see release-gh.js for the publish race this fixes).
// Why this exists: electron-publish 25.1.8's createRelease() sends only tag_name/name/draft/prerelease
// - it cannot set the release body (that's why every release up to 0.3.25 shipped bare). The release
// npm script generates build/release-notes.md from the top app/changelog.js entry; this script reads
// the same file and PATCHes it onto the release for the version being built. Runs in tracker.yml
// right after the release step (release builds only); needs GH_TOKEN in the env.
const fs = require("fs"), path = require("path");
const notesPath = path.join(__dirname, "..", "build", "release-notes.md");
if (!fs.existsSync(notesPath)) {
  console.error(`${notesPath} not found - npm run release generates it before electron-builder; did the release step change?`);
  process.exit(1);
}
let body = fs.readFileSync(notesPath, "utf8").trim();
// SHA-256 of the installer (blind-spot report A3, 2026-10-31): lets anyone check the download is the one we built, and gives
// SmartScreen / antivirus false-positive reports something to point at. Skipped quietly when no installer is in dist/.
{
  const dist = path.join(__dirname, "..", "dist");
  const exe = fs.existsSync(dist) ? fs.readdirSync(dist).filter((f) => /\.exe$/i.test(f) && !/uninstall/i.test(f)) : [];
  for (const f of exe) body += `\n\nSHA-256 of \`${f}\`: \`${require("crypto").createHash("sha256").update(fs.readFileSync(path.join(dist, f))).digest("hex")}\``;
}
const { finish } = require("./release-gh.js"), { base, tag, version, req } = require("./release-api.js");
finish(req, base, tag, version, body)
  .then((r) => console.log(`release ${tag}: ${r.action} (${body.length} chars of notes)`))
  .catch((e) => {
    console.error(`publishing release ${tag} failed: ${e.message}`);
    process.exit(1);
  });
