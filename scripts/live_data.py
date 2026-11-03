"""The live (polled) sections of the site data, applied at BUILD time on top of data/data.json.

Pollers commit only their own small file in data/sources/ (Hermes 2026-11-02, review A2; they used to rewrite the
8.5 MB data.json every poll: 574 commits). scripts/build.py calls apply() before inlining the data, so the page, the
Pages copy and every test see today's prices even though the committed data.json carries old copies of these keys.
Each step is a pure function: (data.json's game data + one source file) -> one key, replaced whole.
  D.cm   fetch_classicmarket_listings   data/sources/classicmarket_prices.json
  D.cmp  fetch_classicmarket_market     data/sources/classicmarket_market.json
  D.ma/mw fetch_shopscans               data/sources/shopscans.json
  D.mi   fetch_mesoindex                data/sources/mesoindex.json
  D.mdb  meowdb_market                  data/sources/meowdb_market.json
  D.shared fetch_shared                 data/sources/shared_runs.json
Not here: D.pw (meso.watch: its step needs the OSMS export, scripts/build_data.py prices) and D.crank (parked).
A missing source file leaves the committed key as it is. Tested by tests/live_data_test.py.
"""
import importlib, json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
if str(ROOT / "scripts") not in sys.path: sys.path.insert(0, str(ROOT / "scripts"))
STEPS = ["fetch_classicmarket_listings", "fetch_classicmarket_market", "fetch_shopscans", "fetch_mesoindex", "meowdb_market", "fetch_shared"]

def apply(D):
    for m in STEPS: importlib.import_module(m).step(D)
    return D

def load():
    return apply(json.loads((ROOT / "data" / "data.json").read_text(encoding="utf-8")))
