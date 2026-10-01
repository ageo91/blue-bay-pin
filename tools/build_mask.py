"""Build the surface mask for a hole artwork.

The game reads the ground under the ball from a coarse grid (one cell per 4x4 px):
0 trees/out of bounds, 1 fairway/tee, 2 rough, 3 sand, 4 green, 5 cart path, 6 water, 7 rocks.

    python3 tools/build_mask.py assets/holes/hole-5.jpg 5 --green 1200,300 --tee 150,800 --pin 1210,290

Writes assets/masks/hole-5.js plus a colour preview (tools/preview-hole-5.png) to check
the result. Colour thresholds are tuned for the current art style; if a surface comes
out wrong in the preview, adjust the thresholds in classify() and run it again.
"""
import argparse, pathlib
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = pathlib.Path(__file__).resolve().parent.parent
PALETTE = [(20, 20, 20), (150, 220, 50), (60, 160, 40), (250, 225, 170),
           (190, 255, 60), (240, 240, 240), (30, 90, 200), (150, 140, 130)]


def point(s):
    x, y = s.split(",")
    return int(x), int(y)


def classify(a, green_seed):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    cls = np.full(r.shape, 2, np.uint8)                                   # rough
    cls[(g > 198) & (r > 112) & (b < 75)] = 1                             # fairway stripes
    cls[((b > r + 30) & (g < 170)) | (a.sum(2) < 150)] = 0                # dark trees, background
    cls[(b > 150) & (b > r + 40)] = 6                                     # water
    cls[(abs(r - g) < 20) & (abs(g - b) < 25) & (r > 80) & (r < 210)] = 7 # rocks
    cls[(r > 215) & (g > 215) & (b > 200) & (r - b < 30)] = 5             # cart path
    cls[(r > 230) & (g > 195) & (b > 140) & (b < 200)] = 3                # sand
    light = (g > 225) & (r > 140) & (b < 80)
    lab, _ = ndimage.label(light)
    cls[lab == lab[green_seed[1], green_seed[0]]] = 4                     # putting green
    fair = ndimage.binary_closing(cls == 1, np.ones((9, 9)))
    cls[fair & (cls == 2)] = 1
    return cls


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("hole", type=int)
    ap.add_argument("--green", type=point, required=True, help="x,y of a pixel on the putting green")
    ap.add_argument("--tee", type=point, required=True, help="x,y of the tee (forced to fairway)")
    ap.add_argument("--pin", type=point, required=True, help="x,y of the hole (forced to green)")
    args = ap.parse_args()

    a = np.asarray(Image.open(args.image).convert("RGB")).astype(int)
    h, w = a.shape[:2]
    cls = classify(a, args.green)
    grid = Image.fromarray(cls).filter(ImageFilter.ModeFilter(7)).resize((w // 4, h // 4), Image.NEAREST)
    c = np.asarray(grid).copy()
    ys, xs = np.mgrid[0:c.shape[0], 0:c.shape[1]]
    cx, cy = xs * 4 + 2, ys * 4 + 2
    c[(cx - args.tee[0]) ** 2 + (cy - args.tee[1]) ** 2 < 34 ** 2] = 1
    near_pin = (cx - args.pin[0]) ** 2 + (cy - args.pin[1]) ** 2 < 22 ** 2
    c[near_pin & (c != 3)] = 4

    out = ROOT / f"assets/masks/hole-{args.hole}.js"
    out.write_text(f'(window.BB_MASKS=window.BB_MASKS||{{}})[{args.hole}]="' + "".join(map(str, c.flatten())) + '";\n')
    prev = ROOT / f"tools/preview-hole-{args.hole}.png"
    Image.fromarray(np.array(PALETTE, np.uint8)[c]).resize((c.shape[1] * 2, c.shape[0] * 2), Image.NEAREST).save(prev)
    print(f"Wrote {out.relative_to(ROOT)} (grid {c.shape[1]}x{c.shape[0]}, mw/mh for data.js) and {prev.relative_to(ROOT)}")
    print(f"Artwork size for data.js: w:{w}, h:{h}")


if __name__ == "__main__":
    main()
