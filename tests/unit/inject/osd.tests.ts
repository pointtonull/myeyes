import {osdIconFor, splitOSDDetail} from '../../../src/inject/osd';

describe('OSD detail split (line one host, muted line two)', () => {
    test('a bare host stays on line one', () => {
        expect(splitOSDDetail('example.com')).toEqual({host: 'example.com', note: ''});
    });

    test('host · state: host on line one, state below', () => {
        expect(splitOSDDetail('news.ycombinator.com · darkening')).toEqual({host: 'news.ycombinator.com', note: 'darkening'});
        expect(splitOSDDetail('a.io · page is already dark')).toEqual({host: 'a.io', note: 'page is already dark'});
    });

    test('a phrase (not a host) goes to line two', () => {
        expect(splitOSDDetail('default for new sites')).toEqual({host: '', note: 'default for new sites'});
        expect(splitOSDDetail('all PDFs')).toEqual({host: '', note: 'all PDFs'});
    });

    test('no detail: one line, nothing below', () => {
        expect(splitOSDDetail()).toEqual({host: '', note: ''});
        expect(splitOSDDetail('')).toEqual({host: '', note: ''});
    });

    test('file: and other protocol "hosts" have no spaces, so they stay on line one', () => {
        expect(splitOSDDetail('file:')).toEqual({host: 'file:', note: ''});
    });
});

describe('OSD icon for a confirmation title', () => {
    test('engines and site states map to their kit icons', () => {
        expect(osdIconFor('Dynamic')).toBe('dynamic');
        expect(osdIconFor('Filter+')).toBe('filter');
        expect(osdIconFor('Custom')).toBe('custom');
        expect(osdIconFor('Enabled')).toBe('enabled');
        expect(osdIconFor('Disabled')).toBe('disabled');
        expect(osdIconFor('Auto')).toBe('auto');
    });

    test('anything else is a saved theme name', () => {
        expect(osdIconFor('Warm sepia')).toBe('theme');
        expect(osdIconFor('Night')).toBe('theme');
    });
});
