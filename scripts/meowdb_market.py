"""meowdb Free Market -> D.mdb (build_data.py step "mdbmarket"; the fetch is scripts/fetch_meowdb_market.js, needs Chromium).

D.mdb = {read, it: {itemId: [usual, asks, sales, cheapestSell, bestBuy, forSale, median24h, n24h, median7d, n7d]},
         ls: {itemId: [[buy 0/1, price each, qty, channel, FM room, spot, meowdb user, bumped UTC minutes, direct 0/1, stats]]}}
usual = meowdb's 14-day median of players' asks seen in shops, "sold for" reports and finished meowdb trades.
Run alone: python3 scripts/meowdb_market.py  (applies the saved file to data/data.json)."""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "sources" / "meowdb_market.json"

def step(D):
    if not SRC.exists(): return
    j = json.loads(SRC.read_text())
    D["mdb"] = {"read": j["read"], "it": {k: v for k, v in j["it"].items() if k in D["items"]},
                "ls": {k: v for k, v in j["ls"].items() if k in D["items"]}}

if __name__ == "__main__":
    D = json.load(open(ROOT / "data" / "data.json"))
    step(D)
    (ROOT / "data" / "data.json").write_text(json.dumps(D, separators=(",", ":")))
    m = D.get("mdb", {})
    print(f"data/data.json: meowdb prices for {len(m.get('it', {}))} items, listings for {len(m.get('ls', {}))}")
