/**
 * MyEyes! render metric — pure, no browser APIs
 * (tests: tests/unit/utils/glare-metric.tests.ts).
 *
 * Scores a screenshot of a themed page. Brightness alone is NOT the goal:
 * painting everything black has no glare and no content. So a render is
 * judged on two axes:
 *
 * - glare: how much of the screen emits a lot of light. Measured per block
 *   as mean linear luminance (light actually reaching the eyes), so white
 *   text strokes on black (small, bright) barely count while a white panel
 *   counts fully. `hotspots` adds the relative part: bright islands in an
 *   otherwise dark page, which hurt most after the eyes adapt to the dark.
 * - retention ("pixels over a border detector"): how much of the page's
 *   structure survives — the share of reference edge pixels (Sobel on L*,
 *   the perceptual lightness) that still have an edge nearby. Inverting a
 *   page keeps its edges; blacking it out, or dimming text into the
 *   background, loses them.
 *
 * score = retention − glare − ½·hotspots: ~1 for a good dark render, ~0 for
 * both a raw white page and an all-black one.
 *
 * The edge reference never requires showing the user a bright page: pass the
 * union of the edge maps of every render tried (they're all dark), or the
 * current render's edges.
 */

export interface RGBAImage {
    width: number;
    height: number;
    /** RGBA, 4 bytes per pixel (ImageData.data). */
    data: Uint8ClampedArray | Uint8Array;
}

export interface LumaImage {
    width: number;
    height: number;
    /** Linear relative luminance, 0..1 (light emitted). */
    Y: Float32Array;
    /** CIE L* lightness, 0..100 (perceived). */
    L: Float32Array;
}

export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface GlareReport {
    /** Area-weighted share of the screen that is bright, 0..1. */
    glare: number;
    /** Share of the screen in bright blocks much brighter than the page's typical block, 0..1. */
    hotspots: number;
    /** Median block luminance (what the eyes adapt to). */
    adaptY: number;
    /** Bright regions (image pixels), largest first: where to look for offending elements. */
    regions: Box[];
}

export interface RenderScore {
    glare: number;
    hotspots: number;
    retention: number;
    score: number;
}

export interface MetricOptions {
    /** Block size in image pixels for the glare grid. */
    block: number;
    /** Luminance where glare starts / is total (smoothstep). */
    glareFrom: number;
    glareTo: number;
    /** A bright block is a hotspot when this many times brighter than the median block. */
    hotspotRatio: number;
    /** Minimum L* step (per pixel, Sobel-normalized) that counts as a visible edge. */
    edgeThreshold: number;
    /** How far (pixels) a reference edge may move and still count as kept. */
    edgeRadius: number;
}

export const DEFAULT_METRIC_OPTIONS: MetricOptions = {
    block: 8,
    glareFrom: 0.2, // ≈ L* 52 — mid grey: no glare yet
    glareTo: 0.75, // ≈ L* 89 — near white: full glare
    hotspotRatio: 3,
    edgeThreshold: 12, // dark grey text on black (≈ 8 L* apart) is gone
    edgeRadius: 1,
};

const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
    const c = i / 255;
    SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function lightness(Y: number): number {
    return Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : Y * (24389 / 27);
}

function smoothstep(from: number, to: number, x: number): number {
    const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
    return t * t * (3 - 2 * t);
}

export function toLuma({width, height, data}: RGBAImage): LumaImage {
    const n = width * height;
    const Y = new Float32Array(n);
    const L = new Float32Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
        const y = 0.2126 * SRGB_TO_LINEAR[data[p]] + 0.7152 * SRGB_TO_LINEAR[data[p + 1]] + 0.0722 * SRGB_TO_LINEAR[data[p + 2]];
        Y[i] = y;
        L[i] = lightness(y);
    }
    return {width, height, Y, L};
}

/** 1 where the L* gradient (Sobel, normalized to a step's height) reaches the threshold. */
export function edgeMap(img: LumaImage, threshold = DEFAULT_METRIC_OPTIONS.edgeThreshold): Uint8Array {
    const {width: w, height: h, L} = img;
    const edges = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            const tl = L[i - w - 1], t = L[i - w], tr = L[i - w + 1];
            const l = L[i - 1], r = L[i + 1];
            const bl = L[i + w - 1], b = L[i + w], br = L[i + w + 1];
            const gx = (tr + 2 * r + br) - (tl + 2 * l + bl);
            const gy = (bl + 2 * b + br) - (tl + 2 * t + tr);
            // a step of height H gives |g| = 4H
            if (Math.hypot(gx, gy) / 4 >= threshold) {
                edges[i] = 1;
            }
        }
    }
    return edges;
}

export function countEdges(edges: Uint8Array): number {
    let count = 0;
    for (let i = 0; i < edges.length; i++) {
        count += edges[i];
    }
    return count;
}

/** Edge pixels present in any of the maps (the structure any render managed to show). */
export function unionEdges(maps: Uint8Array[]): Uint8Array {
    const union = new Uint8Array(maps[0].length);
    for (const map of maps) {
        for (let i = 0; i < map.length; i++) {
            union[i] |= map[i];
        }
    }
    return union;
}

/** Share of reference edges that still have an edge within `radius` pixels (1 when the reference has none). */
export function edgeRetention(reference: Uint8Array, edges: Uint8Array, width: number, height: number, radius = DEFAULT_METRIC_OPTIONS.edgeRadius): number {
    let total = 0;
    let kept = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!reference[y * width + x]) {
                continue;
            }
            total++;
            found: for (let dy = -radius; dy <= radius; dy++) {
                const yy = y + dy;
                if (yy < 0 || yy >= height) {
                    continue;
                }
                for (let dx = -radius; dx <= radius; dx++) {
                    const xx = x + dx;
                    if (xx >= 0 && xx < width && edges[yy * width + xx]) {
                        kept++;
                        break found;
                    }
                }
            }
        }
    }
    return total === 0 ? 1 : kept / total;
}

/** Merge 4-connected marked blocks into bounding boxes (image pixels), largest first. */
function blockRegions(marked: Uint8Array, cols: number, rows: number, block: number, width: number, height: number): Box[] {
    const seen = new Uint8Array(marked.length);
    const boxes: Array<Box & {area: number}> = [];
    for (let start = 0; start < marked.length; start++) {
        if (!marked[start] || seen[start]) {
            continue;
        }
        let minC = cols, minR = rows, maxC = -1, maxR = -1, area = 0;
        const stack = [start];
        seen[start] = 1;
        while (stack.length) {
            const i = stack.pop()!;
            const c = i % cols, r = (i - c) / cols;
            area++;
            minC = Math.min(minC, c); maxC = Math.max(maxC, c);
            minR = Math.min(minR, r); maxR = Math.max(maxR, r);
            const next = [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1];
            for (const j of next) {
                if (j >= 0 && marked[j] && !seen[j]) {
                    seen[j] = 1;
                    stack.push(j);
                }
            }
        }
        const x = minC * block, y = minR * block;
        boxes.push({x, y, width: Math.min(width, (maxC + 1) * block) - x, height: Math.min(height, (maxR + 1) * block) - y, area});
    }
    return boxes.sort((a, b) => b.area - a.area).map(({x, y, width: w, height: h}) => ({x, y, width: w, height: h}));
}

export function measureGlare(img: LumaImage, options: Partial<MetricOptions> = {}): GlareReport {
    const {block, glareFrom, glareTo, hotspotRatio} = {...DEFAULT_METRIC_OPTIONS, ...options};
    const {width: w, height: h, Y} = img;
    const cols = Math.ceil(w / block);
    const rows = Math.ceil(h / block);
    const means = new Float32Array(cols * rows);
    const areas = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x1 = Math.min(w, (c + 1) * block), y1 = Math.min(h, (r + 1) * block);
            let sum = 0;
            for (let y = r * block; y < y1; y++) {
                for (let x = c * block; x < x1; x++) {
                    sum += Y[y * w + x];
                }
            }
            const area = (x1 - c * block) * (y1 - r * block);
            means[r * cols + c] = sum / area;
            areas[r * cols + c] = area;
        }
    }
    const sorted = Array.from(means).sort((a, b) => a - b);
    const adaptY = sorted[Math.floor(sorted.length / 2)];

    const total = w * h;
    let glare = 0;
    let hot = 0;
    const bright = new Uint8Array(means.length);
    for (let i = 0; i < means.length; i++) {
        const g = smoothstep(glareFrom, glareTo, means[i]);
        glare += g * areas[i];
        if (g >= 0.5) {
            bright[i] = 1;
        }
        if (means[i] >= glareFrom && means[i] >= hotspotRatio * adaptY) {
            hot += areas[i];
        }
    }
    return {
        glare: glare / total,
        hotspots: hot / total,
        adaptY,
        regions: blockRegions(bright, cols, rows, block, w, h),
    };
}

/** Score one render against a reference edge map (see module doc). Higher is better, ~1 is ideal. */
export function scoreRender(img: LumaImage, referenceEdges: Uint8Array, options: Partial<MetricOptions> = {}): RenderScore {
    const opts = {...DEFAULT_METRIC_OPTIONS, ...options};
    const {glare, hotspots} = measureGlare(img, opts);
    const retention = edgeRetention(referenceEdges, edgeMap(img, opts.edgeThreshold), img.width, img.height, opts.edgeRadius);
    return {glare, hotspots, retention, score: retention - glare - hotspots / 2};
}

/** Rank renders of the same page (e.g. candidate styles): each is scored against the union of all their edges. */
export function rankRenders(images: LumaImage[], options: Partial<MetricOptions> = {}): Array<RenderScore & {index: number}> {
    const opts = {...DEFAULT_METRIC_OPTIONS, ...options};
    const reference = unionEdges(images.map((img) => edgeMap(img, opts.edgeThreshold)));
    return images
        .map((img, index) => ({index, ...scoreRender(img, reference, opts)}))
        .sort((a, b) => b.score - a.score);
}
