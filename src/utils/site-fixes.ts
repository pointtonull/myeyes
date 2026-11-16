import type {SiteFix, UserSettings} from '../definitions';

import {isURLInList} from './url';

/**
 * MyEyes! per-site fixes found by AI Enhance (background/glare-fixer.ts) —
 * pure patch helpers (tests: tests/unit/utils/site-fixes.tests.ts). Each fix
 * is one CSS rule for one offender, appended to the dynamic theme's fixes for
 * the site's top frame. Reset (utils/named-themes resetSite) removes them.
 */

type FixSettings = Pick<UserSettings, 'siteFixes'>;

export function siteFixesFor(settings: Partial<FixSettings>, url: string): SiteFix[] {
    return (settings.siteFixes || []).filter((fix) => isURLInList(url, fix.url));
}

/** The CSS to append for a URL ('' when none). */
export function siteFixCSS(settings: Partial<FixSettings>, url: string): string {
    return siteFixesFor(settings, url)
        .map((fix) => `/* MyEyes! fix: ${fix.target.replace(/\*\//g, '* /')} (${fix.source.replace(/\*\//g, '* /')}) */\n${fix.css}`)
        .join('\n');
}

/** Add a fix for the host; one fix per target, so fixing the same element again replaces it. */
export function addSiteFix(settings: Partial<FixSettings>, host: string, fix: Omit<SiteFix, 'url'>): FixSettings {
    const others = (settings.siteFixes || []).filter((f) => !(f.url.includes(host) && f.target === fix.target));
    return {siteFixes: others.concat({url: [host], ...fix})};
}

/** Remove one fix (by target) for the host — used when verification shows no improvement. */
export function removeSiteFix(settings: Partial<FixSettings>, host: string, target: string): FixSettings {
    return {siteFixes: (settings.siteFixes || []).filter((f) => !(f.url.includes(host) && f.target === target))};
}

export function removeSiteFixes(settings: Partial<FixSettings>, url: string): FixSettings {
    return {siteFixes: (settings.siteFixes || []).filter((f) => !isURLInList(url, f.url))};
}
