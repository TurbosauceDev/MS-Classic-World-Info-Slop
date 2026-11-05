// GitHub release steps around electron-builder (Hermes 2026-11-05, the 0.3.40-0.3.42 release race).
// Why: electron-builder 26.18's PublishManager.getOrCreatePublisher awaits createPublisher() before it caches the
// publisher, so the .exe and .blockmap upload events both miss the cache, both find no release and BOTH create one
// (two "creating GitHub release" log lines in the same millisecond). The uploads split across two releases, the
// installer goes missing from the one the updater sees, and the notes PATCH dies with 422 already_exists.
// The fix: tracker.yml runs `prepare` before electron-builder, so a DRAFT release already exists. electron-publish
// returns an existing draft untouched (gitHubPublisher.js getOrCreateRelease: `if (release.draft) return release`), so
// nobody creates a second one. `finish` (publish-release-notes.js) then checks every asset landed, sets the notes, and
// only then un-drafts it - so a half-uploaded release never goes live or reaches the updater.
// Pure logic here, with the HTTP call passed in, so tests/release.test.js can drive it with a fake GitHub.
const WANT = (version) => [`MS-Classic-Grind-Tracker-Setup-${version}.exe`, `MS-Classic-Grind-Tracker-Setup-${version}.exe.blockmap`, "latest.yml"];
// /releases/tags/{tag} never returns drafts, so list and match (same as electron-publish does)
async function findAll(req, base, tag) {
  const out = [];
  for (let page = 1; page <= 5; page++) {
    const rows = await req(`${base}/releases?per_page=100&page=${page}`, "GET");
    out.push(...rows.filter((r) => r.tag_name === tag));
    if (rows.length < 100) break;
  }
  return out;
}
// before electron-builder: make sure exactly one release (a draft, unless one is already published) exists for the tag
async function prepare(req, base, tag, version, sha) {
  const found = await findAll(req, base, tag);
  if (found.length > 1) throw new Error(`${found.length} releases already carry ${tag}; delete the extras by hand first`);
  if (found.length === 1) return { action: found[0].draft ? "kept draft" : "kept published", id: found[0].id };
  const rel = await req(`${base}/releases`, "POST", { tag_name: tag, target_commitish: sha || undefined, name: version, draft: true, prerelease: false });
  return { action: "created draft", id: rel.id };
}
// after electron-builder: all assets there -> notes on, draft off, marked latest
async function finish(req, base, tag, version, body) {
  const found = await findAll(req, base, tag);
  if (found.length !== 1) throw new Error(`expected one release for ${tag}, found ${found.length} - the publish race is back?`);
  const rel = found[0], have = (rel.assets || []).map((a) => a.name);
  const missing = WANT(version).filter((n) => !have.includes(n));
  if (missing.length) throw new Error(`release ${tag} is missing ${missing.join(", ")}; left as ${rel.draft ? "a draft" : "is"}, not published`);
  if (!rel.draft && (rel.body || "").trim() === body) return { action: "already done", id: rel.id };
  await req(`${base}/releases/${rel.id}`, "PATCH", { body, draft: false, make_latest: "true" });
  return { action: rel.draft ? "published" : "notes set", id: rel.id };
}
module.exports = { WANT, findAll, prepare, finish };
