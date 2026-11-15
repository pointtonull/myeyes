import {DEFAULT_THEME} from '../../../src/defaults';
import type {ThemePreset} from '../../../src/definitions';
import {
    DEFAULT_THEME_ID,
    assignSiteTheme,
    canResetSite,
    customizeSite,
    defaultThemeLabel,
    deleteNamedTheme,
    editSiteTheme,
    hasSiteTweaks,
    nextDefaultTheme,
    nextSiteTheme,
    pickSiteEngine,
    resetSite,
    siteMode,
    siteThemeLabel,
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

describe('mode cards (siteMode): one card lit, showing where the look comes from', () => {
    it('a site following the built-in default lights its engine', () => {
        expect(siteMode(makeSettings(), OTHER_URL)).toEqual({card: 'engine', engine: ThemeEngine.dynamicTheme});
    });

    it('a site on a saved theme lights Theme (pinned, or through a named default)', () => {
        expect(siteMode(makeSettings({presets: [night()]}), NIGHT_URL).card).toBe('theme');
        expect(siteMode(makeSettings({presets: [night([])], defaultThemeId: 'night'}), OTHER_URL).card).toBe('theme');
    });

    it('tweaks light Custom, keeping the base engine', () => {
        let settings = makeSettings({presets: [night()]});
        settings = apply(settings, editSiteTheme(settings, NIGHT_URL, 'night.example', {contrast: 120}));
        expect(siteMode(settings, NIGHT_URL)).toEqual({card: 'custom', engine: ThemeEngine.dynamicTheme});
    });
});

describe('Dynamic / Filter+ cards: a plain engine for the site', () => {
    it('stores a plain-engine entry when it differs from the default', () => {
        const settings = makeSettings();
        const after = apply(settings, pickSiteEngine(settings, OTHER_URL, 'other.example', ThemeEngine.cssFilter));
        expect(after.customThemes).toEqual([
            {url: ['other.example'], theme: {...settings.theme, engine: ThemeEngine.cssFilter}, kind: 'engine'},
        ]);
        expect(siteMode(after, OTHER_URL)).toEqual({card: 'engine', engine: ThemeEngine.cssFilter});
        expect(resolveSiteTheme(after, OTHER_URL)).toMatchObject({source: 'engine', modified: false});
        expect(saveSiteTheme(after, OTHER_URL)).toEqual({});
    });

    it('just follows the default when that already is the same plain engine', () => {
        let settings = makeSettings();
        settings = apply(settings, pickSiteEngine(settings, OTHER_URL, 'other.example', ThemeEngine.cssFilter));
        const after = apply(settings, pickSiteEngine(settings, OTHER_URL, 'other.example', ThemeEngine.dynamicTheme));
        expect(after.customThemes).toEqual([]);
        expect(siteMode(after, OTHER_URL)).toEqual({card: 'engine', engine: ThemeEngine.dynamicTheme});
    });

    it('unpins a saved theme and parks the tweaks instead of dropping them', () => {
        let settings = makeSettings({presets: [night()]});
        settings = apply(settings, editSiteTheme(settings, NIGHT_URL, 'night.example', {contrast: 120}));
        const after = apply(settings, pickSiteEngine(settings, NIGHT_URL, 'night.example', ThemeEngine.dynamicTheme));
        expect(after.presets[0].urls).toEqual([]);
        expect(resolveSiteTheme(after, NIGHT_URL).source).toBe('default');
        expect(after.siteTweaks).toEqual([expect.objectContaining({baseId: 'night', theme: expect.objectContaining({contrast: 120})})]);
        expect(hasSiteTweaks(after, NIGHT_URL)).toBe(true);
    });

    it('stays explicit when the default is a named theme', () => {
        const settings = makeSettings({presets: [night([])], defaultThemeId: 'night'});
        const after = apply(settings, pickSiteEngine(settings, OTHER_URL, 'other.example', ThemeEngine.dynamicTheme));
        expect(after.customThemes[0].kind).toBe('engine');
        expect(siteMode(after, OTHER_URL).card).toBe('engine');
    });

    it('tweaking a plain-engine site turns it into a fork of the built-in theme', () => {
        let settings = makeSettings();
        settings = apply(settings, pickSiteEngine(settings, OTHER_URL, 'other.example', ThemeEngine.cssFilter));
        const after = apply(settings, editSiteTheme(settings, OTHER_URL, 'other.example', {brightness: 90}));
        expect(after.customThemes).toHaveLength(1);
        expect(after.customThemes[0]).toMatchObject({
            baseId: DEFAULT_THEME_ID,
            theme: {engine: ThemeEngine.cssFilter, brightness: 90},
        });
        expect(after.customThemes[0].kind).toBeUndefined();
        expect(siteMode(after, OTHER_URL)).toEqual({card: 'custom', engine: ThemeEngine.cssFilter});
    });
});

describe('Custom card: the site gets its own settings', () => {
    it('forks the current look', () => {
        const settings = makeSettings({presets: [night()]});
        const after = apply(settings, customizeSite(settings, NIGHT_URL, 'night.example'));
        expect(after.customThemes[0]).toMatchObject({baseId: 'night', theme: {brightness: 80}});
        expect(siteMode(after, NIGHT_URL).card).toBe('custom');
    });

    it('turns a plain-engine site into a fork of the built-in theme', () => {
        let settings = makeSettings();
        settings = apply(settings, pickSiteEngine(settings, OTHER_URL, 'other.example', ThemeEngine.cssFilter));
        const after = apply(settings, customizeSite(settings, OTHER_URL, 'other.example'));
        expect(after.customThemes[0]).toMatchObject({baseId: DEFAULT_THEME_ID});
        expect(siteMode(after, OTHER_URL)).toEqual({card: 'custom', engine: ThemeEngine.cssFilter});
    });

    it('is a no-op when the site already has its own tweaks', () => {
        let settings = makeSettings({presets: [night()]});
        settings = apply(settings, editSiteTheme(settings, NIGHT_URL, 'night.example', {contrast: 120}));
        expect(customizeSite(settings, NIGHT_URL, 'night.example')).toEqual({});
    });
});

describe('tweaks are never lost by navigating: parked, then restored', () => {
    function tweaked() {
        const settings = makeSettings({presets: [night([])]});
        return apply(settings, editSiteTheme(settings, OTHER_URL, 'other.example', {brightness: 70}));
    }

    for (const [how, leave] of [
        ['picking an engine card', (s: ThemeSettings) => pickSiteEngine(s, OTHER_URL, 'other.example', ThemeEngine.cssFilter)],
        ['picking a saved theme', (s: ThemeSettings) => assignSiteTheme(s, OTHER_URL, 'other.example', 'night')],
        ['following the default', (s: ThemeSettings) => assignSiteTheme(s, OTHER_URL, 'other.example', DEFAULT_THEME_ID)],
        ['the keyboard cycle', (s: ThemeSettings) => nextSiteTheme(s, OTHER_URL, 'other.example')],
    ] as const) {
        it(`${how} parks them; the Custom card brings them back`, () => {
            let settings = apply(tweaked(), leave(tweaked()));
            expect(siteMode(settings, OTHER_URL).card).not.toBe('custom');
            expect(settings.siteTweaks).toHaveLength(1);

            settings = apply(settings, customizeSite(settings, OTHER_URL, 'other.example'));
            expect(siteMode(settings, OTHER_URL).card).toBe('custom');
            expect(resolveSiteTheme(settings, OTHER_URL).theme.brightness).toBe(70);
            expect(settings.siteTweaks).toEqual([]);
        });
    }

    it('a fork of a saved theme comes back with its unsaved mark', () => {
        let settings = makeSettings({presets: [night()]});
        settings = apply(settings, editSiteTheme(settings, NIGHT_URL, 'night.example', {contrast: 120}));
        settings = apply(settings, pickSiteEngine(settings, NIGHT_URL, 'night.example', ThemeEngine.cssFilter));
        settings = apply(settings, customizeSite(settings, NIGHT_URL, 'night.example'));
        expect(resolveSiteTheme(settings, NIGHT_URL)).toMatchObject({source: 'fork', themeId: 'night', modified: true});
    });

    it('a site keeps one set: tweaking afresh from another card replaces the parked one', () => {
        let settings = tweaked();
        settings = apply(settings, pickSiteEngine(settings, OTHER_URL, 'other.example', ThemeEngine.cssFilter));
        settings = apply(settings, editSiteTheme(settings, OTHER_URL, 'other.example', {sepia: 30}));
        expect(settings.siteTweaks).toEqual([]);
        expect(resolveSiteTheme(settings, OTHER_URL).theme).toMatchObject({engine: ThemeEngine.cssFilter, sepia: 30});
    });

    it('parked tweaks of other sites are untouched', () => {
        let settings = tweaked();
        settings = apply(settings, editSiteTheme(settings, NIGHT_URL, 'night.example', {contrast: 130}));
        settings = apply(settings, pickSiteEngine(settings, OTHER_URL, 'other.example', ThemeEngine.cssFilter));
        settings = apply(settings, pickSiteEngine(settings, NIGHT_URL, 'night.example', ThemeEngine.cssFilter));
        expect(settings.siteTweaks).toHaveLength(2);
        settings = apply(settings, customizeSite(settings, NIGHT_URL, 'night.example'));
        expect(settings.siteTweaks!.map((t) => t.url)).toEqual([['other.example']]);
    });

    it('deleting a theme turns its parked forks into plain tweaks', () => {
        let settings = makeSettings({presets: [night()]});
        settings = apply(settings, editSiteTheme(settings, NIGHT_URL, 'night.example', {contrast: 120}));
        settings = apply(settings, pickSiteEngine(settings, NIGHT_URL, 'night.example', ThemeEngine.cssFilter));
        settings = apply(settings, deleteNamedTheme(settings, 'night'));
        expect(settings.siteTweaks![0].baseId).toBeUndefined();
    });
});

describe('Reset: a clean slate for the site', () => {
    it('drops tweaks (parked too), engine pick and saved theme; the site follows the default', () => {
        let settings = makeSettings({presets: [night()]});
        settings = apply(settings, editSiteTheme(settings, NIGHT_URL, 'night.example', {contrast: 120}));
        settings = apply(settings, pickSiteEngine(settings, NIGHT_URL, 'night.example', ThemeEngine.cssFilter));
        expect(canResetSite(settings, NIGHT_URL)).toBe(true);
        settings = apply(settings, resetSite(settings, NIGHT_URL));
        expect(settings).toMatchObject({customThemes: [], siteTweaks: []});
        expect(settings.presets[0].urls).toEqual([]);
        expect(resolveSiteTheme(settings, NIGHT_URL).source).toBe('default');
        expect(hasSiteTweaks(settings, NIGHT_URL)).toBe(false);
        expect(canResetSite(settings, NIGHT_URL)).toBe(false);
    });

    it('keeps built-in site fixes and other sites', () => {
        const builtIn = {url: ['docs.google.com'], theme: {...DEFAULT_THEME, engine: ThemeEngine.cssFilter}, builtIn: true};
        let settings = makeSettings({customThemes: [builtIn]});
        expect(canResetSite(settings, 'https://docs.google.com/')).toBe(false);
        settings = apply(settings, editSiteTheme(settings, OTHER_URL, 'other.example', {brightness: 70}));
        settings = apply(settings, resetSite(settings, 'https://docs.google.com/'));
        expect(settings.customThemes).toHaveLength(2);
    });
});

describe('labels (keyboard OSD)', () => {
    it('names what the site shows, in the pane\'s words', () => {
        let settings = makeSettings({presets: [night([]), {...night([]), id: 'sepia', name: 'Sepia'}]});
        expect(siteThemeLabel(settings, OTHER_URL)).toBe('Dynamic');
        settings = apply(settings, pickSiteEngine(settings, OTHER_URL, 'other.example', ThemeEngine.cssFilter));
        expect(siteThemeLabel(settings, OTHER_URL)).toBe('Filter+');
        settings = apply(settings, assignSiteTheme(settings, OTHER_URL, 'other.example', 'night'));
        expect(siteThemeLabel(settings, OTHER_URL)).toBe('Night');
        settings = apply(settings, editSiteTheme(settings, OTHER_URL, 'other.example', {sepia: 10}));
        expect(siteThemeLabel(settings, OTHER_URL)).toBe('Custom');
        settings = apply(settings, {defaultThemeId: 'sepia'});
        expect(siteThemeLabel(settings, 'https://new.example/')).toBe('Default · Sepia');
        expect(defaultThemeLabel(settings)).toBe('Sepia');
        expect(defaultThemeLabel(makeSettings())).toBe('Dynamic');
    });
});

describe('keyboard: next theme for this site', () => {
    const sepia = (): ThemePreset => ({...night([]), id: 'sepia', name: 'Sepia'});

    it('cycles Dynamic → Filter+ → saved themes → back, with the built-in default', () => {
        let settings = makeSettings({presets: [night([]), sepia()]});
        const seen: string[] = [];
        for (let i = 0; i < 5; i++) {
            settings = apply(settings, nextSiteTheme(settings, OTHER_URL, 'other.example'));
            const mode = siteMode(settings, OTHER_URL);
            seen.push(mode.card === 'theme' ? resolveSiteTheme(settings, OTHER_URL).themeName : mode.engine);
        }
        expect(seen).toEqual([ThemeEngine.cssFilter, 'Night', 'Sepia', ThemeEngine.dynamicTheme, ThemeEngine.cssFilter]);
    });

    it('with a saved default: follow it → Dynamic → Filter+ → the other themes → follow', () => {
        let settings = makeSettings({presets: [night([]), sepia()], defaultThemeId: 'sepia'});
        const seen: string[] = [];
        for (let i = 0; i < 5; i++) {
            settings = apply(settings, nextSiteTheme(settings, OTHER_URL, 'other.example'));
            const site = resolveSiteTheme(settings, OTHER_URL);
            seen.push(site.source === 'default' ? 'follow' : site.source === 'engine' ? site.theme.engine : site.themeName);
        }
        expect(seen).toEqual([ThemeEngine.dynamicTheme, ThemeEngine.cssFilter, 'Night', 'follow', ThemeEngine.dynamicTheme]);
    });

    it('a site with tweaks gets a Custom stop, in card order, that restores them', () => {
        let settings = makeSettings({presets: [night([])]});
        settings = apply(settings, editSiteTheme(settings, OTHER_URL, 'other.example', {brightness: 70}));
        const seen: string[] = [];
        for (let i = 0; i < 4; i++) {
            settings = apply(settings, nextSiteTheme(settings, OTHER_URL, 'other.example'));
            seen.push(siteThemeLabel(settings, OTHER_URL));
        }
        expect(seen).toEqual(['Night', 'Dynamic', 'Filter+', 'Custom']);
        expect(resolveSiteTheme(settings, OTHER_URL).theme.brightness).toBe(70);
    });
});

describe('keyboard: next default theme for new sites', () => {
    it('cycles Dynamic → Filter+ → each saved theme → Dynamic', () => {
        let settings = makeSettings({presets: [night([]), {...night([]), id: 'sepia', name: 'Sepia'}]});
        const seen: string[] = [];
        for (let i = 0; i < 5; i++) {
            settings = apply(settings, nextDefaultTheme(settings));
            const fallback = getDefaultTheme(settings);
            seen.push(fallback.id === DEFAULT_THEME_ID ? settings.theme.engine : fallback.name);
        }
        expect(seen).toEqual([ThemeEngine.cssFilter, 'Night', 'Sepia', ThemeEngine.dynamicTheme, ThemeEngine.cssFilter]);
    });

    it('just toggles the two engines when there are no saved themes', () => {
        let settings = makeSettings();
        settings = apply(settings, nextDefaultTheme(settings));
        expect(settings.theme.engine).toBe(ThemeEngine.cssFilter);
        settings = apply(settings, nextDefaultTheme(settings));
        expect(settings.theme.engine).toBe(ThemeEngine.dynamicTheme);
    });
});
