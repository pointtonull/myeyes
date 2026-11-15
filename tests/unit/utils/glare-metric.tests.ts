import {
    countEdges,
    edgeMap,
    measureGlare,
    rankRenders,
    scoreRender,
    toLuma,
    unionEdges,
} from '../../../src/utils/glare-metric';
import type {Box, RGBAImage} from '../../../src/utils/glare-metric';

const W = 160;
const H = 120;
type RGB = [number, number, number];

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
const DARK_BG: RGB = [24, 26, 27]; // Dark Reader's dark background
const LIGHT_TEXT: RGB = [232, 230, 227];

/** A synthetic page: background, rows of "text" (2px glyph strokes), optional solid panel. */
function page(bg: RGB, fg: RGB | null, panel?: Box & {color: RGB}): RGBAImage {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const inText = fg && x >= 8 && x < W - 8 && y % 10 >= 4 && y % 10 < 6 && x % 4 < 2;
            const inPanel = panel && x >= panel.x && x < panel.x + panel.width && y >= panel.y && y < panel.y + panel.height;
            const [r, g, b] = inPanel ? panel!.color : inText ? fg! : bg;
            const p = (y * W + x) * 4;
            data[p] = r;
            data[p + 1] = g;
            data[p + 2] = b;
            data[p + 3] = 255;
        }
    }
    return {width: W, height: H, data};
}

const original = toLuma(page(WHITE, BLACK));
const inverted = toLuma(page(DARK_BG, LIGHT_TEXT));
const reference = edgeMap(original);

describe('glare metric: dark is not the goal, a comfortable AND legible page is', () => {
    it('a proper dark render keeps the structure without glare', () => {
        const s = scoreRender(inverted, reference);
        expect(s.glare).toBeLessThan(0.02);
        expect(s.retention).toBeGreaterThan(0.95);
        expect(s.score).toBeGreaterThan(0.9);
    });

    it('the raw white page is nearly all glare', () => {
        const s = scoreRender(original, reference);
        expect(s.glare).toBeGreaterThan(0.85);
        expect(s.retention).toBe(1);
        expect(s.score).toBeLessThan(0.15);
    });

    it('blacking out the page is no fix: no glare, but no content either', () => {
        const black = toLuma(page(BLACK, null));
        const s = scoreRender(black, reference);
        expect(s.glare).toBe(0);
        expect(s.retention).toBe(0);
        expect(s.score).toBeLessThan(scoreRender(inverted, reference).score - 0.8);
    });

    it('dimming the text into the background loses it', () => {
        const dimmed = toLuma(page([17, 17, 17], [34, 34, 34]));
        expect(scoreRender(dimmed, reference).retention).toBeLessThan(0.1);
    });

    it('white text strokes on black are not glare; a white panel is', () => {
        expect(measureGlare(inverted).glare).toBeLessThan(0.02);
        const panel = {x: 100, y: 60, width: 40, height: 30, color: WHITE};
        const withPanel = measureGlare(toLuma(page(DARK_BG, LIGHT_TEXT, panel)));
        const share = (panel.width * panel.height) / (W * H);
        expect(withPanel.glare).toBeGreaterThan(share * 0.8);
        expect(withPanel.glare).toBeLessThan(share * 1.5);
    });
});

describe('glare metric: relative hotspots and where they are', () => {
    it('a bright island in a dark page is a hotspot, located for the fix finder', () => {
        const panel = {x: 100, y: 60, width: 40, height: 30, color: WHITE};
        const report = measureGlare(toLuma(page(DARK_BG, LIGHT_TEXT, panel)));
        expect(report.hotspots).toBeGreaterThan(0.04);
        // regions are block-accurate (8px here): each side within one block of the panel's
        const [box] = report.regions;
        const block = 8;
        expect(Math.abs(box.x - panel.x)).toBeLessThan(block);
        expect(Math.abs(box.y - panel.y)).toBeLessThan(block);
        expect(Math.abs(box.x + box.width - (panel.x + panel.width))).toBeLessThan(block);
        expect(Math.abs(box.y + box.height - (panel.y + panel.height))).toBeLessThan(block);
        expect(report.regions).toHaveLength(1);
    });

    it('an all-white page is all glare but has no hotspot: nothing stands out', () => {
        const report = measureGlare(original);
        expect(report.glare).toBeGreaterThan(0.85);
        expect(report.hotspots).toBe(0);
    });
});

describe('ranking renders without ever showing a bright page', () => {
    it('ranks candidates against the union of their own edges', () => {
        const panel = {x: 100, y: 60, width: 40, height: 30, color: WHITE};
        const candidates = [
            toLuma(page(BLACK, null)), // blacked out
            toLuma(page(DARK_BG, LIGHT_TEXT, panel)), // misses a white panel
            inverted, // good
            toLuma(page([17, 17, 17], [34, 34, 34])), // text dimmed away
        ];
        const ranked = rankRenders(candidates);
        expect(ranked[0].index).toBe(2);
        expect(ranked[1].index).toBe(1);
        // blacked out and dimmed-away both land near zero, far behind
        expect(ranked.slice(2).map((r) => r.index).sort()).toEqual([0, 3]);
        expect(Math.max(ranked[2].score, ranked[3].score)).toBeLessThan(0.1);
    });

    it('the union reference keeps edges any render showed', () => {
        const a = edgeMap(inverted);
        const b = edgeMap(toLuma(page(BLACK, null)));
        expect(countEdges(unionEdges([a, b]))).toBe(countEdges(a));
    });
});
