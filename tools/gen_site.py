#!/usr/bin/env -S uv run --script --quiet
# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow", "numpy", "fonttools", "brotli"]
# ///
"""Generate the project-site assets (docs/assets/) from brand/ and the UI fonts.

    uv run --script tools/gen_site.py          # or: python3 tools/gen_site.py
                                               # (needs Pillow, numpy, fonttools, brotli)

GitHub Pages serves only docs/, so everything docs/index.html uses is copied or
derived here. Never point the page at ../brand/. Outputs, in docs/assets/:

  mark.svg, mark-64.png   the glasses mark, copied from brand/ui-kit/brand/
                          (page logo and favicon; always load it through <img>
                          or <link>, never inline: every kit SVG reuses the
                          gradient ids "g" and "p")
  hero.webp               the happy blob, cropped from brand/reference/before-after.png.
                          Only the calm half of the scene goes on the page: the
                          stressed half has a near-white glare burst and this
                          site is for people whose eyes hurt. The arrow that
                          pointed at the blob from the stressed half is painted
                          out. See --check-glare.
  social-preview.jpg      1200x630 link-preview card (og:image, GitHub's "Social
                          preview"): the whole before -> after scene. It is only
                          ever seen as a thumbnail elsewhere.
  fonts/                  Open Sans (the extension's UI typeface, Apache-2.0)
                          subset to Latin, as woff2, plus its LICENSE.txt. Self
                          hosted on purpose: the page promises "collects
                          nothing", and a font CDN would see every visitor.

--check-glare prints how much of each crop is bright (CIE L* above 85), the
number the hero crop was chosen by.
"""
import argparse
import os
import shutil

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, "..")
BRAND = os.path.join(REPO, "brand")
KIT = os.path.join(BRAND, "ui-kit", "brand")
ART = os.path.join(BRAND, "reference", "before-after.png")
FONTS = os.path.join(REPO, "src", "ui", "assets", "fonts")
OUT = os.path.join(REPO, "docs", "assets")

# Crops, in before-after.png pixels (1536x1024).
HERO_BOX = (750, 312, 1536, 900)       # happy blob, below the hand-drawn wordmark
SOCIAL_BOX = (0, 105, 1536, 911)       # 1536x806 -> 1200x630 (1.905:1)
# The curved arrow pointing at the happy blob from the (cropped-out) stressed one.
ARROW_BOX = (724, 445, 882, 546)
FONT_FILES = ("OpenSans-Regular", "OpenSans-SemiBold")
# Basic Latin, Latin-1, general punctuation (dashes, quotes, ellipsis, bullet).
FONT_UNICODES = "U+0020-007E,U+00A0-00FF,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026"


def lstar(rgb):
    """CIE L* (0-100) of an HxWx3 uint8-range array."""
    a = rgb / 255.0
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    y = 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]
    return np.where(y > 0.008856, 116 * np.cbrt(y) - 16, 903.3 * y)


def paint_out(im, box, iterations=6000):
    """Fill box with the smooth surface that joins the pixels around it.

    Harmonic inpainting: start from the mean colour and relax every pixel of
    the box toward the average of its four neighbours, with the ring of pixels
    just outside the box held fixed. The art there is an empty, smooth purple
    gradient, so the result has no seam on any of the four sides. (Filling row
    by row from the left and right strips left a visible step, because the left
    strip sits in the glow of the stressed half.) Only meant for boxes on
    empty background.
    """
    x0, y0, x1, y1 = box
    a = np.asarray(im).astype(float)
    patch = a[y0 - 1:y1 + 1, x0 - 1:x1 + 1].copy()   # box plus a 1px frame
    patch[1:-1, 1:-1] = patch.mean(axis=(0, 1))
    for _ in range(iterations):
        patch[1:-1, 1:-1] = 0.25 * (patch[:-2, 1:-1] + patch[2:, 1:-1] + patch[1:-1, :-2] + patch[1:-1, 2:])
    a[y0:y1, x0:x1] = patch[1:-1, 1:-1]
    return Image.fromarray(a.round().clip(0, 255).astype("uint8"))


def build_hero():
    im = Image.open(ART).convert("RGB")
    hero = paint_out(im, ARROW_BOX).crop(HERO_BOX)
    hero.save(os.path.join(OUT, "hero.webp"), quality=86, method=6)
    return hero.size


def build_social():
    im = Image.open(ART).convert("RGB")
    card = im.crop(SOCIAL_BOX).resize((1200, 630), Image.Resampling.LANCZOS)
    card.save(os.path.join(OUT, "social-preview.jpg"), quality=88, optimize=True, progressive=True)


def build_mark():
    for name in ("logo-mark.svg", "logo-mark-64.png"):
        shutil.copyfile(os.path.join(KIT, name), os.path.join(OUT, name.replace("logo-", "")))


def build_fonts():
    from fontTools import subset

    os.makedirs(os.path.join(OUT, "fonts"), exist_ok=True)
    for name in FONT_FILES:
        options = subset.Options()
        options.flavor = "woff2"
        options.layout_features = ["kern", "liga", "ccmp", "locl", "mark", "mkmk"]
        options.name_IDs = [1, 2, 3, 4, 6, 13, 14]  # keep the licence notice
        font = subset.load_font(os.path.join(FONTS, name + ".ttf"), options)
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=subset.parse_unicodes(FONT_UNICODES))
        subsetter.subset(font)
        subset.save_font(font, os.path.join(OUT, "fonts", name + ".woff2"), options)
    shutil.copyfile(os.path.join(FONTS, "LICENSE.txt"), os.path.join(OUT, "fonts", "LICENSE.txt"))


def check_glare():
    im = Image.open(ART).convert("RGB")
    paths = {
        "hero crop": paint_out(im, ARROW_BOX).crop(HERO_BOX),
        "social card (whole scene)": im.crop(SOCIAL_BOX),
        "stressed half (not on the page)": im.crop((0, 105, 720, 911)),
    }
    for name, crop in paths.items():
        lum = lstar(np.asarray(crop).astype(float))
        print(f"{name:34s} mean L* {lum.mean():5.1f}   >85: {100 * (lum > 85).mean():5.2f}%   peak {lum.max():5.1f}")
    print("page background #15152f             L*   8.1")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check-glare", action="store_true", help="print how bright each crop is and exit")
    args = parser.parse_args()
    if args.check_glare:
        check_glare()
        return
    os.makedirs(OUT, exist_ok=True)
    build_mark()
    size = build_hero()
    build_social()
    build_fonts()
    print(f"wrote {os.path.relpath(OUT)}: hero {size[0]}x{size[1]}, social-preview 1200x630, mark, fonts")


if __name__ == "__main__":
    main()
