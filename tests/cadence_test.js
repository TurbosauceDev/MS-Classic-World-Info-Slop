// Cadence + coverage test for the scheduled poll workflows. Complements tests/cron.test.js (which only
// checks minute collisions and :00/:30 avoidance): this test asserts each poll's actual max cron gap is
// within the cadence Danny relies on, the workflow still HAS a schedule (cadence hasn't been removed by
// accident), and that scripts/watchdog.py's POLL_MAX threshold is >= 2x meso.watch's actual max cron gap
// (so the watchdog never false-alarms on a normal cadence — one skipped slot is tolerated).
//
// Why: cron.test.js would pass if someone changed mesowatch-poll.yml from 6 crons/hour to 1 cron/hour
// (no minute collision, no :00/:30), but the watchdog's POLL_MAX=120 would then false-alarm constantly.
// This test catches that drift. Run: node tests/cadence_test.js   (CI: tests.yml)
const fs = require('fs'), path = require('path');
const WF = path.join(__dirname, '..', '.github', 'workflows');
const WD = path.join(__dirname, '..', 'scripts', 'watchdog.py');

// expected max gap (minutes) per poll workflow file. Sourced from docs/ai + the workflow comments.
// Tighten the number if a cadence is intentionally slowed; this catches accidental cadence drift.
const EXPECT = {
  'mesowatch-poll.yml': 20,       // 6/hr -> 10 min apart; allow 20 (one skipped slot)
  'classicmarket-poll.yml': 120,  // 2x per 2h block -> 90 min max; allow 120
  'meowdb-market-poll.yml': 240,  // every 3h -> 180 min; allow 240
  'shopscans-poll.yml': 240,      // every 3h -> 180 min; allow 240
  'mesoindex-poll.yml': 240,      // every 3h -> 180 min; allow 240
  'shared-data.yml': 1500,        // daily -> 1440 min; allow 1500
};

// --- minimal 5-field cron expander (supports: *, */N, A-B, A-B/N, A,B,C, literal). Day-of-month/month/
// day-of-week are assumed '*' (every poll runs daily); only minute + hour set the cadence. ---
function expandField(expr, lo, hi) {
  const out = new Set();
  for (const part of String(expr).split(',')) {
    let step = 1, range = part;
    if (part.includes('/')) { const [r, s] = part.split('/'); step = +s; if (!step) continue; range = r; }
    let a, b;
    if (range === '*') { a = lo; b = hi; }
    else if (range.includes('-')) { const [x, y] = range.split('-').map(Number); a = x; b = y; }
    else { a = +range; b = +range; }
    if (Number.isNaN(a)) continue;
    for (let v = a; v <= b; v += step) if (v >= lo && v <= hi) out.add(v);
  }
  return [...out].sort((x, y) => x - y);
}

function minutesInDay(crons) {
  const out = new Set();
  for (const c of crons) {
    const f = c.trim().split(/\s+/);
    if (f.length < 5) continue;
    const mins = expandField(f[0], 0, 59), hrs = expandField(f[1], 0, 23);
    for (const h of hrs) for (const m of mins) out.add(h * 60 + m);
  }
  return [...out].sort((x, y) => x - y);
}

function maxGap(mins) {
  if (!mins.length) return Infinity;
  const day = 1440;
  let worst = 0;
  for (let i = 1; i < mins.length; i++) worst = Math.max(worst, mins[i] - mins[i - 1]);
  return Math.max(worst, day - mins[mins.length - 1] + mins[0]);
}

function cronsOf(file) {
  if (!fs.existsSync(file)) return null;
  const src = fs.readFileSync(file, 'utf8');
  return [...src.matchAll(/cron:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
}

let bad = 0; const lines = [];
for (const [f, expect] of Object.entries(EXPECT)) {
  const crons = cronsOf(path.join(WF, f));
  if (crons === null) { lines.push(`FAIL  ${f}: file missing`); bad++; continue; }
  if (!crons.length) { lines.push(`FAIL  ${f}: no schedule cron (cadence gone — was it moved to manual only?)`); bad++; continue; }
  const mins = minutesInDay(crons), gap = maxGap(mins), ok = gap <= expect;
  if (!ok) bad++;
  lines.push(`${ok ? 'ok  ' : 'FAIL'}  ${f}: max gap ${gap} min (expected <= ${expect}), ${mins.length} runs/day`);
}

// cross-check: scripts/watchdog.py monitors meso.watch only. Its POLL_MAX threshold must be >= 2x
// meso.watch's actual max cron gap, so the watchdog never fires on a normal cadence (one skipped slot).
const mwCrons = cronsOf(path.join(WF, 'mesowatch-poll.yml')) || [];
const mwGap = maxGap(minutesInDay(mwCrons));
const wd = fs.existsSync(WD) ? fs.readFileSync(WD, 'utf8') : '';
const thresholds = {};
// watchdog.py declares its thresholds as a tuple: `POLL_MAX, PRICES_MAX, LISTED_MAX = 120, 180, 360`
const tuple = wd.match(/POLL_MAX\s*,\s*PRICES_MAX\s*,\s*LISTED_MAX\s*=\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
if (tuple) thresholds.POLL_MAX = +tuple[1], thresholds.PRICES_MAX = +tuple[2], thresholds.LISTED_MAX = +tuple[3];
else for (const m of wd.matchAll(/([A-Z_]+_MAX)\s*=\s*(\d+)/g)) thresholds[m[1]] = +m[2];   // fallback: individual lines
const pollMax = thresholds.POLL_MAX || 0;
if (!pollMax) { lines.push('FAIL  watchdog POLL_MAX not found in scripts/watchdog.py'); bad++; }
else if (pollMax < 2 * mwGap) { lines.push(`FAIL  watchdog POLL_MAX=${pollMax} < 2x meso.watch cadence (${2 * mwGap})`); bad++; }
else lines.push(`ok    watchdog POLL_MAX=${pollMax} >= 2x meso.watch cadence (${2 * mwGap})`);

console.log(lines.join('\n'));
if (bad) { console.error(`\ncadence test failed (${bad})`); process.exit(1); }
console.log('\ncadence test passed');
