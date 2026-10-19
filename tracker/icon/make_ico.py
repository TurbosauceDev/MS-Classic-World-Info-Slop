# Packs icon-<size>.png from render.js into tracker/app/icon.ico. Usage: python3 make_ico.py <pngdir>
import sys, os
from PIL import Image
d = sys.argv[1]; sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
imgs = [Image.open(os.path.join(d, f"icon-{s}.png")).convert("RGBA") for s in sizes]
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app", "icon.ico")
imgs[-1].save(out, sizes=[(s, s) for s in sizes], append_images=imgs[:-1])
