// Shared GitHub API bits for prepare-release.js and publish-release-notes.js (repo + tag from package.json).
const pkg = require("../package.json");
const publish = pkg.build && pkg.build.publish;
if (!publish || publish.provider !== "github") {
  console.error("package.json build.publish is not github - don't know which repo to release to");
  process.exit(1);
}
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
      "User-Agent": "ms-classic-release",
      "Content-Type": "application/json",
    },
    body: payload ? JSON.stringify(payload) : undefined,
  }).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(data).slice(0, 300)}`);
    return data;
  });
module.exports = { version: pkg.version, tag: `v${pkg.version}`, base: `https://api.github.com/repos/${publish.owner}/${publish.repo}`, req };
