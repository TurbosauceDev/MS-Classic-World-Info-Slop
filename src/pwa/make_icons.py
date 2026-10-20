# Builds the site favicon / web-app icons: the game's Orange Mushroom (OSMS export thumbnail, data/data.json mobimg["9"])
# on a rounded purple gradient tile, same style as the tracker's Slime (tracker/icon/make_icon.py) so the two read as a set.
# icon-32/192/512: rounded, transparent corners ("any"). icon-maskable: full-bleed square, mushroom inside the safe zone.
# Usage (repo root): python3 src/pwa/make_icons.py [preview.png]
import json, base64, io, sys, pathlib
from PIL import Image, ImageDraw, ImageFilter, ImageChops
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "pwa"
SPRITE = Image.open(io.BytesIO(base64.b64decode(json.load(open(ROOT / "data" / "data.json"))["mobimg"]["9"]))).convert("RGBA")

def lerp(a, b, t): return tuple(round(x + (y - x) * t) for x, y in zip(a, b))

def tile(n, small, bleed=False):
    S = n * 4  # draw 4x, shrink for smooth edges
    stops = [(0, (176, 132, 255)), (.55, (115, 66, 220)), (1, (58, 24, 128))]
    g = Image.new("RGBA", (S, S))
    px = g.load()
    for y in range(S):
        for x in range(S):
            t = (x + y) / (2 * S - 2)
            i = 0 if t <= stops[1][0] else 1
            a, b = stops[i], stops[i + 1]
            px[x, y] = lerp(a[1], b[1], (t - a[0]) / (b[0] - a[0])) + (255,)
    glow = Image.new("L", (S, S), 0)  # warm glow behind the cap, picks up the orange
    ImageDraw.Draw(glow).ellipse((S * .1, S * .05, S * .9, S * .7), fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(S * .14))
    g = Image.composite(Image.new("RGBA", (S, S), (255, 196, 150, 255)), g, glow)
    pad, r = (0, S * .22) if small else (S * .03, S * .22)
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((pad, pad, S - pad - 1, S - pad - 1), r, fill=255)
    if not small:  # thin light rim along the top, soft shadow where the mushroom sits
        if not bleed:
            rim = Image.new("L", (S, S), 0)
            ImageDraw.Draw(rim).rounded_rectangle((pad, pad, S - pad - 1, S - pad - 1), r, outline=110, width=max(2, S // 64))
            fade = Image.linear_gradient("L").resize((S, S)).point(lambda v: 255 - v)
            g = Image.composite(Image.new("RGBA", (S, S), (255, 255, 255, 255)), g, ImageChops.multiply(rim, fade))
        k = .8 if bleed else 1
        sh = Image.new("L", (S, S), 0)
        ImageDraw.Draw(sh).ellipse((S * (.5 - .27 * k), S * (.5 + .3 * k), S * (.5 + .27 * k), S * (.5 + .38 * k)), fill=120)
        sh = sh.filter(ImageFilter.GaussianBlur(S * .02))
        g = Image.composite(Image.new("RGBA", (S, S), (28, 11, 74, 255)), g, sh)
    if not bleed: g.putalpha(mask)
    return g.resize((n, n), Image.LANCZOS)

def icon(n, bleed=False):
    small = n <= 32
    t = tile(n, small, bleed)
    k = n * (.9 if small else .7 * (.8 if bleed else 1)) / SPRITE.width
    big = SPRITE.resize((SPRITE.width * 4, SPRITE.height * 4), Image.NEAREST)  # keep pixel edges, then smooth down
    s = big.resize((round(SPRITE.width * k), round(SPRITE.height * k)), Image.LANCZOS)
    x = (n - s.width) // 2
    y = (n - s.height) // 2 if small else round(n * (.5 + .34 * (.8 if bleed else 1))) - s.height
    t.alpha_composite(s, (x, max(y, 0)))
    return t

imgs = {n: icon(n) for n in (32, 192, 512)}
for n, im in imgs.items(): im.save(OUT / f"icon-{n}.png", optimize=True)
icon(512, True).save(OUT / "icon-maskable.png", optimize=True)
if len(sys.argv) > 1:  # preview: 192 px, then 16/32 at real size and zoomed, and the maskable crop
    c = Image.new("RGBA", (560, 230), (32, 32, 36, 255)); c.alpha_composite(imgs[192], (16, 18)); x = 230
    for n in (16, 32):
        im = imgs[32].resize((n, n), Image.LANCZOS) if n == 16 else imgs[32]
        c.alpha_composite(im, (x, 30)); c.alpha_composite(im.resize((64, 64), Image.NEAREST), (x, 90)); x += 80
    m = Image.open(OUT / "icon-maskable.png").resize((150, 150), Image.LANCZOS); circ = Image.new("L", (150, 150), 0)
    ImageDraw.Draw(circ).ellipse((0, 0, 149, 149), fill=255); m.putalpha(ImageChops.multiply(m.getchannel("A"), circ))
    c.alpha_composite(m, (395, 40)); c.save(sys.argv[1])
