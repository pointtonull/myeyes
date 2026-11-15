#!/usr/bin/env python3
"""Generate MyEyes! toolbar/app icons from the UI kit's SVGs.

Regenerate with:
    python3 tools/gen_icons.py
Outputs me_*.png into src/icons/. Requires rsvg-convert (librsvg) + Pillow.

Sources (brand/ui-kit/):
  brand/logo-mark.svg      gradient glasses — app tiles + toolbar "on"
  icons/mode-disabled.svg  grey > < glasses — toolbar "off" (MyEyes isn't
                           darkening the current tab; see icon-manager.ts)

Outputs:
  base      glasses on a dark rounded tile -> me_16/48/128.png (app/menus)
  active    glasses on transparent          -> me_active_19/38.png
  inactive  grey glasses on transparent     -> me_inactive_19/38.png
"""
import os
import subprocess
import tempfile

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.join(HERE, "..", "brand", "ui-kit")
MARK = os.path.join(KIT, "brand", "logo-mark.svg")
OFF = os.path.join(KIT, "icons", "mode-disabled.svg")
OUT = os.path.join(HERE, "..", "src", "icons")

BG_DARK = (0x15, 0x15, 0x2F, 255)  # palette.json background
SS = 4                             # supersample for crisp compositing


def rasterize(svg, size):
    """Render an SVG to an RGBA PIL image, size x size, transparent bg."""
    fd, tmp = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), svg, "-o", tmp], check=True)
    img = Image.open(tmp).convert("RGBA")
    os.remove(tmp)
    return img


def solidify(img, factor=2.2):
    """Boost alpha: the kit's grey glasses are semi-transparent and vanish on light toolbars."""
    r, g, b, a = img.split()
    a = a.point(lambda v: min(255, int(v * factor)))
    return Image.merge("RGBA", (r, g, b, a))


def app_tile(size):
    """The glasses mark centred on a dark rounded square."""
    n = size * SS
    tile = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    ImageDraw.Draw(tile).rounded_rectangle([0, 0, n - 1, n - 1], radius=0.22 * n, fill=BG_DARK)
    glasses = rasterize(MARK, int(n * 0.86))
    off = (n - glasses.width) // 2
    tile.alpha_composite(glasses, (off, off))
    return tile.resize((size, size), Image.Resampling.LANCZOS)


JOBS = [
    (16, "base", "me_16.png"),
    (48, "base", "me_48.png"),
    (128, "base", "me_128.png"),
    (19, "active", "me_active_19.png"),
    (38, "active", "me_active_38.png"),
    (19, "inactive", "me_inactive_19.png"),
    (38, "inactive", "me_inactive_38.png"),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    for size, variant, name in JOBS:
        if variant == "base":
            img = app_tile(size)
        elif variant == "active":
            img = rasterize(MARK, size)
        else:
            img = solidify(rasterize(OFF, size))
        img.save(os.path.join(OUT, name))
        print("wrote", name)


if __name__ == "__main__":
    main()
