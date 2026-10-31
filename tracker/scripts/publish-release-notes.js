// Puts the patch notes on the GitHub Release after electron-builder publishes it.
// Why this exists: electron-publish 25.1.8's createRelease() sends only tag_name/name/draft/prerelease
// - it cannot set the release body (that's why every release up to 0.3.25 shipped bare). The release
// npm script generates build/release-notes.md from the top app/changelog.js entry; this script reads
// the same file and PATCHes it onto the release for the version being built. Runs in tracker.yml
// right after the release step (release builds only); needs GH_TOKEN in the env.
const fs = require("fs"), path = require("path");
const pkg = require("../package.json");
const publish = pkg.build && pkg.build.publish;
if (!publish || publish.provider !== "github") {
  console.error("package.json build.publish is not github - don't know where to patch");
  process.exit(1);
}
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
const tag = `v${pkg.version}`;
const base = `https://api.github.com/repos/${publish.owner}/${publish.repo}`;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  console.error("GH_TOKEN not set - refusing to run");
  process.exit(1);
}
const req = (url, method, payload) =>
  fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "ms-classic-release-notes",
      "Content-Type": "application/json",
    },
    body: payload ? JSON.stringify(payload) : undefined,
  }).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(data).slice(0, 300)}`);
    return data;
  });

(async () => {
  const rel = await req(`${base}/releases/tags/${tag}`, "GET");
  if ((rel.body || "").trim() === body) {
    console.log(`release ${tag} already carries these notes (${body.length} chars)`);
    return;
  }
  await req(`${base}/releases/${rel.id}`, "PATCH", { body });
  console.log(`release ${tag} notes set (${body.length} chars)`);
})().catch((e) => {
  console.error(`setting release notes failed: ${e.message}`);
  process.exit(1);
});
