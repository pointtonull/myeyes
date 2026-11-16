import type {RGBA} from './color';

/**
 * MyEyes! "State colours" — pure, no browser APIs
 * (tests: tests/unit/utils/state-colours.tests.ts; applied in
 * inject/dynamic-theme/modify-colors.ts after Dark Reader's own mapping).
 *
 * Dark Reader maps every light background into a narrow dark band and treats
 * light blues as neutral, so states that light pages mark with a slight shade
 * or tint — read vs unread rows, hover, selected, zebra stripes — become
 * almost the same dark grey (Gmail's read/unread rows: ΔE 3.0 → 2.2).
 *
 * This puts that information back as a tint, without adding light:
 * 1. relative to a reference — how far the original colour was from white
 *    (backgrounds) or from black (text), so plain white stays plain;
 * 2. chroma, not hue alone — a hue on a near-grey is invisible;
 * 3. a square-root gain with a cap — the differences that matter are a few
 *    percent, a straight multiplier would either miss them or repaint the page;
 * 4. Dark Reader's perceptual lightness is kept exactly (OKLab L): states get
 *    distinguishable at the same low brightness, nothing gets brighter;
 * 5. the original hue is reused when there is one (Gmail's blue); pure greys
 *    get a fixed hue, opposite for text and backgrounds.
 * Only backgrounds that were light and text that was dark are tinted (those are
 * the states the mapping loses): dark areas, shadows and light text keep their
 * look. Text is tinted much less (it is already distinguishable); colours that keep
 * their own colour after the mapping are left alone; results stay in gamut.
 */

export type StateKind = 'background' | 'text';

/** Theme default (0..100). 0 = Dark Reader's own mapping, unchanged. */
export const DEFAULT_STATE_COLOURS = 72; // Carlos, on Gmail: 50 "enoughish", 72 preferred

/** Chroma (OKLab) of the tint at strength 100; 50 gives 0.06, the default 72 about 0.086. */
const MAX_CHROMA = 0.12;
/** Distance from the reference at which the tint is full. */
const KNEE = 0.08;
/** Text gets this fraction of the tint. */
const TEXT_FACTOR = 0.25;
/** Below this the original has no hue worth keeping. */
const MIN_OWN_CHROMA = 0.004;
/** Hue for pure greys: violet-blue for backgrounds, the opposite for text. */
const NEUTRAL_HUE: Record<StateKind, number> = {background: 265, text: 85};
/** Backgrounds are tinted only if they were light: none below this OKLab L, full above the next. */
const LIGHT_BG_FROM = 0.55;
const LIGHT_BG_TO = 0.75;
/** Text is tinted only if it was dark: full below this OKLab L, none above the next. */
const DARK_TEXT_FROM = 0.35;
const DARK_TEXT_TO = 0.55;

function toLinear(c: number): number {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function fromLinear(v: number): number {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * (v ** (1 / 2.4)) - 0.055;
    return c * 255;
}

/** sRGB (0..255) → OKLab [L, a, b]. */
export function rgbToOklab({r, g, b}: Pick<RGBA, 'r' | 'g' | 'b'>): [number, number, number] {
    const R = toLinear(r), G = toLinear(g), B = toLinear(b);
    const l = Math.cbrt(0.4122214708 * R + 0.5363137098 * G + 0.0514856247 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
}

/** OKLab → sRGB (0..255, unclamped: out-of-gamut values fall outside). */
export function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
        fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    ];
}

function inGamut(rgb: number[]): boolean {
    return rgb.every((c) => c >= -0.5 && c <= 255.5);
}

/** OKLab ΔE ×100 (≈2 is just noticeable). */
export function deltaE(x: Pick<RGBA, 'r' | 'g' | 'b'>, y: Pick<RGBA, 'r' | 'g' | 'b'>): number {
    const a = rgbToOklab(x);
    const b = rgbToOklab(y);
    return 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function smoothstep(from: number, to: number, x: number): number {
    const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
    return t * t * (3 - 2 * t);
}

/**
 * Only states the mapping actually loses: backgrounds that were LIGHT (the
 * dark scheme squeezes those together) and text that was DARK. A dark original
 * (a black video player, a #333 header, a shadow) or light text keeps its own
 * look: tinting those encodes nothing and would turn whole areas purple.
 */
function relevance(L0: number, kind: StateKind): number {
    return kind === 'background' ? smoothstep(LIGHT_BG_FROM, LIGHT_BG_TO, L0) : 1 - smoothstep(DARK_TEXT_FROM, DARK_TEXT_TO, L0);
}

function chromaFor(L0: number, kind: StateKind, strength: number): number {
    const distance = Math.max(0, kind === 'background' ? 1 - L0 : L0);
    const max = MAX_CHROMA * (Math.min(100, Math.max(0, strength)) / 100) * (kind === 'text' ? TEXT_FACTOR : 1);
    return max * Math.min(1, Math.sqrt(distance / KNEE)) * relevance(L0, kind);
}

/** How much tint (OKLab chroma) a colour gets: √distance from white (bg) / black (text), capped, light bg / dark text only. */
export function tintChroma(original: Pick<RGBA, 'r' | 'g' | 'b'>, kind: StateKind, strength: number): number {
    return chromaFor(rgbToOklab(original)[0], kind, strength);
}

/**
 * The tinted version of `mapped` (Dark Reader's dark colour for `original`):
 * same OKLab lightness, chroma from tintChroma, the original's own hue or the
 * kind's neutral hue. Unchanged when the strength is 0, the original is plain
 * white/black or outside the relevant range, or the mapped colour already
 * carries more colour than the tint. Channels are whole numbers: the engine
 * formats colours as hex, and a fractional channel ("#14.1194…") is an
 * invalid colour, which the browser drops (the background vanishes).
 */
export function stateTint(original: RGBA, mapped: RGBA, kind: StateKind, strength: number): RGBA {
    const [L0, a0, b0] = rgbToOklab(original);
    const chroma = chromaFor(L0, kind, strength);
    if (chroma < 1e-4) {
        return mapped;
    }
    const [L, am, bm] = rgbToOklab(mapped);
    if (Math.hypot(am, bm) >= chroma) {
        return mapped;
    }
    const hue = Math.hypot(a0, b0) > MIN_OWN_CHROMA ? Math.atan2(b0, a0) : NEUTRAL_HUE[kind] * Math.PI / 180;
    const at = (c: number) => oklabToRgb(L, c * Math.cos(hue), c * Math.sin(hue));
    let rgb = at(chroma);
    if (!inGamut(rgb)) {
        // the largest chroma the screen can show at this lightness
        let lo = 0;
        let hi = chroma;
        rgb = at(0);
        for (let i = 0; i < 14; i++) {
            const c = (lo + hi) / 2;
            const candidate = at(c);
            if (inGamut(candidate)) {
                lo = c;
                rgb = candidate;
            } else {
                hi = c;
            }
        }
    }
    const [r, g, b] = rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))));
    return {r, g, b, a: mapped.a};
}
