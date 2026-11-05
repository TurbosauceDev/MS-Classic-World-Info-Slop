// The release race (0.3.40-0.3.42): electron-builder 26.18 starts two GitHub publishers that each create a release.
// scripts/release-gh.js makes a draft first and only publishes once every asset landed. Fake GitHub, no network.
const assert = require("assert"), fs = require("fs"), path = require("path");
const { WANT, prepare, finish } = require("../scripts/release-gh.js");
const B = "https://api.github.com/repos/o/r";
function fakeGh(releases) {
  const calls = [];
  let next = 100;
  const req = async (url, method, body) => {
    calls.push([method, url.replace(B, ""), body]);
    if (method === "GET" && /\/releases\?per_page=100&page=1$/.test(url)) return releases.map((r) => ({ ...r }));
    if (method === "GET") return [];
    if (method === "POST") { const r = { id: next++, ...body, assets: [] }; releases.push(r); return r; }
    if (method === "PATCH") { const id = +url.split("/").pop(), r = releases.find((x) => x.id === id); Object.assign(r, body); return r; }
    throw new Error("unexpected " + method);
  };
  return { req, calls, releases };
}
(async () => {
  // what electron-publish's getOrCreateRelease does with a list: an existing draft is returned, not re-created
  const pub = fs.readFileSync(path.join(__dirname, "..", "node_modules", "electron-publish", "out", "gitHubPublisher.js"), "utf8");
  assert(/if \(release\.draft\) \{\s*return release;/.test(pub), "electron-publish no longer reuses an existing draft - prepare-release.js's fix relies on it");
  // 1. nothing yet -> one draft is made at the build's commit
  let g = fakeGh([]);
  let r = await prepare(g.req, B, "v1.2.3", "1.2.3", "abc");
  assert.strictEqual(r.action, "created draft");
  assert.deepStrictEqual(g.releases.map((x) => [x.tag_name, x.draft, x.target_commitish]), [["v1.2.3", true, "abc"]]);
  // 2. a re-run finds it and makes no second one
  r = await prepare(g.req, B, "v1.2.3", "1.2.3", "abc");
  assert.strictEqual(r.action, "kept draft");
  assert.strictEqual(g.releases.length, 1);
  // 3. two releases on one tag (what the race left behind) is refused, not papered over
  await assert.rejects(prepare(fakeGh([{ id: 1, tag_name: "v1", draft: false }, { id: 2, tag_name: "v1", draft: false }]).req, B, "v1", "1"), /2 releases/);
  // 4. finish with the installer missing (the exact 0.3.42 state) leaves it a draft
  g.releases[0].assets = [{ name: WANT("1.2.3")[1] }];
  await assert.rejects(finish(g.req, B, "v1.2.3", "1.2.3", "notes"), /missing MS-Classic-Grind-Tracker-Setup-1\.2\.3\.exe, latest\.yml/);
  assert.strictEqual(g.releases[0].draft, true);
  assert(!g.calls.some((c) => c[0] === "PATCH"), "a half-uploaded release must not be touched");
  // 5. all three there -> notes on, published, marked latest
  g.releases[0].assets = WANT("1.2.3").map((name) => ({ name }));
  r = await finish(g.req, B, "v1.2.3", "1.2.3", "notes");
  assert.strictEqual(r.action, "published");
  assert.deepStrictEqual([g.releases[0].draft, g.releases[0].body, g.releases[0].make_latest], [false, "notes", "true"]);
  // 6. running it again is a no-op
  assert.strictEqual((await finish(g.req, B, "v1.2.3", "1.2.3", "notes")).action, "already done");
  // 7. the workflow runs prepare BEFORE electron-builder, and finish after it
  const yml = fs.readFileSync(path.join(__dirname, "..", "..", ".github", "workflows", "tracker.yml"), "utf8");
  const a = yml.indexOf("scripts/prepare-release.js"), b = yml.indexOf("npm run ${{"), c = yml.indexOf("scripts/publish-release-notes.js");
  assert(a > 0 && a < b && b < c, "tracker.yml must run prepare-release.js, then npm run release, then publish-release-notes.js");
  // 8. still publishing as a full release (GitHub turns the spaces in the installer name into the dashes WANT() expects)
  const pkg = require("../package.json");
  assert.strictEqual(pkg.build.publish.releaseType, "release");
  console.log("release test passed");
})().catch((e) => { console.error(e); process.exit(1); });
