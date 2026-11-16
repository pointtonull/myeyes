import type {RGBA} from '../../../src/utils/color';
import {DEFAULT_STATE_COLOURS, DEFAULT_STATE_HUE_FROM, DEFAULT_STATE_HUE_TO, NEUTRAL_HUE, deltaE, rgbToOklab, stateHue, stateTint, tintChroma} from '../../../src/utils/state-colours';

const hex = (h: string, a = 1): RGBA => ({r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16), a});
const hueDeg = (c: RGBA) => {
    const [, a, b] = rgbToOklab(c);
    return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
};
const hueApart = (x: number, y: number) => {
    const d = Math.abs(x - y) % 360;
    return Math.min(d, 360 - d);
};
const chroma = (c: RGBA) => {
    const [, a, b] = rgbToOklab(c);
    return Math.hypot(a, b);
};

// Gmail-like states, and what Dark Reader's mapping makes of them (measured from its maths)
const UNREAD = hex('#ffffff');
const READ = hex('#f2f6fc');
const HOVER = hex('#f5f5f5');
const SELECTED = hex('#c2dbff');
const DR = {unread: hex('#181a1b'), read: hex('#1d1f20'), hover: hex('#1e2021'), selected: hex('#292d2e'), grey: hex('#25282a')};
const tint = (original: RGBA, mapped: RGBA, strength = DEFAULT_STATE_COLOURS, from = DEFAULT_STATE_HUE_FROM, to = DEFAULT_STATE_HUE_TO) =>
    stateTint(original, mapped, 'background', strength, from, to);
// where a background of this lightness sits on the scale (0 = white, 1 = 0.15 of OKLab L away from it)
const scalePoint = (c: RGBA) => Math.min(1, (1 - rgbToOklab(c)[0]) / 0.15);

describe('state colours: states stay distinguishable without adding light', () => {
    it('makes read vs unread (and hover) clearly different at the default strength', () => {
        expect(deltaE(DR.unread, DR.read)).toBeLessThan(2.5); // Dark Reader alone
        expect(deltaE(tint(UNREAD, DR.unread), tint(READ, DR.read))).toBeGreaterThan(3.5);
        expect(deltaE(tint(UNREAD, DR.unread), tint(HOVER, DR.hover))).toBeGreaterThan(3.5);
    });

    it('keeps Dark Reader\'s perceptual lightness exactly (nothing gets brighter)', () => {
        for (const [o, m] of [[READ, DR.read], [HOVER, DR.hover], [SELECTED, DR.selected]] as const) {
            for (const [from, to] of [[0, 90], [-180, 180], [60, -120]]) {
                expect(Math.abs(rgbToOklab(tint(o, m, DEFAULT_STATE_COLOURS, from, to))[0] - rgbToOklab(m)[0])).toBeLessThan(0.004);
            }
        }
    });

    it('leaves plain white plain, and everything as is at strength 0', () => {
        expect(tint(UNREAD, DR.unread)).toBe(DR.unread);
        expect(tint(READ, DR.read, 0)).toBe(DR.read);
    });

    it('grows with distance from white as a square root, capped', () => {
        const near = tintChroma(READ, 'background', 50);
        const far = tintChroma(SELECTED, 'background', 50);
        expect(near).toBeGreaterThan(0.025); // a few percent already shows
        expect(far).toBeCloseTo(0.06, 5); // the cap at strength 50
        expect(tintChroma(READ, 'background', 100)).toBeCloseTo(2 * near, 5);
    });

    it('leaves what the mapping does not lose alone: dark backgrounds, shadows, light text', () => {
        for (const dark of ['#000000', '#111111', '#333333', '#1e3a5f']) {
            expect(tintChroma(hex(dark), 'background', 100)).toBe(0); // video players, headers, code blocks
        }
        const shadow = hex('#000000', 0.3);
        expect(stateTint(shadow, hex('#000000', 0.3), 'background', 100)).toEqual(hex('#000000', 0.3));
        for (const light of ['#ffffff', '#e8eaed', '#bdc1c6']) {
            expect(tintChroma(hex(light), 'text', 100)).toBe(0); // white labels, light secondary text
        }
        // mid greys fade in rather than switching on
        const mid = tintChroma(hex('#999999'), 'background', 100);
        expect(mid).toBeGreaterThan(0);
        expect(mid).toBeLessThan(tintChroma(hex('#cccccc'), 'background', 100));
    });

    it('tints text much less, from black', () => {
        expect(tintChroma(hex('#5f6368'), 'text', 50)).toBeLessThan(0.02);
    });

    it('leaves colours that keep their own colour after the mapping alone', () => {
        const red = hex('#b3261e');
        expect(stateTint(hex('#f9dedc'), red, 'background', 100)).toBe(red);
    });

    it('returns whole channel values (a fraction makes the engine write an invalid hex colour)', () => {
        for (const [o, m] of [[READ, DR.read], [HOVER, DR.hover], [SELECTED, DR.selected]] as const) {
            for (const [from, to] of [[0, 90], [-180, 180]]) {
                const out = tint(o, m, 100, from, to);
                expect(out).not.toBe(m);
                expect([out.r, out.g, out.b].every(Number.isInteger)).toBe(true);
            }
        }
        expect([...Object.values(stateTint(hex('#3c3c3c'), hex('#a0a0a0'), 'text', 100))].slice(0, 3).every(Number.isInteger)).toBe(true);
    });

    it('stays in gamut and keeps alpha, wherever the scale ends are', () => {
        for (const [from, to] of [[0, 90], [-180, 180], [180, -180], [90, 90], [-90, -90]]) {
            const out = stateTint(hex('#c2dbff', 0.5), hex('#050608', 0.5), 'background', 100, from, to);
            expect(out.a).toBe(0.5);
            for (const c of [out.r, out.g, out.b]) {
                expect(c).toBeGreaterThanOrEqual(0);
                expect(c).toBeLessThanOrEqual(255);
            }
            expect(chroma(out)).toBeGreaterThan(0);
        }
    });
});

describe('state colours: value space to hue space', () => {
    it('a grey sits at "from" when it is next to white and moves along to "to" as it gets darker', () => {
        expect(stateHue(UNREAD, 'background', -40, 70)).toBeCloseTo(NEUTRAL_HUE.background - 40, 5);
        const hues = ['#fafafa', '#f0f0f0', '#e6e6e6', '#dcdcdc', '#d2d2d2'].map((h) => stateHue(hex(h), 'background', 0, 90));
        for (let i = 1; i < hues.length; i++) {
            expect(hues[i]).toBeGreaterThan(hues[i - 1]);
        }
        // clamped at the far end: a much darker grey is no further along
        expect(stateHue(hex('#999999'), 'background', 0, 90)).toBeCloseTo(NEUTRAL_HUE.background + 90, 5);
        expect(stateHue(hex('#777777'), 'background', 0, 90)).toBeCloseTo(NEUTRAL_HUE.background + 90, 5);
    });

    it('both ends matter on ordinary pages: the greys real UIs use sit well inside the scale', () => {
        const turn = (state: string, from: number, to: number) =>
            hueApart(stateHue(hex(state), 'background', 0, 0), stateHue(hex(state), 'background', from, to));
        // Gmail's hover and read rows, Material's greys and the pastel selected row: every one of them follows "to"
        for (const state of ['#f5f5f5', '#f2f6fc', '#e8eaed', '#dadce0', '#c2dbff']) {
            expect(turn(state, 0, 90)).toBeGreaterThan(12); // dragging "to" 90° visibly turns the tint
        }
        // and the ones nearest white follow "from" just as much (the greyer, the more it is "to" alone)
        for (const state of ['#f5f5f5', '#f2f6fc', '#e8eaed']) {
            expect(turn(state, 90, 0)).toBeGreaterThan(12);
        }
        expect(turn('#f5f5f5', 90, 0)).toBeGreaterThan(turn('#dadce0', 90, 0));
    });

    it('the hue of the tinted colour follows the scale', () => {
        for (const light of ['#f5f5f5', '#e0e0e0', '#cccccc']) {
            const out = tint(hex(light), DR.grey, 100, 0, 90);
            expect(hueApart(hueDeg(out), stateHue(hex(light), 'background', 0, 90))).toBeLessThan(10);
        }
        // and different values come out as clearly different hues
        const near = hueDeg(tint(hex('#f5f5f5'), DR.grey, 100, 0, 90));
        const far = hueDeg(tint(hex('#cccccc'), DR.grey, 100, 0, 90));
        expect(hueApart(near, far)).toBeGreaterThan(30);
    });

    it('the ends can be in either order, and the scale runs the way they say', () => {
        const forwards = [stateHue(hex('#f5f5f5'), 'background', -60, 60), stateHue(hex('#cccccc'), 'background', -60, 60)];
        const backwards = [stateHue(hex('#f5f5f5'), 'background', 60, -60), stateHue(hex('#cccccc'), 'background', 60, -60)];
        expect(forwards[1]).toBeGreaterThan(forwards[0]);
        expect(backwards[1]).toBeLessThan(backwards[0]);
    });

    it('equal ends are one fixed hue: violet-blue for backgrounds, its opposite for text', () => {
        for (const light of ['#f5f5f5', '#cccccc']) {
            expect(stateHue(hex(light), 'background', 0, 0)).toBeCloseTo(265, 5);
            expect(stateHue(hex(light), 'background', 30, 30)).toBeCloseTo(295, 5);
        }
        expect(stateHue(hex('#3c3c3c'), 'text', 0, 0)).toBeCloseTo(85, 5);
        expect(stateHue(hex('#3c3c3c'), 'text', 30, 30)).toBeCloseTo(115, 5);
    });

    it('text uses the same range turned 180° and starts from black', () => {
        expect(stateHue(hex('#000000'), 'text', -40, 70)).toBeCloseTo(NEUTRAL_HUE.text - 40, 5);
        expect(stateHue(hex('#000000'), 'background', -40, 70)).not.toBeCloseTo(stateHue(hex('#000000'), 'text', -40, 70), 0);
        expect(hueApart(NEUTRAL_HUE.background, NEUTRAL_HUE.text)).toBe(180);
        // text further from black is further along the scale
        expect(stateHue(hex('#5f6368'), 'text', 0, 90)).toBeGreaterThan(stateHue(hex('#202124'), 'text', 0, 90));
    });

    it('the more saturated the original, the less it moves: a grey follows the scale, an intense colour keeps its hue', () => {
        const blue = hex('#1a73e8'); // intense
        const red = hex('#e53935');
        expect(hueApart(stateHue(blue, 'background', 100, 180), hueDeg(blue))).toBeLessThan(3);
        expect(hueApart(stateHue(red, 'background', 100, 180), hueDeg(red))).toBeLessThan(3);

        const grey = hex('#cccccc');
        expect(stateHue(grey, 'background', 0, 180)).toBeCloseTo((NEUTRAL_HUE.background + scalePoint(grey) * 180) % 360, 5);
    });

    it('a pastel blends: Gmail\'s selected row is between its own blue and the scale', () => {
        const own = hueDeg(SELECTED);
        const scale = (NEUTRAL_HUE.background + scalePoint(SELECTED) * 180) % 360;
        const got = stateHue(SELECTED, 'background', 0, 180);
        expect(hueApart(got, own)).toBeGreaterThan(5); // moved
        expect(hueApart(got, scale)).toBeGreaterThan(5); // but not all the way
        expect(hueApart(got, own) + hueApart(got, scale)).toBeCloseTo(hueApart(own, scale), 3); // on the way from one to the other
    });

    it('blends the short way round the wheel, and stays within 0..360', () => {
        const pink = hex('#fce8e6'); // own hue about 24°
        const got = stateHue(pink, 'background', 100, 100); // scale hue 5°, across the 0° seam from nothing: both near 0
        expect(hueApart(got, hueDeg(pink))).toBeLessThan(30);
        for (const [from, to] of [[-180, 180], [180, -180], [0, 0], [90, 90], [-90, -90]]) {
            for (const h of ['#ffffff', '#f5f5f5', '#cccccc', '#c2dbff', '#fce8e6', '#1a73e8']) {
                const v = stateHue(hex(h), 'background', from, to);
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThan(360);
            }
        }
    });
});
