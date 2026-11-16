import type {RGBA} from '../../../src/utils/color';
import {DEFAULT_STATE_COLOURS, deltaE, rgbToOklab, stateTint, tintChroma} from '../../../src/utils/state-colours';

const hex = (h: string, a = 1): RGBA => ({r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16), a});
const hueDeg = (c: RGBA) => {
    const [, a, b] = rgbToOklab(c);
    return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
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
const DR = {unread: hex('#181a1b'), read: hex('#1d1f20'), hover: hex('#1e2021'), selected: hex('#292d2e')};
const tint = (original: RGBA, mapped: RGBA, strength = DEFAULT_STATE_COLOURS) => stateTint(original, mapped, 'background', strength);

describe('state colours: states stay distinguishable without adding light', () => {
    it('makes read vs unread (and hover) clearly different at the default strength', () => {
        expect(deltaE(DR.unread, DR.read)).toBeLessThan(2.5); // Dark Reader alone
        expect(deltaE(tint(UNREAD, DR.unread), tint(READ, DR.read))).toBeGreaterThan(3.5);
        expect(deltaE(tint(UNREAD, DR.unread), tint(HOVER, DR.hover))).toBeGreaterThan(3.5);
    });

    it('keeps Dark Reader\'s perceptual lightness exactly (nothing gets brighter)', () => {
        for (const [o, m] of [[READ, DR.read], [HOVER, DR.hover], [SELECTED, DR.selected]] as const) {
            expect(Math.abs(rgbToOklab(tint(o, m))[0] - rgbToOklab(m)[0])).toBeLessThan(0.004);
        }
    });

    it('reuses the original hue (Gmail\'s blue); pure greys get the neutral violet-blue', () => {
        expect(Math.abs(hueDeg(tint(READ, DR.read)) - hueDeg(READ))).toBeLessThan(15);
        expect(Math.abs(hueDeg(tint(SELECTED, DR.selected)) - hueDeg(SELECTED))).toBeLessThan(15);
        expect(Math.abs(hueDeg(tint(HOVER, DR.hover)) - 265)).toBeLessThan(10);
    });

    it('leaves plain white plain, and everything as is at strength 0', () => {
        expect(tint(UNREAD, DR.unread)).toBe(DR.unread);
        expect(tint(READ, DR.read, 0)).toBe(DR.read);
    });

    it('grows with distance from white as a square root, capped', () => {
        const near = tintChroma(READ, 'background', 50);
        const far = tintChroma(SELECTED, 'background', 50);
        expect(near).toBeGreaterThan(0.025); // a few percent already shows
        expect(far).toBeCloseTo(0.06, 5); // the cap at the default strength
        expect(tintChroma(hex('#333333'), 'background', 50)).toBeCloseTo(0.06, 5);
        expect(tintChroma(READ, 'background', 100)).toBeCloseTo(2 * near, 5);
    });

    it('tints text much less, from black, with the opposite neutral hue', () => {
        expect(tintChroma(hex('#5f6368'), 'text', 50)).toBeLessThan(0.02);
        const grey = stateTint(hex('#808080'), hex('#a0a0a0'), 'text', 100);
        expect(Math.abs(hueDeg(grey) - 85)).toBeLessThan(10);
    });

    it('leaves colours that keep their own colour after the mapping alone', () => {
        const red = hex('#b3261e');
        expect(stateTint(hex('#f9dedc'), red, 'background', 100)).toBe(red);
    });

    it('returns whole channel values (a fraction makes the engine write an invalid hex colour)', () => {
        for (const [o, m] of [[READ, DR.read], [HOVER, DR.hover], [SELECTED, DR.selected]] as const) {
            const out = tint(o, m, 100);
            expect(out).not.toBe(m);
            expect([out.r, out.g, out.b].every(Number.isInteger)).toBe(true);
        }
        expect([...Object.values(stateTint(hex('#808080'), hex('#a0a0a0'), 'text', 100))].slice(0, 3).every(Number.isInteger)).toBe(true);
    });

    it('stays in gamut and keeps alpha', () => {
        const out = stateTint(hex('#c2dbff', 0.5), hex('#050608', 0.5), 'background', 100);
        expect(out.a).toBe(0.5);
        for (const c of [out.r, out.g, out.b]) {
            expect(c).toBeGreaterThanOrEqual(0);
            expect(c).toBeLessThanOrEqual(255);
        }
        expect(chroma(out)).toBeGreaterThan(0);
    });
});
