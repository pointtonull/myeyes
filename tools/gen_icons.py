#!/usr/bin/env python3
"""Generate MyEyes! toolbar/app icons from brand/glasses.svg.

The mark is the happy blue->purple glasses (see brand/reference/). Regenerate:
    python3 tools/gen_icons.py
Outputs me_*.png into src/icons/. Requires rsvg-convert (librsvg) + Pillow.

Variants:
  base          glasses on a dark rounded square -> me_16/48/128.png (app/menu)
  active        glasses on transparent           -> me_active_19/38.png (toolbar)
  active_light  glasses on transparent           -> me_active_light_19/38.png
"""
import os
import subprocess
import tempfile
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SVG = os.path.join(HERE, "..", "brand", "glasses.svg")
OUT = os.path.join(HERE, "..", "src", "icons")

BG_DARK = (26, 27, 46, 255)   # #1a1b2e app-tile background
SS = 4                        # supersample for crisp compositing


def rasterize(size):
    """Render glasses.svg to an RGBA PIL image, size x size, transparent bg."""
    fd, tmp = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    subprocess.run(
        ["rsvg-convert", "-w", str(size), "-h", str(size), SVG, "-o", tmp],
        check=True,
    )
    img = Image.open(tmp).convert("RGBA")
    os.remove(tmp)
    return img


def app_tile(size):
    """Glasses centred on a dark rounded square."""
    n = size * SS
    tile = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(tile)
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=0.22 * n, fill=BG_DARK)
    glasses = rasterize(int(n * 0.82))
    off = (n - glasses.width) // 2
    tile.alpha_composite(glasses, (off, off))
    return tile.resize((size, size), Image.Resampling.LANCZOS)


JOBS = [
    (16, "base", "me_16.png"),
    (48, "base", "me_48.png"),
    (128, "base", "me_128.png"),
    (19, "active", "me_active_19.png"),
    (38, "active", "me_active_38.png"),
    (19, "active_light", "me_active_light_19.png"),
    (38, "active_light", "me_active_light_38.png"),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    for size, variant, name in JOBS:
        img = app_tile(size) if variant == "base" else rasterize(size)
        img.save(os.path.join(OUT, name))
        print("wrote", name)


if __name__ == "__main__":
    main()
