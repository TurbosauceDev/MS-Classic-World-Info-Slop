"""Price-tracking blacklist loader (data/price_blacklist.json). One canonical list consumed by
every price step (build_data.py step_prices + the per-source fetchers' keep() filters) so a
blacklisted item never reaches D.pw / D.cm / D.cmp / D.mi / D.mdb / D.ma / D.mw, and by
tests/data_quality_test.py's cross-source spread check, which reads the raw source files.
Rationale lives in the JSON's _readme; keep the two in sync."""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_BL = None


def _load():
    global _BL
    if _BL is None:
        with open(os.path.join(ROOT, "data", "price_blacklist.json"), encoding="utf-8") as f:
            j = json.load(f)
        _BL = (set(map(str, j.get("ids", []))), [(int(a), int(b)) for a, b in j.get("id_blocks", [])])
    return _BL


def is_bl(k):
    """True if item id k is price-blacklisted. Non-numeric ids are never blacklisted here
    (the id-format check owns those)."""
    ids, blocks = _load()
    k = str(k)
    if k in ids:
        return True
    try:
        n = int(k)
    except ValueError:
        return False
    return any(a <= n < b for a, b in blocks)
