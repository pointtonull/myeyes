import type {CustomSiteConfig, Theme, UserSettings} from '../definitions';
import {ThemeEngine} from '../generators/theme-engines';

import {isURLInList, isURLMatched} from './url';

/**
 * MyEyes! named themes — pure logic, no browser APIs
 * (tests: tests/unit/utils/named-themes.tests.ts).
 *
 * Storage reuses Dark Reader's schema so the fork stays rebase-friendly:
 * - `presets` are the named themes ({id, name, urls, theme}); `urls` are the
 *   sites pinned to that theme and may be empty.
 * - `theme` is the built-in "engine default" theme (DEFAULT_THEME_ID).
 * - `defaultThemeId` picks what sites without a theme of their own use: the
 *   built-in (DEFAULT_THEME_ID) or a preset id.
 * - An unsaved per-site edit is a `customThemes` entry whose `baseId` is the
 *   theme it was forked from. Editing never touches a shared theme until the
 *   user picks Save (write back) or Save as (new named theme). Plain custom
 *   entries (no baseId, e.g. Dark Reader's built-in filter-mode sites) keep
 *   upstream's behaviour.
 * - A site that just uses a plain engine (picked on the Dynamic / Filter+
 *   card) is a `customThemes` entry with `kind: 'engine'`: the built-in theme
 *   with that engine. Tweaking it turns it into a fork of the built-in.
 *
 * The pane's cards show where a site's look comes from (siteMode): a plain
 * engine, Custom (its own tweaks), or a saved Theme.
 *
 * Every mutation returns a patch for `changeSettings`, never mutates input.
 */

export const DEFAULT_THEME_ID = 'default';
export const DEFAULT_THEME_NAME = 'Default';

export type ThemeSettings = Pick<UserSettings, 'theme' | 'presets' | 'customThemes' | 'defaultThemeId'>;
export type ThemePatch = Partial<ThemeSettings>;

export interface NamedTheme {
    id: string;
    name: string;
    theme: Theme;
}

export interface SiteTheme {
    /** What the site renders with right now. */
    theme: Theme;
    /** The named theme the site is on (preset id or DEFAULT_THEME_ID); '' for a plain custom site theme. */
    themeId: string;
    themeName: string;
    source: 'fork' | 'custom' | 'engine' | 'preset' | 'default';
    /** The site has unsaved changes forked from `themeId`. */
    modified: boolean;
}

/** Which mode card is lit for a site: a plain engine, Custom (own tweaks), or a saved Theme. */
export interface SiteMode {
    card: 'engine' | 'custom' | 'theme';
    /** The engine in use (for Custom: its base engine). */
    engine: Theme['engine'];
}

const PLAIN_ENGINES: Array<Theme['engine']> = [ThemeEngine.dynamicTheme, ThemeEngine.cssFilter, ThemeEngine.svgFilter];

function findSiteCustom(settings: ThemeSettings, url: string): CustomSiteConfig | undefined {
    return settings.customThemes.find(({url: list}) => isURLInList(url, list));
}

/** A plain-engine entry becomes a fork of the built-in theme once the user tweaks it. */
function asFork(custom: CustomSiteConfig): CustomSiteConfig {
    if (custom.kind !== 'engine') {
        return custom;
    }
    const fork: CustomSiteConfig = {...custom, baseId: DEFAULT_THEME_ID};
    delete fork.kind;
    return fork;
}

/** Drop the site's custom/forked theme and unpin it from every named theme. */
function withoutSite(settings: ThemeSettings, url: string): Required<Pick<ThemePatch, 'customThemes' | 'presets'>> {
    return {
        customThemes: settings.customThemes.filter(({url: list}) => !isURLInList(url, list)),
        presets: settings.presets.map((preset) => ({
            ...preset,
            urls: preset.urls.filter((template) => !isURLMatched(url, template)),
        })),
    };
}

/** The named themes a site can be pinned to (the built-in default is reached by following the default). */
export function listNamedThemes(settings: ThemeSettings): NamedTheme[] {
    return settings.presets.map(({id, name, theme}) => ({id, name, theme}));
}

export function getNamedTheme(settings: ThemeSettings, id: string): NamedTheme | null {
    if (id === DEFAULT_THEME_ID) {
        return {id, name: DEFAULT_THEME_NAME, theme: settings.theme};
    }
    const preset = settings.presets.find((p) => p.id === id);
    return preset ? {id: preset.id, name: preset.name, theme: preset.theme} : null;
}

/** The theme used by sites that have none of their own ("Default for new sites"). */
export function getDefaultTheme(settings: ThemeSettings): NamedTheme {
    return getNamedTheme(settings, settings.defaultThemeId) || getNamedTheme(settings, DEFAULT_THEME_ID)!;
}

export function resolveSiteTheme(settings: ThemeSettings, url: string): SiteTheme {
    const custom = findSiteCustom(settings, url);
    if (custom) {
        if (custom.kind === 'engine') {
            return {theme: custom.theme, themeId: DEFAULT_THEME_ID, themeName: DEFAULT_THEME_NAME, source: 'engine', modified: false};
        }
        const base = custom.baseId ? getNamedTheme(settings, custom.baseId) : null;
        if (base) {
            return {theme: custom.theme, themeId: base.id, themeName: base.name, source: 'fork', modified: true};
        }
        return {theme: custom.theme, themeId: '', themeName: 'Custom', source: 'custom', modified: false};
    }
    const preset = settings.presets.find(({urls}) => isURLInList(url, urls));
    if (preset) {
        return {theme: preset.theme, themeId: preset.id, themeName: preset.name, source: 'preset', modified: false};
    }
    const fallback = getDefaultTheme(settings);
    return {theme: fallback.theme, themeId: fallback.id, themeName: fallback.name, source: 'default', modified: false};
}

/** Where the site's look comes from, for the mode cards (one card lit at a time). */
export function siteMode(settings: ThemeSettings, url: string): SiteMode {
    const site = resolveSiteTheme(settings, url);
    const engine = site.theme.engine;
    const plain = PLAIN_ENGINES.includes(engine);
    switch (site.source) {
        case 'engine':
            return {card: plain ? 'engine' : 'custom', engine};
        case 'fork':
        case 'custom':
            return {card: 'custom', engine};
        case 'preset':
            return {card: 'theme', engine};
        default:
            if (site.themeId !== DEFAULT_THEME_ID) {
                return {card: 'theme', engine};
            }
            return {card: plain ? 'engine' : 'custom', engine};
    }
}

/**
 * Dynamic / Filter+ card: the site uses a plain engine — the built-in theme
 * with that engine. Replaces any tweaks, custom theme or pinned theme; when
 * that is exactly what the default already gives, the site just follows it.
 */
export function pickSiteEngine(settings: ThemeSettings, url: string, host: string, engine: Theme['engine']): ThemePatch {
    const cleared = withoutSite(settings, url);
    const defaultIsPlain = getDefaultTheme(settings).id === DEFAULT_THEME_ID && settings.theme.engine === engine;
    if (defaultIsPlain) {
        return cleared;
    }
    return {
        ...cleared,
        customThemes: cleared.customThemes.concat({url: [host], theme: {...settings.theme, engine}, kind: 'engine'}),
    };
}

/** Custom card: start customizing this site — fork its current look (no-op if it already has its own). */
export function customizeSite(settings: ThemeSettings, url: string, host: string): ThemePatch {
    const custom = findSiteCustom(settings, url);
    if (custom) {
        if (custom.kind !== 'engine') {
            return {};
        }
        return {customThemes: settings.customThemes.map((c) => (c === custom ? asFork(c) : c))};
    }
    const site = resolveSiteTheme(settings, url);
    return {customThemes: settings.customThemes.concat({url: [host], theme: {...site.theme}, baseId: site.themeId})};
}

/** Apply a theme change to the site only: edit its fork/custom theme, or fork its current theme. */
export function editSiteTheme(settings: ThemeSettings, url: string, host: string, change: Partial<Theme>): ThemePatch {
    const custom = findSiteCustom(settings, url);
    if (custom) {
        return {
            customThemes: settings.customThemes.map((c) => (c === custom ? {...asFork(c), theme: {...c.theme, ...change}} : c)),
        };
    }
    const site = resolveSiteTheme(settings, url);
    return {
        customThemes: settings.customThemes.concat({
            url: [host],
            theme: {...site.theme, ...change},
            baseId: site.themeId,
        }),
    };
}

/** "Save": write the site's unsaved changes back into the theme they were forked from. */
export function saveSiteTheme(settings: ThemeSettings, url: string): ThemePatch {
    const custom = findSiteCustom(settings, url);
    const base = custom?.baseId ? getNamedTheme(settings, custom.baseId) : null;
    if (!custom || !base) {
        return {};
    }
    const customThemes = settings.customThemes.filter((c) => c !== custom);
    if (base.id === DEFAULT_THEME_ID) {
        return {customThemes, theme: custom.theme};
    }
    return {
        customThemes,
        presets: settings.presets.map((p) => (p.id === base.id ? {...p, theme: custom.theme} : p)),
    };
}

/** "Save as…": turn what the site shows now into a new named theme and pin the site to it. */
export function saveSiteThemeAs(settings: ThemeSettings, url: string, host: string, name: string, id: string): ThemePatch {
    const {theme} = resolveSiteTheme(settings, url);
    const {customThemes, presets} = withoutSite(settings, url);
    return {customThemes, presets: presets.concat({id, name, urls: [host], theme})};
}

/** "Revert": discard the site's unsaved changes. */
export function revertSiteTheme(settings: ThemeSettings, url: string): ThemePatch {
    const custom = findSiteCustom(settings, url);
    if (!custom?.baseId) {
        return {};
    }
    return {customThemes: settings.customThemes.filter((c) => c !== custom)};
}

/** Pin the site to a named theme; DEFAULT_THEME_ID (or an unknown id) makes it follow the default. */
export function assignSiteTheme(settings: ThemeSettings, url: string, host: string, themeId: string): ThemePatch {
    const cleared = withoutSite(settings, url);
    if (!settings.presets.some((p) => p.id === themeId)) {
        return cleared;
    }
    return {
        ...cleared,
        presets: cleared.presets.map((p) => (p.id === themeId ? {...p, urls: p.urls.concat(host)} : p)),
    };
}

/** "Default for new sites" → an engine: the built-in default theme, using that engine. */
export function setDefaultEngine(settings: ThemeSettings, engine: Theme['engine']): ThemePatch {
    return {defaultThemeId: DEFAULT_THEME_ID, theme: {...settings.theme, engine}};
}

/** "Default for new sites" → a named theme. */
export function setDefaultTheme(settings: ThemeSettings, themeId: string): ThemePatch {
    return getNamedTheme(settings, themeId) ? {defaultThemeId: themeId} : {};
}

export function renameNamedTheme(settings: ThemeSettings, id: string, name: string): ThemePatch {
    return {presets: settings.presets.map((p) => (p.id === id ? {...p, name} : p))};
}

/** Delete a named theme; forks of it become plain custom site themes, and a default on it falls back. */
export function deleteNamedTheme(settings: ThemeSettings, id: string): ThemePatch {
    if (!settings.presets.some((p) => p.id === id)) {
        return {};
    }
    const patch: ThemePatch = {
        presets: settings.presets.filter((p) => p.id !== id),
        customThemes: settings.customThemes.map((c) => {
            if (c.baseId !== id) {
                return c;
            }
            const plain = {...c};
            delete plain.baseId;
            return plain;
        }),
    };
    if (settings.defaultThemeId === id) {
        patch.defaultThemeId = DEFAULT_THEME_ID;
    }
    return patch;
}

/** A name not used by any theme yet: `base`, else `base 2`, `base 3`… */
export function suggestThemeName(settings: ThemeSettings, base: string): string {
    const taken = new Set([DEFAULT_THEME_NAME, ...settings.presets.map((p) => p.name)]);
    if (!taken.has(base)) {
        return base;
    }
    for (let i = 2; ; i++) {
        if (!taken.has(`${base} ${i}`)) {
            return `${base} ${i}`;
        }
    }
}
