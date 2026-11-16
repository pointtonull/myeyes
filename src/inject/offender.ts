import {isStableClass, isStableId} from '../utils/offender';
import type {Offender, OffenderKind} from '../utils/offender';

/**
 * MyEyes! AI Enhance, page side (the pipeline: background/glare-fixer.ts).
 * Answers three requests about the page, never painting anything:
 * - find: what paints each glare point the screenshot found → Offender
 * - match / hitRates: which community selectors hit the offender, and how much
 *   of each style still matches the page (freshness)
 * - try: virtual render — add a candidate sheet, read the offender's computed
 *   background, remove the sheet, all in one task, so no frame shows it.
 */

const REPLACED = new Set(['img', 'video', 'canvas', 'iframe', 'svg', 'picture', 'object', 'embed']);
let targets: Element[] = [];

function linear(c: number): number {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminance of an rgb()/rgba() computed colour; null when (mostly) transparent or unparsable. */
function luminanceOf(color: string): number | null {
    const m = /rgba?\(([^)]+)\)/.exec(color || '');
    if (!m) {
        return null;
    }
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    if (a < 0.5) {
        return null;
    }
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function painterAt(x: number, y: number): {el: Element; kind: OffenderKind; Y: number | null} {
    for (const el of document.elementsFromPoint(x, y)) {
        const tag = el.tagName.toLowerCase();
        if (REPLACED.has(tag)) {
            return {el, kind: 'media', Y: null};
        }
        const style = getComputedStyle(el);
        const Y = luminanceOf(style.backgroundColor);
        if (style.backgroundImage && /url\(/.test(style.backgroundImage)) {
            return {el, kind: 'bg-image', Y};
        }
        if (Y !== null) {
            return {el, kind: 'color', Y};
        }
    }
    // nothing paints here: the canvas shows the root background
    return {el: document.documentElement, kind: 'canvas', Y: luminanceOf(getComputedStyle(document.documentElement).backgroundColor)};
}

function isUnique(selector: string): boolean {
    try {
        return document.querySelectorAll(selector).length === 1;
    } catch {
        return false;
    }
}

/** A selector that finds the element again: stable id anchor, else stable classes, else positions. */
function pathOf(el: Element): string {
    const parts: string[] = [];
    for (let e: Element | null = el; e && parts.length < 7; e = e.parentElement) {
        if (e.id && isStableId(e.id)) {
            parts.unshift(`#${CSS.escape(e.id)}`);
            break;
        }
        let part = e.tagName.toLowerCase();
        const classes = [...e.classList].filter(isStableClass).slice(0, 2);
        if (classes.length) {
            part += `.${classes.map((c) => CSS.escape(c)).join('.')}`;
        } else if (e.parentElement) {
            const same = [...e.parentElement.children].filter((s) => s.tagName === e!.tagName);
            if (same.length > 1) {
                part += `:nth-of-type(${same.indexOf(e) + 1})`;
            }
        }
        parts.unshift(part);
        if (e === document.body || e === document.documentElement) {
            break;
        }
        // stop as soon as the path is unique
        if (parts.length >= 2 && isUnique(parts.join(' > '))) {
            break;
        }
    }
    return parts.join(' > ');
}

/** The opaque background around an element: nearest painted ancestor, else the page's. */
function surroundOf(el: Element): {color: string; Y: number} | null {
    for (let e = el.parentElement; e; e = e.parentElement) {
        const color = getComputedStyle(e).backgroundColor;
        const Y = luminanceOf(color);
        if (Y !== null) {
            return {color, Y};
        }
    }
    return null;
}

function describe(el: Element, kind: OffenderKind, Y: number | null): Offender {
    return {
        path: pathOf(el),
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        classes: [...el.classList].filter(isStableClass),
        kind,
        Y,
        surround: surroundOf(el),
    };
}

/** `points` are viewport fractions (0..1), so screenshot scale and device pixels don't matter. */
function find(points: Array<[number, number]>): Array<Offender & {index: number}> {
    targets = [];
    return points.map(([fx, fy]) => {
        const {el, kind, Y} = painterAt(fx * innerWidth, fy * innerHeight);
        let index = targets.indexOf(el);
        if (index < 0) {
            index = targets.push(el) - 1;
        }
        return {...describe(el, kind, Y), index};
    });
}

function match(index: number, selectors: string[]): number[] {
    const el = targets[index];
    if (!el) {
        return [];
    }
    const hits: number[] = [];
    selectors.forEach((selector, i) => {
        try {
            if (el.matches(selector)) {
                hits.push(i);
            }
        } catch {
            // invalid or unsupported selector in a community style
        }
    });
    return hits;
}

function hitRates(styles: string[][]): number[] {
    return styles.map((selectors) => {
        let valid = 0;
        let used = 0;
        for (const selector of selectors) {
            try {
                valid++;
                if (document.querySelector(selector)) {
                    used++;
                }
            } catch {
                valid--;
            }
        }
        return valid ? used / valid : 0;
    });
}

function tryFixes(index: number, cssList: string[]): Array<number | null> {
    const el = targets[index];
    if (!el) {
        return cssList.map(() => null);
    }
    return cssList.map((css) => {
        const style = document.createElement('style');
        style.className = 'darkreader darkreader--myeyes-try'; // the dynamic theme leaves .darkreader sheets alone
        style.textContent = css;
        (document.head || document.documentElement).append(style);
        const Y = luminanceOf(getComputedStyle(el).backgroundColor);
        style.remove();
        return Y;
    });
}

export function handleOffenderRequest(op: string, args: any): any {
    switch (op) {
        case 'find':
            return find(args.points);
        case 'match':
            return match(args.index, args.selectors);
        case 'hitRates':
            return hitRates(args.styles);
        case 'try':
            return tryFixes(args.index, args.css);
        default:
            return null;
    }
}
