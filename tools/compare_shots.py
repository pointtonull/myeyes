#!/usr/bin/env python3
"""Put two screenshots side by side, labelled Before / After, for a PR.

    python3 tools/compare_shots.py before.png after.png --out pr-assets/popup.png
    python3 tools/compare_shots.py before.png after.png --out x.png --crop

Both images are scaled to the same height, set on MyEyes!' deep-indigo
background with a divider between them. --crop first trims each image to its
content (the popup preview page is mostly empty background; this is the same
crop tools/preview_popup.py applies, so it also doubles the resolution and
writes <name>_crop.png next to each input).

Needs Pillow (`pip install pillow`). Used by the myeyes-pr skill
(.claude/skills/myeyes-pr/SKILL.md); see CONTRIBUTE.md.
"""
import argparse
import os

from PIL import Image, ImageDraw, ImageFont

BG = (0x15, 0x15, 0x2F)
INK = (0xF6, 0xF2, 0xFF)
MUTED = (0xC8, 0xBC, 0xE5)
ACCENT = (0x98, 0x60, 0xF5)
PAD = 28
GAP = 40
LABEL_H = 54


def load_font(size: int):
    try:
        return ImageFont.load_default(size=size)  # Pillow >= 10.1
    except TypeError:
        return ImageFont.load_default()


def to_height(im: Image.Image, height: int) -> Image.Image:
    if im.height == height:
        return im
    return im.resize((round(im.width * height / im.height), height), Image.Resampling.LANCZOS)


def compare(before: Image.Image, after: Image.Image, label_before="Before", label_after="After") -> Image.Image:
    height = max(before.height, after.height)
    before, after = to_height(before, height), to_height(after, height)
    width = PAD * 2 + before.width + GAP + after.width
    sheet = Image.new("RGB", (width, PAD * 2 + LABEL_H + height), BG)
    draw = ImageDraw.Draw(sheet)
    font = load_font(26)
    x = PAD
    for label, im, color in ((label_before, before, MUTED), (label_after, after, INK)):
        draw.text((x + im.width / 2, PAD + LABEL_H / 2), label.upper(), fill=color, font=font, anchor="mm")
        sheet.paste(im, (x, PAD + LABEL_H))
        x += im.width + GAP
    mid = PAD + before.width + GAP // 2
    draw.line([(mid, PAD + LABEL_H), (mid, PAD + LABEL_H + height)], fill=ACCENT, width=2)
    return sheet


def main():
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument("before")
    parser.add_argument("after")
    parser.add_argument("--out", required=True, help="where to write the side-by-side PNG")
    parser.add_argument("--crop", action="store_true", help="trim each image to its content first")
    parser.add_argument("--label-before", default="Before")
    parser.add_argument("--label-after", default="After")
    args = parser.parse_args()

    paths = [args.before, args.after]
    if args.crop:
        from preview_popup import crop_popup  # sibling script: same trim as the preview tool
        paths = [crop_popup(p) or p for p in paths]
    images = [Image.open(p).convert("RGB") for p in paths]
    out = os.path.abspath(os.path.expanduser(args.out))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    compare(images[0], images[1], args.label_before, args.label_after).save(out)
    print(out)


if __name__ == "__main__":
    main()
