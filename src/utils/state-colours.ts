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
 * 5. the hue is the value, turned into a hue scale: how far the original was
 *    from white (or black) picks a hue between the setting's `from` and `to`
 *    (OKLab L is perceptually even, so the scale is too). The more saturated
 *    the original, the less it moves: a grey follows the scale fully, an
 *    intense colour keeps its own hue, and in between the two blend (round the
 *    short way of the hue wheel). Text uses the same range turned 180°.
 * Only backgrounds that were light and text that was dark are tinted (those are
 * the states the mapping loses): dark areas, shadows and light text keep their
 * look. Text is tinted much less (it is already distinguishable); colours that keep
 * their own colour after the mapping are left alone; results stay in gamut.
 *
 * Three theme settings: `stateColours`, the strength (0..100, no control of its
 * own; 0 switches the tint off), and `stateHueFrom` / `stateHueTo`, the two
 * ends of the hue scale (State colors slider): degrees on the hue wheel,
 * -180..180 relative to the violet-blue that backgrounds use for pure greys
 * (text is turned 180° from that). The ends may be in either order.
 */

export type StateKind = 'background' | 'text';

/** Theme default (0..100). 0 = Dark Reader's own mapping, unchanged. */
export const DEFAULT_STATE_COLOURS = 72; // Carlos, on Gmail: 50 "enoughish", 72 preferred

/** Hue scale ends, degrees relative to the neutral hue (-180..180): the state closest to white sits at `from`. */
export const DEFAULT_STATE_HUE_FROM = 0;
export const DEFAULT_STATE_HUE_TO = 90;
export const MAX_STATE_HUE = 180;

/** Chroma (OKLab) of the tint at strength 100; 50 gives 0.06, the default 72 about 0.086. */
const MAX_CHROMA = 0.12;
/** Distance from the reference at which the tint is full. */
const KNEE = 0.08;
/** Text gets this fraction of the tint. */
const TEXT_FACTOR = 0.25;
/** Below this the original has no hue worth keeping. */
const MIN_OWN_CHROMA = 0.004;
/** Hue (OKLab, degrees) at the middle of the scale: violet-blue for backgrounds, the opposite for text. */
export const NEUTRAL_HUE: Record<StateKind, number> = {background: 265, text: 85};
/** Backgrounds are tinted only if they were light: none below this OKLab L, full above the next. */
const LIGHT_BG_FROM = 0.55;
const LIGHT_BG_TO = 0.75;
/** Text is tinted only if it was dark: full below this OKLab L, none above the next. */
const DARK_TEXT_FROM = 0.35;
const DARK_TEXT_TO = 0.55;
/**
 * Distance from the reference (OKLab L) at which the hue scale reaches `to`.
 * Light-page states live close to white: Gmail's read/hover/selected rows and
 * Material greys sit within 0.12 of it (L 0.88-1.0), so the scale ends at 0.15
 * (L 0.85) and both ends matter on ordinary pages; anything greyer is "to".
 * Text states sit well away from black, so its scale is longer.
 */
const HUE_SPAN: Record<StateKind, number> = {background: 0.15, text: DARK_TEXT_FROM};
/**
 * OKLab saturation (chroma / lightness) from which a colour keeps its own hue
 * completely. Measured: greys 0, Gmail's light-blue selected row 0.06, pale
 * pink/yellow banners 0.02-0.03, intense blues/reds/greens 0.25-0.36.
 */
const FULL_SATURATION = 0.1;

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

/** Degrees → 0..360. */
function wrapHue(degrees: number): number {
    return ((degrees % 360) + 360) % 360;
}

/** Hue (degrees) `weight` of the way from `a` to `b`, the short way round the wheel. */
function blendHue(a: number, b: number, weight: number): number {
    const diff = ((b - a + 540) % 360 + 360) % 360 - 180;
    return wrapHue(a + weight * diff);
}

/**
 * The hue (OKLab, degrees 0..360) a state's tint gets: its value (distance
 * from white for backgrounds, from black for text) picks a point on the scale
 * from `hueFrom` to `hueTo` (relative to the kind's neutral hue, see header),
 * and the more saturated the original, the more it keeps its own hue instead.
 */
export function stateHue(
    original: Pick<RGBA, 'r' | 'g' | 'b'>,
    kind: StateKind,
    hueFrom = DEFAULT_STATE_HUE_FROM,
    hueTo = DEFAULT_STATE_HUE_TO,
): number {
    const [L0, a0, b0] = rgbToOklab(original);
    const distance = Math.max(0, kind === 'background' ? 1 - L0 : L0);
    const t = Math.min(1, distance / HUE_SPAN[kind]);
    const scaleHue = wrapHue(NEUTRAL_HUE[kind] + hueFrom + t * (hueTo - hueFrom));
    const chroma = Math.hypot(a0, b0);
    if (chroma <= MIN_OWN_CHROMA) {
        return scaleHue;
    }
    const saturation = Math.min(1, chroma / Math.max(L0, 0.05) / FULL_SATURATION);
    return blendHue(wrapHue(Math.atan2(b0, a0) * 180 / Math.PI), scaleHue, 1 - saturation);
}

/**
 * The tinted version of `mapped` (Dark Reader's dark colour for `original`):
 * same OKLab lightness, chroma from tintChroma, hue from stateHue. Unchanged
 * when the strength is 0, the original is plain white/black or outside the
 * relevant range, or the mapped colour already carries more colour than the
 * tint. Channels are whole numbers: the engine formats colours as hex, and a
 * fractional channel ("#14.1194…") is an invalid colour, which the browser
 * drops (the background vanishes).
 */
export function stateTint(
    original: RGBA,
    mapped: RGBA,
    kind: StateKind,
    strength: number,
    hueFrom = DEFAULT_STATE_HUE_FROM,
    hueTo = DEFAULT_STATE_HUE_TO,
): RGBA {
    const chroma = chromaFor(rgbToOklab(original)[0], kind, strength);
    if (chroma < 1e-4) {
        return mapped;
    }
    const [L, am, bm] = rgbToOklab(mapped);
    if (Math.hypot(am, bm) >= chroma) {
        return mapped;
    }
    const hue = stateHue(original, kind, hueFrom, hueTo) * Math.PI / 180;
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
