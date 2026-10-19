# Builds app/icon.ico: the game's Slime sprite (OSMS export thumbnail, data/data.json mobimg["7"]) on a purple gradient tile.
# Usage (repo root): python3 tracker/icon/make_icon.py [preview.png]
import json, base64, io, sys, pathlib
from PIL import Image, ImageDraw, ImageFilter, ImageChops
ROOT = pathlib.Path(__file__).resolve().parents[2]
SPRITE = Image.open(io.BytesIO(base64.b64decode(json.load(open(ROOT / "data" / "data.json"))["mobimg"]["7"]))).convert("RGBA")
SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]

def lerp(a, b, t): return tuple(round(x + (y - x) * t) for x, y in zip(a, b))

def tile(n, small):
    S = n * 4  # draw 4x, shrink for smooth edges
    stops = [(0, (167, 123, 255)), (.55, (109, 63, 214)), (1, (59, 26, 135))]
    g = Image.new("RGBA", (S, S))
    px = g.load()
    for y in range(S):
        for x in range(S):
            t = (x + y) / (2 * S - 2)
            i = 0 if t <= stops[1][0] else 1
            a, b = stops[i], stops[i + 1]
            px[x, y] = lerp(a[1], b[1], (t - a[0]) / (b[0] - a[0])) + (255,)
    glow = Image.new("L", (S, S), 0)
    ImageDraw.Draw(glow).ellipse((-S * .35, -S * .45, S * .85, S * .7), fill=95)
    glow = glow.filter(ImageFilter.GaussianBlur(S * .12))
    g = Image.composite(Image.new("RGBA", (S, S), (255, 255, 255, 255)), g, glow)
    pad, r = (0, S * .19) if small else (S * .03, S * .22)
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((pad, pad, S - pad - 1, S - pad - 1), r, fill=255)
    if not small:  # thin light rim along the top, soft shadow where the slime sits
        rim = Image.new("L", (S, S), 0)
        ImageDraw.Draw(rim).rounded_rectangle((pad, pad, S - pad - 1, S - pad - 1), r, outline=110, width=max(2, S // 64))
        fade = Image.linear_gradient("L").resize((S, S)).point(lambda v: 255 - v)
        g = Image.composite(Image.new("RGBA", (S, S), (255, 255, 255, 255)), g, ImageChops.multiply(rim, fade))
        sh = Image.new("L", (S, S), 0)
        ImageDraw.Draw(sh).ellipse((S * .2, S * .77, S * .8, S * .87), fill=120)
        sh = sh.filter(ImageFilter.GaussianBlur(S * .02))
        g = Image.composite(Image.new("RGBA", (S, S), (28, 11, 74, 255)), g, sh)
    g.putalpha(mask)
    return g.resize((n, n), Image.LANCZOS)

def icon(n):
    small = n <= 32
    t = tile(n, small)
    spr = SPRITE.crop((0, 12, 57, 51)) if small else SPRITE  # small sizes: body only (antenna would shrink it)
    k = n * (.96 if small else .74) / spr.width
    big = spr.resize((spr.width * 4, spr.height * 4), Image.NEAREST)  # keep pixel edges, then smooth down
    s = big.resize((round(spr.width * k), round(spr.height * k)), Image.LANCZOS)
    x = (n - s.width) // 2 if small else round(n / 2 - 29 * k)  # centre the body (sprite x 0-58), antenna hangs right
    y = round(n * (.88 if small else .84)) - s.height
    t.alpha_composite(s, (max(x, 0), max(y, 0)))
    return t

imgs = [icon(n) for n in SIZES]
out = ROOT / "tracker" / "app" / "icon.ico"
imgs[-1].save(out, sizes=[(n, n) for n in SIZES], append_images=imgs[:-1])
if len(sys.argv) > 1:  # preview: 256 px, then 16/24/32/48 at real size and zoomed
    c = Image.new("RGBA", (620, 300), (32, 32, 36, 255)); c.alpha_composite(imgs[-1], (16, 22)); x = 290
    for n in (16, 24, 32, 48):
        im = imgs[SIZES.index(n)]; c.alpha_composite(im, (x, 30)); c.alpha_composite(im.resize((64, 64), Image.NEAREST), (x, 100)); x += 80
    c.save(sys.argv[1])
