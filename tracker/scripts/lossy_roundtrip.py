# Lossy report-picture spike (0.3.45, Danny's "see if jpg would be cheaper").
# Round-trips every fixture PNG under tracker/tests/frames*/ through a lossy
# encoder, decodes it back, and saves the decoded pixels as a PNG with the SAME
# name in tests/frames-lossy-webp/<sub>/ or tests/frames-lossy-jpeg/<sub>/, so
# the reader tests can be pointed at the lossy pixels unchanged (the readers see
# exactly what a lossy report file yields after decode).
#
# RESULT (2026-11-05): BOTH WebP q90 and JPEG q85 fail reader tests that pass on
# the originals - inventory.test.js misses all slot counts on 18 frames on both,
# cv.test.js's same-map crop-hash assertion fails on both (lossy noise is
# inherent), chat.test.js fails on both, quest/proc fail on WebP q90 only,
# readers.test.js worsens (7 wrong -> 9 WebP / 8 JPEG). Report frames therefore
# stay LOSSLESS WebP. Re-run this if the readers ever gain noise tolerance.
#
# Ad hoc only: needs Pillow (pip install pillow), not a repo dependency.
#   python scripts/lossy_roundtrip.py            # from tracker/
import os, sys
from PIL import Image, ImageChops

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests")
FMTS = [("WEBP", 90, "frames-lossy-webp"), ("JPEG", 85, "frames-lossy-jpeg")]

for sub in sorted(os.listdir(ROOT)):
    src = os.path.join(ROOT, sub)
    if not (sub == "frames" or (sub.startswith("frames-") and os.path.isdir(src))):
        continue
    for name in sorted(os.listdir(src)):
        if not name.lower().endswith(".png"):
            continue
        im = Image.open(os.path.join(src, name)).convert("RGBA")
        for fmt, q, outdir in FMTS:
            d = os.path.join(ROOT, outdir, sub)
            os.makedirs(d, exist_ok=True)
            tmp = os.path.join(d, "tmp.bin")
            enc = im if fmt == "WEBP" else im.convert("RGB")
            enc.save(tmp, fmt, quality=q, **({} if fmt == "WEBP" else {"subsampling": 0}))
            dec = Image.open(tmp).convert("RGBA")
            dec.save(os.path.join(d, name), "PNG")   # keep the .png name so tests run unchanged
            os.remove(tmp)
            diff = ImageChops.difference(im, dec)
            print(f"{outdir}/{sub}/{name}: maxdiff={diff.getextrema()}")
print("done")
