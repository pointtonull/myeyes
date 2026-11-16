import {IMAGE_ATTR, imageStats, shouldDimWhilePending, triageCSS, triageImage} from '../../../src/utils/image-triage';

const N = 64;
type Px = [number, number, number, number];

/** A 64×64 RGBA sample from a per-pixel function. */
function sample(fn: (x: number, y: number) => Px): Uint8ClampedArray {
    const data = new Uint8ClampedArray(N * N * 4);
    for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
            data.set(fn(x, y), (y * N + x) * 4);
        }
    }
    return data;
}

// deterministic pseudo-random noise
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const BIG = {width: 300, height: 200};
const ICON = {width: 20, height: 20};

const diagram = sample((x, y) => (x % 16 === 0 || y === 40 ? [20, 20, 20, 255] : y > 50 && x < 30 ? [70, 130, 200, 255] : [255, 255, 255, 255]));
const photo = sample(() => [Math.floor(rand() * 255), Math.floor(rand() * 255), Math.floor(rand() * 255), 255]);
const brightPhoto = sample(() => [180 + Math.floor(rand() * 75), 170 + Math.floor(rand() * 85), 160 + Math.floor(rand() * 95), 255]);
const blackLogo = sample((x, y) => ((x - 32) ** 2 + (y - 32) ** 2 < 100 ? [10, 10, 10, 255] : [0, 0, 0, 0]));
const darkPhoto = sample(() => [Math.floor(rand() * 60), Math.floor(rand() * 60), Math.floor(rand() * 60), 255]);
const empty = sample(() => [0, 0, 0, 0]);

describe('image stats', () => {
    it('a diagram is mostly near-white with a flat palette', () => {
        const s = imageStats(diagram);
        expect(s.opaque).toBe(1);
        expect(s.nearWhite).toBeGreaterThan(0.6);
        expect(s.paletteTop8).toBe(1);
    });

    it('a photo spreads over many colours', () => {
        expect(imageStats(photo).paletteTop8).toBeLessThan(0.1);
    });

    it('transparency and dark strokes are measured on their own', () => {
        const s = imageStats(blackLogo);
        expect(s.transparent).toBeGreaterThan(0.9);
        expect(s.dark).toBe(1);
    });
});

describe('triage', () => {
    it('inverts diagrams', () => {
        expect(triageImage(imageStats(diagram), BIG)).toEqual({treatment: 'invert', reason: 'diagram'});
    });

    it('dims bright photos and never inverts them', () => {
        expect(triageImage(imageStats(brightPhoto), BIG)).toEqual({treatment: 'dim', reason: 'bright-photo'});
    });

    it('leaves ordinary and dark photos alone', () => {
        expect(triageImage(imageStats(photo), BIG).treatment).toBe('none');
        expect(triageImage(imageStats(darkPhoto), BIG).treatment).toBe('none');
    });

    it('inverts dark line art on transparency, even icon-sized, so it does not vanish', () => {
        expect(triageImage(imageStats(blackLogo), ICON)).toEqual({treatment: 'invert', reason: 'dark-on-transparent'});
        expect(triageImage(imageStats(blackLogo), {width: 8, height: 8}).treatment).toBe('none');
    });

    it('skips small images and empty ones', () => {
        expect(triageImage(imageStats(diagram), ICON)).toEqual({treatment: 'none', reason: 'too-small'});
        expect(triageImage(imageStats(empty), BIG)).toEqual({treatment: 'none', reason: 'empty'});
    });

    it('dims only large images while they are being analysed', () => {
        expect(shouldDimWhilePending(BIG)).toBe(true);
        expect(shouldDimWhilePending({width: 100, height: 100})).toBe(false);
    });
});

describe('stylesheets per engine', () => {
    it('dynamic: filters on the image itself, motion only when allowed', () => {
        const css = triageCSS('dynamic');
        expect(css).toContain(`img[${IMAGE_ATTR}="invert"] { filter: invert(90%) hue-rotate(180deg) !important; }`);
        expect(css).toContain(`img[${IMAGE_ATTR}="pending"]`);
        expect(css).toContain('prefers-reduced-motion: no-preference');
    });

    it('filter engines: inverting means skipping the engine\'s re-inversion', () => {
        expect(triageCSS('filter')).toBe(`img[${IMAGE_ATTR}="invert"] { filter: none !important; }\n`);
    });
});
