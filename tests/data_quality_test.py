#!/usr/bin/env python3
r"""Data-quality validation across the price sources. Complements the per-source unit tests
(tests/classicmarket_test.py, mesoindex_test.py, ...), which check each fetcher's own aggregation
logic against frozen fixtures. This test checks the CURRENT data files in data/sources/ for
cross-source consistency + the internal invariants the fetchers promise but no test enforced:

  - meso.watch contract (scripts/build_data.py step_prices): every item in `now` (cheapest live
    listing, [price, qty, ch, map, seller]) is present in `asks` (all listings, same first 5 fields).
    Catches a fetcher format drift that would silently drop the live-listing -> asks join.
  - meso.watch `seen` (first-seen unix min) is parallel to `asks`: len(seen[k]) <= len(asks[k]).
  - every price-source item id is a numeric string (^\d{1,10}$): defends against __proto__/constructor
    keys sneaking in from upstream (server/src/check.js cleanRun does the same on input).
  - each source has the expected top-level shape (schema drift catches a renamed field early).
  - timestamps (read/generated/listed/src_listed) parse as dates (scripts/watchdog.py relies on these).
  - cross-source: no item has spread >= 100x across sources with >= 5 sales each (a definite unit
    error); items with spread >= 10x are reported as warnings (often thin data, not a bug).

Run: python3 tests/data_quality_test.py   (CI: tests.yml). No network -- reads local files only.
"""
import json, os, re, sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', 'sources')

# price-tracking blacklist (data/price_blacklist.json): items excluded from D.pw/cm/cmp/mi/mdb/ma/mw
# by the build steps. The raw source files still legitimately contain them (the sources are the
# fetchers' output, unfiltered), so the cross-source spread check must skip them too or it red-gates
# on items nobody tracks (2026-10-28: meowdb's 100-meso arrows row vs 1-meso elsewhere).
try:
    with open(os.path.join(ROOT, 'data', 'price_blacklist.json'), encoding='utf-8') as f:
        _BLJ = json.load(f)
    _BL_IDS = set(map(str, _BLJ.get('ids', [])))
    _BL_BLOCKS = [(int(a), int(b)) for a, b in _BLJ.get('id_blocks', [])]
except (OSError, ValueError):
    _BL_IDS, _BL_BLOCKS = set(), []


def blacklisted(k):
    if str(k) in _BL_IDS:
        return True
    try:
        n = int(k)
    except (TypeError, ValueError):
        return False
    return any(a <= n < b for a, b in _BL_BLOCKS)

ID_RE = re.compile(r'^\d{1,10}$')


def parse_date(s):
    if not s:
        return None
    try:
        d = datetime.fromisoformat(str(s).strip().replace('Z', '+00:00').replace(' ', 'T'))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


bad = 0
warns = 0
lines = []


def fail(msg):
    global bad
    lines.append(f'FAIL  {msg}')
    bad += 1


def warn(msg):
    global warns
    lines.append(f'warn  {msg}')
    warns += 1


def ok(msg):
    lines.append(f'ok    {msg}')


# per-source expected top-level keys (must be present)
SHAPES = {
    'mesowatch_prices.json': {'source', 'read', 'generated', 'items', 'hist', 'now', 'asks', 'listed'},
    'classicmarket_market.json': {'source', 'read', 'it'},
    'classicmarket_prices.json': {'source', 'read', 'it'},
    'meowdb_market.json': {'source', 'read', 'it'},
    'mesoindex.json': {'source', 'read', 'it'},
    'shopscans.json': {'source', 'ma', 'mw'},
}

# per-source price/sales extractor: (label, file, path-to-item-dict, price-idx, sales-idx)
# path = top-level key holding the per-item dict, or a tuple for nested paths
SOURCES = [
    ('meso.watch',         'mesowatch_prices.json',    'items',         0, 3),
    ('classicmarket.kr',   'classicmarket_market.json', 'it',           0, 3),
    ('meowdb',             'meowdb_market.json',        'it',            0, 2),
    ('mesoindex.com',      'mesoindex.json',            'it',            0, 3),
    ('mesoarbitrage.com',  'shopscans.json',             ('ma', 'it'),    0, 1),
    ('maplestory.watch',   'shopscans.json',             ('mw', 'it'),    0, 1),
]


def get_dict(j, path):
    if isinstance(path, tuple):
        d = j
        for k in path:
            d = d.get(k, {})
        return d
    return j.get(path, {})


# 1. shape + timestamp checks per source
for fname, keys in SHAPES.items():
    p = os.path.join(SRC, fname)
    if not os.path.exists(p):
        fail(f'{fname}: source file missing')
        continue
    j = load(p)
    missing = keys - set(j)
    if missing:
        fail(f'{fname}: missing top-level keys {sorted(missing)}')
    else:
        ok(f'{fname}: top-level shape ok')
    for k in ('read', 'generated', 'listed', 'src_listed'):
        if k in j and j[k] and parse_date(j[k]) is None:
            fail(f"{fname}: {k}={j[k]!r} doesn't parse as a date")

# 2. id-format + per-source value-shape checks
for name, fname, path, pidx, sidx in SOURCES:
    p = os.path.join(SRC, fname)
    if not os.path.exists(p):
        continue
    j = load(p)
    d = get_dict(j, path)
    bad_ids = [k for k in d if not ID_RE.match(str(k))]
    if bad_ids:
        fail(f'{name}: {len(bad_ids)} item ids not numeric (e.g. {bad_ids[:3]})')
    malformed = [k for k, v in d.items() if not (isinstance(v, list) and len(v) > max(pidx, sidx))]
    if malformed:
        fail(f'{name}: {len(malformed)} items have a malformed value (e.g. id={malformed[0]} -> {d.get(malformed[0])!r})')
    else:
        ok(f'{name}: {len(d)} items, all values well-formed')

# 3. meso.watch contract: now subset of asks (cheapest live listing is one of the asks)
pw = load(os.path.join(SRC, 'mesowatch_prices.json'))
asks = pw.get('asks', {})
now = pw.get('now', {})
seen = pw.get('seen', {})
missing = mismatch = 0
for k, v in now.items():
    if k not in asks:
        missing += 1
        continue
    if not any(list(a[:5]) == list(v[:5]) for a in asks[k]):
        mismatch += 1
if missing:
    fail(f'meso.watch: {missing} items in `now` have no `asks` entry')
if mismatch:
    fail(f'meso.watch: {mismatch} items in `now` are not present in `asks` (contract broken)')
if not missing and not mismatch:
    ok(f'meso.watch: all {len(now)} `now` listings are present in `asks`')

# 4. meso.watch `seen` parallel to `asks`: len(seen[k]) <= len(asks[k])
over = sum(1 for k, v in seen.items() if len(v) > len(asks.get(k, [])))
if over:
    fail(f'meso.watch: {over} items have `seen` longer than `asks`')
else:
    ok(f'meso.watch: `seen` parallel to `asks` ({len(seen)} items)')

# 5. cross-source spread: collect (price, sales) per item per source, flag egregious outliers
per_item = {}
for name, fname, path, pidx, sidx in SOURCES:
    p = os.path.join(SRC, fname)
    if not os.path.exists(p):
        continue
    j = load(p)
    for k, v in get_dict(j, path).items():
        try:
            price = v[pidx]
            sales = v[sidx] if sidx < len(v) else 0
        except (IndexError, TypeError):
            continue
        if not isinstance(price, (int, float)) or price <= 0:
            continue
        per_item.setdefault(k, []).append((name, price, sales if isinstance(sales, (int, float)) else 0))

spread10 = spread100 = 0
examples = []
for id_, lst in per_item.items():
    if blacklisted(id_):
        continue
    solid = [(s, p, n) for s, p, n in lst if n >= 5]
    if len(solid) < 2:
        continue
    prices = [p for _, p, _ in solid]
    lo, hi = min(prices), max(prices)
    if hi < 1000:
        continue  # 1-meso items (arrows): 1 vs 100 is bundle pricing noise, not a unit error (2060000, 10-28)
    spread = hi / lo if lo > 0 else 0
    if spread >= 100:
        spread100 += 1
        if len(examples) < 5:
            examples.append((id_, round(spread, 1), solid))
    elif spread >= 10:
        spread10 += 1
        if len(examples) < 5:
            examples.append((id_, round(spread, 1), solid))

if spread100:
    fail(f'cross-source: {spread100} items with spread >= 100x across sources with >=5 sales each (definite unit error); worst: {examples[:3]}')
else:
    ok('cross-source: no item has spread >= 100x across solid sources')
if spread10:
    warn(f'cross-source: {spread10} items with spread >= 10x (often thin data, not a bug); e.g. {examples[:3]}')
else:
    ok('cross-source: no item has spread >= 10x across solid sources')

print('\n'.join(lines))
if bad:
    print(f'\ndata-quality test failed ({bad})', file=sys.stderr)
    sys.exit(1)
print(f'\ndata-quality test passed ({warns} warning{"s" if warns != 1 else ""})')
