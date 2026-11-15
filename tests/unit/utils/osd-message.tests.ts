import {DEFAULT_THEME} from '../../../src/defaults';
import type {ThemePreset} from '../../../src/definitions';
import {ThemeEngine} from '../../../src/generators/theme-engines';
import {DEFAULT_THEME_ID, customizeSite, pickSiteEngine} from '../../../src/utils/named-themes';
import type {ThemePatch, ThemeSettings} from '../../../src/utils/named-themes';
import {
    defaultThemeOSD,
    extensionToggleOSD,
    pdfToggleOSD,
    siteEnableOSD,
    siteThemeOSD,
} from '../../../src/utils/osd-message';

const URL = 'https://night.example/page';
const HOST = 'night.example';

function makeSettings(over: Partial<ThemeSettings> = {}): ThemeSettings {
    return {theme: {...DEFAULT_THEME}, presets: [], customThemes: [], defaultThemeId: DEFAULT_THEME_ID, ...over};
}

function night(urls: string[] = [HOST]): ThemePreset {
    return {id: 'night', name: 'Night', urls, theme: {...DEFAULT_THEME, brightness: 80}};
}

const apply = (settings: ThemeSettings, patch: ThemePatch): ThemeSettings => ({...settings, ...patch});

describe('OSD copy: every message has an icon and a second line', () => {
    test('extension switch', () => {
        expect(extensionToggleOSD(true)).toEqual({title: 'MyEyes on', note: 'Darkening sites again', icon: 'enabled'});
        expect(extensionToggleOSD(false)).toEqual({title: 'MyEyes off', note: 'Paused on every site', icon: 'disabled'});
    });

    test('PDF toggle', () => {
        expect(pdfToggleOSD(true)).toMatchObject({title: 'Enabled', host: 'PDFs', icon: 'enabled'});
        expect(pdfToggleOSD(false)).toMatchObject({title: 'Disabled', host: 'PDFs', icon: 'disabled'});
    });

    test('site toggle: Enabled / Disabled / Auto, Auto says why', () => {
        expect(siteEnableOSD('enabled', HOST, true)).toEqual({title: 'Enabled', host: HOST, note: 'Always darkening this site', icon: 'enabled'});
        expect(siteEnableOSD('disabled', HOST, false)).toEqual({title: 'Disabled', host: HOST, note: 'Never darkening this site', icon: 'disabled'});
        expect(siteEnableOSD('auto', HOST, true).note).toBe('Darkening: this page is bright');
        expect(siteEnableOSD('auto', HOST, false).note).toBe('Left as is: this page is already dark');
        expect(siteEnableOSD('auto', HOST, true).icon).toBe('auto');
    });
});

describe('siteThemeOSD (after cycling this site)', () => {
    test('following the built-in default: the engine, marked as the default', () => {
        expect(siteThemeOSD(makeSettings(), URL, HOST)).toEqual({
            title: 'Dynamic', host: HOST, note: 'Following the default for new sites', icon: 'dynamic',
        });
    });

    test('a plain engine picked for the site', () => {
        const settings = makeSettings();
        const next = apply(settings, pickSiteEngine(settings, URL, HOST, ThemeEngine.cssFilter));
        expect(siteThemeOSD(next, URL, HOST)).toMatchObject({title: 'Filter+', note: 'Engine for this site', icon: 'filter'});
    });

    test('a saved theme pinned to the site', () => {
        expect(siteThemeOSD(makeSettings({presets: [night()]}), URL, HOST)).toMatchObject({
            title: 'Night', note: 'Theme for this site', icon: 'theme',
        });
    });

    test('a saved theme reached by following the default names the theme, not "Default · …"', () => {
        const settings = makeSettings({presets: [night([])], defaultThemeId: 'night'});
        expect(siteThemeOSD(settings, URL, HOST)).toMatchObject({title: 'Night', note: 'Following the default for new sites'});
    });

    test("the site's own tweaks", () => {
        const settings = makeSettings();
        const next = apply(settings, customizeSite(settings, URL, HOST));
        expect(siteThemeOSD(next, URL, HOST)).toMatchObject({title: 'Custom', note: "This site's own settings, on Dynamic", icon: 'custom'});
    });
});

describe('defaultThemeOSD (after cycling the default)', () => {
    test('a built-in engine', () => {
        expect(defaultThemeOSD(makeSettings())).toEqual({title: 'Dynamic', note: 'Default for new sites', icon: 'dynamic'});
        const filter = makeSettings({theme: {...DEFAULT_THEME, engine: ThemeEngine.cssFilter}});
        expect(defaultThemeOSD(filter)).toMatchObject({title: 'Filter+', icon: 'filter'});
    });

    test('a saved theme', () => {
        const settings = makeSettings({presets: [night([])], defaultThemeId: 'night'});
        expect(defaultThemeOSD(settings)).toEqual({title: 'Night', note: 'Default for new sites', icon: 'theme'});
    });
});
