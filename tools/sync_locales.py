#!/usr/bin/env python3
"""Propagate new message keys from src/_locales/en.config to every locale.

    python3 tools/sync_locales.py [--check]

Dark Reader's locale files must mirror en.config line for line (same keys at
the same positions, same blank lines — enforced by
tests/unit/config/locales.tests.ts). After adding a key to en.config, run this:
each locale is rebuilt in en.config's key order, keeping its own translation
for every key it has and filling missing keys with the English text (what the
browser would fall back to anyway). Keys a locale has but en.config doesn't
are dropped. --check only reports which files would change (exit 1 if any).
"""
import argparse
import glob
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LOCALES = os.path.join(HERE, "..", "src", "_locales")


def parse(text):
    """(header_lines, {key: block_lines}, [keys in order]); a block is '@key' + following lines."""
    header, blocks, order, current = [], {}, [], None
    for line in text.split("\n"):
        if line.startswith("@"):
            current = line[1:]
            order.append(current)
            blocks[current] = [line]
        elif current is None:
            header.append(line)
        else:
            blocks[current].append(line)
    return header, blocks, order


def rebuild(en_text, loc_text):
    en_header, en_blocks, en_order = parse(en_text)
    _, loc_blocks, _ = parse(loc_text)
    lines = list(en_header)
    for key in en_order:
        own = loc_blocks.get(key)
        # keep the translation only if it has the same shape as English
        lines.extend(own if own is not None and len(own) == len(en_blocks[key]) else en_blocks[key])
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument("--check", action="store_true", help="report files that would change, don't write")
    args = parser.parse_args()

    with open(os.path.join(LOCALES, "en.config"), encoding="utf-8") as handle:
        en_text = handle.read()
    changed = []
    for path in sorted(glob.glob(os.path.join(LOCALES, "*.config"))):
        if os.path.basename(path) == "en.config":
            continue
        with open(path, encoding="utf-8") as handle:
            text = handle.read()
        new = rebuild(en_text, text)
        if new != text:
            changed.append(os.path.basename(path))
            if not args.check:
                with open(path, "w", encoding="utf-8") as handle:
                    handle.write(new)
    print(f"{'would change' if args.check else 'updated'} {len(changed)} locale(s): {', '.join(changed) or '-'}")
    return 1 if (args.check and changed) else 0


if __name__ == "__main__":
    sys.exit(main())
