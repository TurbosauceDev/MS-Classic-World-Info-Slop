"""Turn saved meowdb item-page text (JSON {weapon: {drops: text}}) into data/sources/meowdb_weapon_drops.json. Usage: parse_meowdb_drops.py in.json out.json"""
import json, re, sys
raw = json.load(open(sys.argv[1]))
out = {}
for name, v in raw.items():
    t = v.get("drops") or ""
    pairs = lambda block: [[a, int(b)] for a, b in re.findall(r"^(.+)\nLv (\d+)$", block, re.M)]
    comm, msea = [], []
    if "Community sourced" in t:
        c = t.split("Community sourced", 1)[1]
        c = re.split(r"MSEA Reference Drops|Quest Reward", c)[0]
        comm = pairs(c)
    if "MSEA Reference Drops" in t:
        m = t.split("MSEA Reference Drops", 1)[1]
        m = m.split("Dropped list above.", 1)[-1]
        m = re.split(r"\nQuest Reward|\nSimilar |\nChange history", m)[0]
        msea = pairs(m)
    if comm: out[name] = {"from": "community", "drops": comm}
    elif msea: out[name] = {"from": "msea", "drops": msea}
    else: out[name] = {"from": None, "drops": []}
json.dump({"source": "meowdb item pages (Dropped By: community reports; MSEA Reference Drops: pre-Big-Bang MapleSEA, "
           "which meowdb says Classic appears to share)", "read": "2026-10-06", "weapons": out}, open(sys.argv[2], "w"), indent=1)
print(len(out), "weapons;", sum(1 for v in out.values() if v["drops"]), "with drops;", sum(1 for v in out.values() if v["from"] == "community"), "community")
