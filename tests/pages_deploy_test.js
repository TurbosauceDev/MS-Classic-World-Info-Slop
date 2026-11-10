// pages.yml must survive a stalled GitHub Pages backend: deploy-pages clamps its wait to 10 min and fails the run
// (11-05, 11-07, 11-10 all died in syncing_files/updating_pages). Guard the one retry and a job timeout that fits it.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'pages.yml'), 'utf8');
const job = src.slice(src.indexOf('\n  deploy:'));
let bad = 0;
const fail = m => { console.error('pages_deploy_test: ' + m); bad++; };
const deploys = [...job.matchAll(/uses:\s*actions\/deploy-pages@/g)].length;
if (deploys < 2) fail(`expected a first deploy plus one retry, found ${deploys} deploy-pages step(s)`);
if (!/id:\s*dep\s*\n\s*uses:\s*actions\/deploy-pages@\S+\s*\n\s*continue-on-error:\s*true/.test(job))
  fail('first deploy (id: dep) must be continue-on-error so the retry can run');
if (!/id:\s*dep2\s*\n\s*if:\s*steps\.dep\.outcome\s*==\s*'failure'/.test(job))
  fail("retry (id: dep2) must run only when steps.dep.outcome == 'failure'");
if (!/steps\.dep\.outputs\.page_url\s*\|\|\s*steps\.dep2\.outputs\.page_url/.test(job))
  fail('environment url must fall back to the retry step');
const t = +(job.match(/timeout-minutes:\s*(\d+)/) || [])[1];
if (!(t >= 25)) fail(`deploy job timeout-minutes ${t} leaves no room for two 10-min deploy waits after the build`);
if (bad) process.exit(1);
console.log(`pages deploy test passed (${deploys} deploy steps, ${t} min job timeout)`);
