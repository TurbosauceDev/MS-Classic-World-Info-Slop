"""Shrink the PNGs embedded in data/data.json without changing a single pixel.

Run:  python3 scripts/squash_images.py      (build_data.py runs it at the end; then python3 scripts/build.py)

Game icons and sprites use few colors, so each PNG is re-saved as an exact-palette PNG (256 colors or fewer, alpha kept
per palette entry) or, failing that, a re-optimized RGBA PNG. A new file is kept only if it is smaller AND decodes to the
same RGBA pixels as the original, so the screenshot readers' pixel matching (51-shot.js, tracker) is unaffected.
Stays PNG on purpose: the page and the tracker build data:image/png URLs from these strings.
"""
import base64, io, json, pathlib, sys
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
KEYS = ("iicons", "icons", "npcimg", "mobimg", "mskill")

def rgba(b):
    im = Image.open(io.BytesIO(b)); im.load(); return im.convert("RGBA")

def exact_palette(im):
    """RGBA image -> P image with the same pixels, or None if it has more than 256 colors."""
    cols = im.getcolors(256)
    if cols is None: return None
    idx = {c: i for i, (_, c) in enumerate(cols)}
    p = Image.new("P", im.size)
    p.putpalette([v for _, c in cols for v in c[:3]])
    t = im.tobytes(); p.putdata([idx[tuple(t[i:i + 4])] for i in range(0, len(t), 4)])
    alpha = bytes(c[3] for _, c in cols)
    if any(a < 255 for a in alpha): p.info["transparency"] = alpha
    return p

def squash(b64):
    raw = base64.b64decode(b64); im = rgba(raw); best = raw
    for cand in (exact_palette(im), im):
        if cand is None: continue
        o = io.BytesIO(); cand.save(o, "PNG", optimize=True, **({"transparency": cand.info["transparency"]} if "transparency" in cand.info else {}))
        b = o.getvalue()
        if len(b) < len(best) and rgba(b).tobytes() == im.tobytes(): best = b
    return base64.b64encode(best).decode()

def main():
    p = ROOT / "data" / "data.json"; D = json.loads(p.read_text())
    for k in KEYS:
        v = D.get(k) or {}; before = sum(map(len, v.values()))
        for i in v: v[i] = squash(v[i])
        after = sum(map(len, v.values()))
        print(f"{k:7} {len(v):5} images  {before/1024:7.0f} KB -> {after/1024:7.0f} KB")
    s = json.dumps(D, separators=(",", ":")); p.write_text(s)
    print(f"data/data.json {len(s)/1024:.0f} KB")

if __name__ == "__main__": main()
