import {DEFAULT_THEME} from '../../../src/defaults';
import type {SiteFix} from '../../../src/definitions';
import {DEFAULT_THEME_ID, canResetSite, resetSite} from '../../../src/utils/named-themes';
import {addSiteFix, removeSiteFix, siteFixCSS, siteFixesFor} from '../../../src/utils/site-fixes';

const FIX = {css: '.a { background-color: #111 !important; }', target: 'div.a', source: 'generated', created: 1};

describe('site fixes', () => {
    it('adds one fix per target and host, replacing an earlier fix of the same element', () => {
        let settings: {siteFixes: SiteFix[]} = {siteFixes: []};
        settings = addSiteFix(settings, 'example.com', FIX);
        settings = addSiteFix(settings, 'example.com', {...FIX, css: '.a { background-color: #000 !important; }'});
        settings = addSiteFix(settings, 'example.com', {...FIX, target: 'img.b', css: 'img.b { filter: none; }'});
        settings = addSiteFix(settings, 'other.org', FIX);
        expect(siteFixesFor(settings, 'https://example.com/x').map((f) => f.css)).toEqual([
            '.a { background-color: #000 !important; }',
            'img.b { filter: none; }',
        ]);
    });

    it('produces the CSS for a URL, with a provenance comment', () => {
        const settings = addSiteFix({siteFixes: []}, 'example.com', {...FIX, source: 'community:usw-7 */ evil'});
        const css = siteFixCSS(settings, 'https://example.com/');
        expect(css).toContain('/* MyEyes! fix: div.a (community:usw-7 * / evil) */');
        expect(css).toContain(FIX.css);
        expect(siteFixCSS(settings, 'https://other.org/')).toBe('');
    });

    it('removes a fix that did not help', () => {
        const settings = addSiteFix({siteFixes: []}, 'example.com', FIX);
        expect(removeSiteFix(settings, 'example.com', 'div.a').siteFixes).toEqual([]);
    });

    it('Reset clears the site\'s fixes too', () => {
        const fixes = addSiteFix({siteFixes: []}, 'example.com', FIX).siteFixes;
        const settings = {theme: {...DEFAULT_THEME}, presets: [], customThemes: [], defaultThemeId: DEFAULT_THEME_ID, siteFixes: fixes};
        expect(canResetSite(settings, 'https://example.com/')).toBe(true);
        expect(resetSite(settings, 'https://example.com/').siteFixes).toEqual([]);
    });
});
