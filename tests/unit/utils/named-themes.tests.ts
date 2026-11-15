import {DEFAULT_THEME} from '../../../src/defaults';
import type {ThemePreset} from '../../../src/definitions';
import {
    DEFAULT_THEME_ID,
    assignSiteTheme,
    deleteNamedTheme,
    editSiteTheme,
    getDefaultTheme,
    renameNamedTheme,
    resolveSiteTheme,
    revertSiteTheme,
    saveSiteTheme,
    saveSiteThemeAs,
    setDefaultEngine,
    setDefaultTheme,
    suggestThemeName,
} from '../../../src/utils/named-themes';
import type {ThemePatch, ThemeSettings} from '../../../src/utils/named-themes';
import {ThemeEngine} from '../../../src/generators/theme-engines';

const NIGHT_URL = 'https://night.example/page';
const OTHER_URL = 'https://other.example/';

function makeSettings(over: Partial<ThemeSettings> = {}): ThemeSettings {
    return {
        theme: {...DEFAULT_THEME},
        presets: [],
        customThemes: [],
        defaultThemeId: DEFAULT_THEME_ID,
        ...over,
    };
}

function night(urls: string[] = ['night.example']): ThemePreset {
    return {id: 'night', name: 'Night', urls, theme: {...DEFAULT_THEME, brightness: 80}};
}

function apply(settings: ThemeSettings, patch: ThemePatch): ThemeSettings {
    return {...settings, ...patch};
}

describe('resolveSiteTheme', () => {
    it('falls back to the built-in default theme', () => {
        const site = resolveSiteTheme(makeSettings(), OTHER_URL);
        expect(site).toMatchObject({themeId: DEFAULT_THEME_ID, themeName: 'Default', source: 'default', modified: false});
    });

    it('uses a named default theme for sites without one of their own', () => {
        const settings = makeSettings({presets: [night([])], defaultThemeId: 'night'});
        const site = resolveSiteTheme(settings, OTHER_URL);
        expect(site).toMatchObject({themeId: 'night', source: 'default'});
        expect(site.theme.brightness).toBe(80);
        expect(getDefaultTheme(settings).name).toBe('Night');
    });

    it('prefers a pinned theme over the default', () => {
        const site = resolveSiteTheme(makeSettings({presets: [night()]}), NIGHT_URL);
        expect(site).toMatchObject({themeId: 'night', themeName: 'Night', source: 'preset', modified: false});
    });

    it('falls back to the built-in when the default theme id is gone', () => {
        const site = resolveSiteTheme(makeSettings({defaultThemeId: 'deleted'}), OTHER_URL);
        expect(site.themeId).toBe(DEFAULT_THEME_ID);
    });
});

describe('editing forks the site transparently', () => {
    it('forks a pinned theme for that site only', () => {
        const settings = makeSettings({presets: [night()]});
        const after = apply(settings, editSiteTheme(settings, NIGHT_URL, 'night.example', {contrast: 120}));

        const site = resolveSiteTheme(after, NIGHT_URL);
        expect(site).toMatchObject({themeId: 'night', source: 'fork', modified: true});
        expect(site.theme).toMatchObject({brightness: 80, contrast: 120});
        // the shared theme is untouched until Save
        expect(after.presets[0].theme.contrast).toBe(100);
    });

    it('forks the default theme when the site follows it', () => {
        const settings = makeSettings();
        const after = apply(settings, editSiteTheme(settings, OTHER_URL, 'other.example', {sepia: 30}));
        expect(after.customThemes[0]).toMatchObject({url: ['other.example'], baseId: DEFAULT_THEME_ID});
        expect(after.theme.sepia).toBe(0);
        expect(resolveSiteTheme(after, 'https://unrelated.example/').modified).toBe(false);
    });

    it('keeps editing the same fork instead of stacking new ones', () => {
        let settings = makeSettings({presets: [night()]});
        settings = apply(settings, editSiteTheme(settings, NIGHT_URL, 'night.example', {contrast: 120}));
        settings = apply(settings, editSiteTheme(settings, NIGHT_URL, 'night.example', {sepia: 10}));
        expect(settings.customThemes).toHaveLength(1);
        expect(settings.customThemes[0].theme).toMatchObject({contrast: 120, sepia: 10});
    });

    it('edits a plain Dark Reader site theme in place (no fork, nothing to save)', () => {
        const custom = {url: ['docs.example'], theme: {...DEFAULT_THEME, engine: ThemeEngine.cssFilter}, builtIn: true};
        const settings = makeSettings({customThemes: [custom]});
        const after = apply(settings, editSiteTheme(settings, 'https://docs.example/', 'docs.example', {brightness: 90}));
        expect(after.customThemes).toHaveLength(1);
        expect(resolveSiteTheme(after, 'https://docs.example/')).toMatchObject({source: 'custom', modified: false});
        expect(revertSiteTheme(after, 'https://docs.example/')).toEqual({});
        expect(saveSiteTheme(after, 'https://docs.example/')).toEqual({});
    });
});

describe('Save / Save as / Revert', () => {
    function forked(): ThemeSettings {
        const settings = makeSettings({presets: [night(['night.example', 'also.example'])]});
        return apply(settings, editSiteTheme(settings, NIGHT_URL, 'night.example', {contrast: 130}));
    }

    it('Save writes the fork back into the shared theme for every site using it', () => {
        const settings = forked();
        const after = apply(settings, saveSiteTheme(settings, NIGHT_URL));
        expect(after.customThemes).toHaveLength(0);
        expect(resolveSiteTheme(after, NIGHT_URL)).toMatchObject({source: 'preset', modified: false});
        expect(resolveSiteTheme(after, 'https://also.example/').theme.contrast).toBe(130);
    });

    it('Save on a fork of the built-in default updates the built-in theme', () => {
        let settings = makeSettings();
        settings = apply(settings, editSiteTheme(settings, OTHER_URL, 'other.example', {brightness: 70}));
        const patch = saveSiteTheme(settings, OTHER_URL);
        expect(patch.theme?.brightness).toBe(70);
        expect(patch.customThemes).toEqual([]);
    });

    it('Save as creates a new named theme pinned to the site and leaves the old one alone', () => {
        const settings = forked();
        const after = apply(settings, saveSiteThemeAs(settings, NIGHT_URL, 'night.example', 'Night (high contrast)', 'nhc'));
        expect(after.customThemes).toHaveLength(0);
        expect(after.presets.find((p) => p.id === 'night')).toMatchObject({urls: ['also.example']});
        expect(after.presets.find((p) => p.id === 'night')!.theme.contrast).toBe(100);
        expect(resolveSiteTheme(after, NIGHT_URL)).toMatchObject({themeId: 'nhc', themeName: 'Night (high contrast)', source: 'preset'});
        expect(resolveSiteTheme(after, NIGHT_URL).theme.contrast).toBe(130);
    });

    it('Revert drops the fork and the site is back on its theme', () => {
        const settings = forked();
        const after = apply(settings, revertSiteTheme(settings, NIGHT_URL));
        expect(after.customThemes).toHaveLength(0);
        expect(resolveSiteTheme(after, NIGHT_URL)).toMatchObject({themeId: 'night', modified: false});
    });

    it('Save and Revert are no-ops without unsaved changes', () => {
        const settings = makeSettings({presets: [night()]});
        expect(saveSiteTheme(settings, NIGHT_URL)).toEqual({});
        expect(revertSiteTheme(settings, NIGHT_URL)).toEqual({});
    });
});

describe('pinning and the default', () => {
    it('pins a site to a named theme, dropping any fork and other pins', () => {
        let settings = makeSettings({presets: [night(), {...night([]), id: 'sepia', name: 'Sepia'}]});
        settings = apply(settings, editSiteTheme(settings, NIGHT_URL, 'night.example', {contrast: 120}));
        const after = apply(settings, assignSiteTheme(settings, NIGHT_URL, 'night.example', 'sepia'));
        expect(after.customThemes).toHaveLength(0);
        expect(after.presets.find((p) => p.id === 'night')!.urls).toEqual([]);
        expect(resolveSiteTheme(after, NIGHT_URL)).toMatchObject({themeId: 'sepia', source: 'preset'});
    });

    it('assigning the default unpins the site so it follows the default', () => {
        const settings = makeSettings({presets: [night()]});
        const after = apply(settings, assignSiteTheme(settings, NIGHT_URL, 'night.example', DEFAULT_THEME_ID));
        expect(resolveSiteTheme(after, NIGHT_URL).source).toBe('default');
    });

    it('picking an engine as default uses the built-in theme with that engine', () => {
        const settings = makeSettings({presets: [night()], defaultThemeId: 'night'});
        const patch = setDefaultEngine(settings, ThemeEngine.cssFilter);
        expect(patch).toMatchObject({defaultThemeId: DEFAULT_THEME_ID, theme: {engine: ThemeEngine.cssFilter}});
    });

    it('picking a named theme as default', () => {
        const settings = makeSettings({presets: [night()]});
        expect(setDefaultTheme(settings, 'night')).toEqual({defaultThemeId: 'night'});
        expect(setDefaultTheme(settings, 'nope')).toEqual({});
    });
});

describe('managing named themes', () => {
    it('renames', () => {
        const settings = makeSettings({presets: [night()]});
        expect(renameNamedTheme(settings, 'night', 'Midnight').presets![0].name).toBe('Midnight');
    });

    it('deleting a theme keeps its forks as plain site themes and resets the default', () => {
        let settings = makeSettings({presets: [night()], defaultThemeId: 'night'});
        settings = apply(settings, editSiteTheme(settings, NIGHT_URL, 'night.example', {contrast: 120}));
        const after = apply(settings, deleteNamedTheme(settings, 'night'));
        expect(after.presets).toHaveLength(0);
        expect(after.defaultThemeId).toBe(DEFAULT_THEME_ID);
        expect(after.customThemes[0].baseId).toBeUndefined();
        expect(resolveSiteTheme(after, NIGHT_URL)).toMatchObject({source: 'custom', modified: false});
        expect(resolveSiteTheme(after, NIGHT_URL).theme.contrast).toBe(120);
    });

    it('cannot delete the built-in theme', () => {
        expect(deleteNamedTheme(makeSettings(), DEFAULT_THEME_ID)).toEqual({});
    });

    it('suggests unused names', () => {
        const settings = makeSettings({presets: [night(), {...night([]), id: 'n2', name: 'Night 2'}]});
        expect(suggestThemeName(settings, 'Sepia')).toBe('Sepia');
        expect(suggestThemeName(settings, 'Night')).toBe('Night 3');
        expect(suggestThemeName(settings, 'Default')).toBe('Default 2');
    });
});
