"""Post art (Turbozo 2026-11-04): pull the real game sprites out of data/data.json and bake the journal's
avatar set + the two sample posts' main images. Run by hand when the art changes:

    python3 scripts/make_post_art.py

Outputs (all committed, so the build never needs this script or PIL):
  src/posts/avatars/<author>.png   one sprite per poster: turbozo = Slime (green), glorg = Orange Mushroom
  src/posts/img/<slug>.png|jpg     the sample posts' "main image" banners (front matter `image:`)
Avatars must stay tiny (they ride the shell twice: POST_AVATARS + the feed); banners must stay under the
200 KB cap scripts/posts.py enforces. NEAREST scaling keeps the sprites crisp.
"""
import base64, io, json, math, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = json.loads((ROOT / "data" / "data.json").read_text())
AV = ROOT / "src" / "posts" / "avatars"
IM = ROOT / "src" / "posts" / "img"
try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:
    sys.exit("PIL is needed once, to bake the art: pip install pillow")

AVATARS = {"turbozo": ("mob", "7"), "glorg": ("mob", "9")}   # Slime / Orange Mushroom

def sprite(kind, i):
    raw = (D.get("mobimg") if kind == "mob" else D.get("iicons"))[i]
    return Image.open(io.BytesIO(base64.b64decode(raw.split(",", 1)[-1]))).convert("RGBA")

def up(im, n):
    return im.resize((im.width * n, im.height * n), Image.NEAREST)

def shadow(layer, cx, cy, w):
    sh = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse((cx - w // 2, cy - 7, cx + w // 2, cy + 7), fill=(20, 34, 18, 90))
    layer.alpha_composite(sh.filter(ImageFilter.GaussianBlur(5)))

def vgrad(size, top, bot):
    g = Image.new("RGB", (1, size[1]))
    for y in range(size[1]):
        t = y / (size[1] - 1)
        g.putpixel((0, y), tuple(round(a + (b - a) * t) for a, b in zip(top, bot)))
    return g.resize(size)

def banner_party():
    """welcome-to-the-journal: the classic road mobs line up (Slime, Blue Snail, Orange Mushroom, Green Mushroom)."""
    W, H = 880, 340
    im = vgrad((W, H), (214, 236, 248), (233, 246, 222)).convert("RGBA")
    dr = ImageDraw.Draw(im)
    dr.rectangle((0, H - 64, W, H), fill=(150, 190, 116))          # pixel ground band
    dr.rectangle((0, H - 64, W, H - 61), fill=(120, 158, 88))      # its darker top edge
    for x in range(30, W, 74):                                     # a few darker tufts so the band is not flat
        dr.rectangle((x, H - 38, x + 18, H - 34), fill=(134, 174, 102))
        dr.rectangle((x + 40, H - 22, x + 58, H - 18), fill=(134, 174, 102))
    cast = [("mob", "3", 3, 0.12), ("mob", "7", 4, 0.33), ("mob", "9", 3, 0.64), ("mob", "13", 2, 0.87)]
    for kind, i, n, fx in cast:
        s = up(sprite(kind, i), n)
        cx, by = int(W * fx), H - 58
        shadow(im, cx, by, int(s.width * 0.8))
        im.alpha_composite(s, (cx - s.width // 2, by - s.height))
    return im

def banner_gloves():
    """what-a-post-carry: the post mentions Work Gloves - the item's own icon on a workshop-dark card."""
    W, H = 880, 340
    im = vgrad((W, H), (44, 47, 60), (58, 62, 78)).convert("RGBA")
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((W // 2 - 240, H // 2 - 190, W // 2 + 240, H // 2 + 190), fill=(247, 191, 84, 70))
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(60)))
    dr = ImageDraw.Draw(im)
    for r in (118, 146):                                           # dotted workbench rings around the icon
        for a in range(0, 360, 14):
            x = W // 2 + r * __import__("math").cos(a * 3.14159 / 180)
            y = H // 2 + r * __import__("math").sin(a * 3.14159 / 180)
            dr.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(255, 255, 255, 40))
    g = up(sprite("item", "1082000"), 8)
    shadow(im, W // 2, H // 2 + g.height // 2 - 6, int(g.width * 0.7))
    im.alpha_composite(g, (W // 2 - g.width // 2, H // 2 - g.height // 2 - 10))
    return im

def banner_updates():
    """site-updates: the changelog posts' shared banner - a real game scroll (Cape STR Scroll icon) on the
    workshop-dark card, the same composition as the Work Gloves banner (Turbozo approved that family)."""
    W, H = 880, 340
    im = vgrad((W, H), (44, 47, 60), (58, 62, 78)).convert("RGBA")
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((W // 2 - 240, H // 2 - 190, W // 2 + 240, H // 2 + 190), fill=(247, 191, 84, 70))
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(60)))
    dr = ImageDraw.Draw(im)
    for r in (118, 146):                                           # dotted workbench rings around the icon
        for a in range(0, 360, 14):
            x = W // 2 + r * math.cos(a * math.pi / 180)
            y = H // 2 + r * math.sin(a * math.pi / 180)
            dr.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(255, 255, 255, 40))
    s = up(sprite("item", "2041010"), 8)
    shadow(im, W // 2, H // 2 + s.height // 2 - 6, int(s.width * 0.7))
    im.alpha_composite(s, (W // 2 - s.width // 2, H // 2 - s.height // 2 - 10))
    return im

def main():
    AV.mkdir(parents=True, exist_ok=True); IM.mkdir(parents=True, exist_ok=True)
    for who, (kind, i) in AVATARS.items():
        s = sprite(kind, i)
        p = AV / f"{who}.png"; s.save(p); print(f"{p.relative_to(ROOT)}  {s.size}  {p.stat().st_size} B")
    for name, im in [("welcome-to-the-journal", banner_party()), ("what-a-post-can-carry", banner_gloves()),
                     ("site-updates", banner_updates())]:
        p = IM / f"{name}.jpg"; im.convert("RGB").save(p, quality=85, optimize=True)
        print(f"{p.relative_to(ROOT)}  {im.size}  {p.stat().st_size} B")

if __name__ == "__main__":
    main()
