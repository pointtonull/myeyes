/**
 * MyEyes! image triage — pure, no browser APIs
 * (tests: tests/unit/utils/image-triage.tests.ts; DOM shell:
 * src/inject/image-triage.ts).
 *
 * Under a dark theme, images are what stays bright: the engine never touches
 * <img>. Triage decides per image, from a small sample of its pixels:
 *
 * - diagram (mostly near-white, a few flat colours: charts, plots,
 *   screenshots of documents, math) → invert, so it sits dark like the page;
 * - dark line art on a transparent background (black logos, formulas,
 *   icons) → invert too, or it vanishes into the dark page;
 * - bright photo (lots of colours, high mean luminance) → dim, never invert:
 *   an inverted photo is a negative;
 * - everything else → leave alone.
 *
 * The verdict is a value of the IMAGE_ATTR attribute; one stylesheet per
 * engine (triageCSS) turns values into filters. "pending" dims a large image
 * while it is analysed, so it never shows at full brightness first.
 */

export const IMAGE_ATTR = 'data-myeyes-image';

export type ImageTreatment = 'invert' | 'dim' | 'none';
export type ImageReason = 'diagram' | 'dark-on-transparent' | 'bright-photo' | 'ok' | 'too-small' | 'empty';

export interface ImageStats {
    /** Share of pixels that are opaque enough to count (alpha ≥ 0.5). */
    opaque: number;
    /** Share of pixels that are (nearly) transparent (alpha < 0.1). */
    transparent: number;
    /** Mean linear luminance of the opaque pixels, 0..1. */
    meanY: number;
    /** Share of opaque pixels that are near white (Y > 0.8, ≈ L* 92). */
    nearWhite: number;
    /** Share of opaque pixels that are dark (Y < 0.11, ≈ L* 40). */
    dark: number;
    /** Share of opaque pixels in the 8 most common colours (4 bits/channel): ~1 for flat graphics, low for photos. */
    paletteTop8: number;
}

export interface Triage {
    treatment: ImageTreatment;
    reason: ImageReason;
}

const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
    const c = i / 255;
    SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Stats of an RGBA sample (ImageData.data of a small downscaled draw). */
export function imageStats(data: Uint8ClampedArray | Uint8Array): ImageStats {
    const total = data.length / 4;
    let opaque = 0;
    let transparent = 0;
    let sumY = 0;
    let nearWhite = 0;
    let dark = 0;
    const buckets = new Map<number, number>();
    for (let p = 0; p < data.length; p += 4) {
        const a = data[p + 3];
        if (a < 26) {
            transparent++;
        }
        if (a < 128) {
            continue;
        }
        opaque++;
        const r = data[p], g = data[p + 1], b = data[p + 2];
        const y = 0.2126 * SRGB_TO_LINEAR[r] + 0.7152 * SRGB_TO_LINEAR[g] + 0.0722 * SRGB_TO_LINEAR[b];
        sumY += y;
        if (y > 0.8) {
            nearWhite++;
        } else if (y < 0.11) {
            dark++;
        }
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    const top8 = [...buckets.values()].sort((x, y) => y - x).slice(0, 8).reduce((s, n) => s + n, 0);
    return {
        opaque: total ? opaque / total : 0,
        transparent: total ? transparent / total : 0,
        meanY: opaque ? sumY / opaque : 0,
        nearWhite: opaque ? nearWhite / opaque : 0,
        dark: opaque ? dark / opaque : 0,
        paletteTop8: opaque ? top8 / opaque : 0,
    };
}

export interface TriageOptions {
    /** Rendered size (CSS px) below which only dark line art is treated (icons). */
    minSide: number;
    minDarkArtSide: number;
}

const DEFAULT_OPTIONS: TriageOptions = {minSide: 48, minDarkArtSide: 12};

/** Decide what to do with an image from its pixel stats and rendered size (CSS px). */
export function triageImage(stats: ImageStats, size: {width: number; height: number}, options: Partial<TriageOptions> = {}): Triage {
    const {minSide, minDarkArtSide} = {...DEFAULT_OPTIONS, ...options};
    const side = Math.min(size.width, size.height);
    if (stats.opaque < 0.02) {
        return {treatment: 'none', reason: 'empty'};
    }
    // dark strokes on transparency: invisible on a dark page unless inverted
    if (stats.transparent >= 0.3 && stats.dark >= 0.7) {
        return side >= minDarkArtSide ? {treatment: 'invert', reason: 'dark-on-transparent'} : {treatment: 'none', reason: 'too-small'};
    }
    if (side < minSide) {
        return {treatment: 'none', reason: 'too-small'};
    }
    const flat = stats.paletteTop8 >= 0.8;
    if (stats.transparent < 0.3 && stats.nearWhite >= 0.45 && flat) {
        return {treatment: 'invert', reason: 'diagram'};
    }
    if (stats.meanY >= 0.45 && !flat) {
        return {treatment: 'dim', reason: 'bright-photo'};
    }
    return {treatment: 'none', reason: 'ok'};
}

// --- large light background images: a dark overlay, shown again on hover ----

/** Set (by inject/hover-reveal) on the element the pointer rests on, to show its image as it is. */
export const REVEAL_ATTR = 'data-myeyes-reveal';

/**
 * An inset shadow paints over an element's background but under its content,
 * so it darkens a background image while text on top stays crisp — unlike a
 * filter, which would dim the text too.
 */
export const OVERLAY_SHADOW = 'inset 0 0 0 100vmax rgba(0, 0, 0, 0.6)';

const PSEUDO_ELEMENT_END = /(::?(?:before|after))$/i;

/** `.hero` → `.hero[data-myeyes-reveal]`; `.hero::before` → `.hero[data-myeyes-reveal]::before`. */
export function revealSelector(selector: string): string {
    const s = selector.trim();
    const m = PSEUDO_ELEMENT_END.exec(s);
    return m ? `${s.slice(0, -m[1].length)}[${REVEAL_ATTR}]${m[1]}` : `${s}[${REVEAL_ATTR}]`;
}

/** The element a selector styles (pseudo-element part dropped), to find overlay targets in the DOM. */
export function elementSelector(selector: string): string {
    return selector.trim().replace(PSEUDO_ELEMENT_END, '');
}

/**
 * Rules for the dynamic theme's large light background images (they used to be
 * hidden): overlay them, show them again while revealed, gentle transition
 * unless the user prefers reduced motion.
 */
export function overlayCSS(selectors: string[]): string {
    if (!selectors.length) {
        return '';
    }
    const list = selectors.join(', ');
    return [
        `${list} {`,
        `    box-shadow: ${OVERLAY_SHADOW} !important;`,
        '    transition: box-shadow 200ms ease !important;',
        '}',
        `${selectors.map(revealSelector).join(', ')} {`,
        '    box-shadow: none !important;',
        '}',
        '@media (prefers-reduced-motion: reduce) {',
        `    ${list} { transition: none !important; }`,
        '}',
    ].join('\n');
}

/** Decide quickly whether a not-yet-analysed image is large enough to be dimmed while pending. */
export function shouldDimWhilePending(size: {width: number; height: number}): boolean {
    return size.width * size.height >= 160 * 120;
}

/**
 * The stylesheet for an engine. Dynamic / static themes leave images alone, so
 * the filters apply directly. Filter engines invert the whole page and then
 * re-invert images back to normal: there, "invert" means skipping that
 * re-inversion (dimming is left to the engine's own image filter).
 */
export function triageCSS(engine: 'dynamic' | 'filter'): string {
    const sel = (value: string) => `img[${IMAGE_ATTR}="${value}"]`;
    if (engine === 'filter') {
        return `${sel('invert')} { filter: none !important; }\n`;
    }
    return [
        `${sel('invert')} { filter: invert(90%) hue-rotate(180deg) !important; }`,
        `${sel('dim')} { filter: brightness(75%) !important; }`,
        // a dimmed photo is shown as it is while the pointer rests on it (inject/hover-reveal);
        // inverted diagrams are not: revealing them would flash white
        `${sel('dim')}[${REVEAL_ATTR}] { filter: none !important; }`,
        `${sel('pending')} { filter: brightness(60%) !important; }`,
        `@media (prefers-reduced-motion: no-preference) { img[${IMAGE_ATTR}] { transition: filter 150ms ease-out; } }`,
        '',
    ].join('\n');
}
