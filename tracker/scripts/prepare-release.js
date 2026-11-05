// Creates the draft GitHub release before electron-builder publishes into it (see release-gh.js for why).
// Runs in tracker.yml right before `npm run release` on release builds only; needs GH_TOKEN.
const { prepare } = require("./release-gh.js"), { base, tag, version, req } = require("./release-api.js");
prepare(req, base, tag, version, process.env.GITHUB_SHA)
  .then((r) => console.log(`release ${tag}: ${r.action} (id ${r.id})`))
  .catch((e) => { console.error(`preparing release ${tag} failed: ${e.message}`); process.exit(1); });
