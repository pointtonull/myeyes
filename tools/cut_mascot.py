#!/usr/bin/env python3
"""Cut the MyEyes! mascot out of the popup mockup into a transparent PNG.

    ~/.virtualenvs/p3/bin/python tools/cut_mascot.py [--preview DIR]

Crops the mascot from brand/reference/popup-mockup.png and keys out the
background: pixels connected to the crop border whose colour is close to the
background become transparent, with a soft ramp so the purple glow fades out
instead of ending in a hard edge. Enclosed dark areas (the laptop) are kept
because they are not border-connected. Writes
src/ui/assets/images/myeyes-mascot.png. --preview also writes the result
composited on the pane colour and on a checkerboard, for eyeballing.

Needs Pillow, numpy and scipy.
"""
import argparse
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, "..")
SRC = os.path.join(REPO, "brand", "reference", "popup-mockup.png")
OUT = os.path.join(REPO, "src", "ui", "assets", "images", "myeyes-mascot.png")
LAB_OUT = os.path.join(REPO, "src", "ui", "assets", "images", "myeyes-lab-mascot.png")
LAB_BOX = (0.0, 0.0, 1.0, 0.85)  # drops the "The Experimenter" caption under the rack

# crop box as fractions of the mockup (left, top, right, bottom)
BOX = (0.03, 0.085, 0.395, 0.312)
FILL_T = 70.0   # colour distance below which a border-connected pixel is "background"
CLEAR_T = 18.0  # at/below this distance the pixel is fully transparent
PANE = (0x15, 0x15, 0x2f)
# laptop lid + base, in crop coordinates (inset ~3px from the bright rim)
LAPTOP = [(47, 153), (192, 170), (212, 236), (290, 250), (298, 258),
          (225, 281), (78, 257)]


def cut(img, box_fractions=BOX, protect_polygon=LAPTOP):
    w, h = img.size
    box = tuple(int(f * s) for f, s in zip(box_fractions, (w, h, w, h)))
    rgb = np.asarray(img.convert("RGB").crop(box), dtype=np.float32)

    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.linalg.norm(rgb - bg, axis=2)

    labels = np.asarray(ndimage.label(dist < FILL_T)[0])  # pyright: ignore[reportIndexIssue]
    edge_ids = np.unique(np.concatenate(
        [labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    region = np.isin(labels, edge_ids[edge_ids > 0])

    alpha = np.ones(dist.shape, dtype=np.float32)
    ramp = np.clip((dist - CLEAR_T) / (FILL_T - CLEAR_T), 0.0, 1.0)
    alpha[region] = ramp[region]

    # The laptop's dark lid/base is close to the background colour and leaks to
    # the border where the dark base meets the dark background, so keying alone
    # punches it out. Keep it opaque with a polygon slightly inset from its
    # bright rim (crop coordinates; the source mockup is fixed).
    if protect_polygon:
        protect = Image.new("L", (rgb.shape[1], rgb.shape[0]), 0)
        ImageDraw.Draw(protect).polygon(protect_polygon, fill=255)
        alpha[np.asarray(protect) > 0] = 1.0
    alpha = ndimage.gaussian_filter(alpha, sigma=0.7)

    rgba = np.dstack([rgb, alpha * 255.0]).clip(0, 255).astype(np.uint8)
    out = Image.fromarray(rgba, "RGBA")
    bbox = Image.fromarray((alpha > 0.05).astype(np.uint8) * 255).getbbox()
    if bbox:
        pad = 2
        out = out.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                        min(out.width, bbox[2] + pad), min(out.height, bbox[3] + pad)))
    return out


def previews(mascot, directory):
    os.makedirs(directory, exist_ok=True)
    pane = Image.new("RGBA", mascot.size, PANE + (255,))
    pane.alpha_composite(mascot)
    pane.save(os.path.join(directory, "mascot_on_pane.png"))
    tile = 12
    checker = Image.new("RGBA", mascot.size, (200, 200, 200, 255))
    px = checker.load()
    assert px is not None
    for y in range(mascot.height):
        for x in range(mascot.width):
            if (x // tile + y // tile) % 2:
                px[x, y] = (255, 255, 255, 255)
    checker.alpha_composite(mascot)
    checker.save(os.path.join(directory, "mascot_on_checker.png"))


def main():
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument("--preview", help="also write composites into this directory")
    parser.add_argument("--lab", metavar="IMAGE",
                        help="instead, cut the lab (Advanced Tweaks) mascot out of this "
                             "whole-image crop into src/ui/assets/images/myeyes-lab-mascot.png")
    args = parser.parse_args()

    if args.lab:
        # the image is the mascot on its backdrop, minus the concept board's
        # caption strip at the bottom; no laptop to protect
        mascot, out = cut(Image.open(args.lab), LAB_BOX, None), LAB_OUT
    else:
        mascot, out = cut(Image.open(SRC)), OUT
    os.makedirs(os.path.dirname(out), exist_ok=True)
    mascot.save(out)
    print(out, mascot.size)
    if args.preview:
        previews(mascot, args.preview)
        print("previews in", args.preview)


if __name__ == "__main__":
    main()
