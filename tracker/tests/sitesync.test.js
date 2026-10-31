// node tests/sitesync.test.js — the tracker's Site tab rides on app/site-changelog.js, a generated copy of the
// website's changelog cards (src/pages/log.html). This test re-parses the page with the sync script's own parser
// and fails when the committed copy drifts, so the Site tab can never go stale:
//   a site card lands without re-running scripts/sync-site-changelog.js → red, with the fix in the message.
const assert = require("assert"), fs = require("fs"), path = require("path");
const sync = require("../scripts/sync-site-changelog.js");
const SITE = require("../app/site-changelog.js");

(async () => {
  const fresh = sync.parse(fs.readFileSync(sync.SRC, "utf8"));
  assert.deepStrictEqual(SITE, fresh, "app/site-changelog.js is out of date with src/pages/log.html — run: node scripts/sync-site-changelog.js");

  assert.ok(SITE.length > 100, "suspiciously few site cards: " + SITE.length);
  for (const [v, t, h3, pill, body] of SITE) {
    assert.ok(/^0\.\d+\.\d+$/.test(v), "bad site version " + v);
    assert.ok(!Number.isNaN(Date.parse(t)), "bad data-t " + t);
    assert.ok(h3 && h3.length > 5 && !/<script/i.test(h3), "empty or scripted h3 at " + v);
    assert.ok(pill === null || typeof pill === "string", "bad pill at " + v);
    assert.ok(body && body.length > 10 && !/<script/i.test(body), "empty or scripted body at " + v);
    assert.ok(!/data-go/.test(body), "unrewritten data-go link at " + v);
  }
  // version walk mirrors build.py: the newest card is the site version, the next one exactly one step behind,
  // and the oldest is 0.1.0 (the data-minor card every version is counted from)
  const a = SITE[0][0].split(".").map(Number), b = SITE[1][0].split(".").map(Number);
  assert.deepStrictEqual(b, a[2] > 0 ? [a[0], a[1], a[2] - 1] : [a[0], a[1] - 1, b[2]], "second card should be one step older than the newest");
  assert.strictEqual(SITE[SITE.length - 1][0], "0.1.0", "oldest card must be 0.1.0 (data-minor), like build.py asserts");
  console.log("sitesync ok — " + SITE.length + " site cards, latest v" + SITE[0][0]);
})().catch(e => { console.error(e.message); process.exit(1) });
