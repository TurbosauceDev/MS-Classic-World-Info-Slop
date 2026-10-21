// Scheduled workflows in the main-pipeline concurrency group: GitHub keeps only one pending run per group,
// so two polls firing the same minute drop one. Also keep crons off :00/:30 (GitHub's busiest, most-skipped).
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', '.github', 'workflows');
const seen = {}; let bad = 0;
for (const f of fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f))) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  if (!/group:\s*main-pipeline/.test(src)) continue;
  for (const m of src.matchAll(/cron:\s*"(\S+)\s/g)) {
    const min = +m[1];
    if (min % 30 === 0) { console.error(`${f}: cron at :${m[1]} (avoid :00/:30)`); bad++; }
    if (seen[min] && seen[min] !== f) { console.error(`${f}: minute :${min} collides with ${seen[min]}`); bad++; }
    seen[min] = f;
  }
}
if (bad) process.exit(1);
console.log(`cron test passed (${Object.keys(seen).length} minutes)`);
