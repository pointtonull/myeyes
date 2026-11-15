import type {TabInfo, UserSettings} from '../definitions';

import {isURLEnabled, isURLInList, isURLMatched} from './url';

/**
 * MyEyes! per-site Enabled / Auto / Disabled — pure logic, no browser APIs
 * (tests: tests/unit/utils/site-enable.tests.ts).
 *
 * Maps onto Dark Reader's own lists, so isURLEnabled stays the one judge:
 * - Enabled  = the site is in `enabledFor`: always darkened, even a page that
 *   is already dark.
 * - Disabled = the site is in `disabledFor`: never darkened.
 * - Auto     = in neither list (every site's default): darkened unless the
 *   page is already dark (Dark Reader's dark-sites list or dark-theme
 *   detection).
 *
 * Only exact entries for the site are added/removed; wildcard patterns a user
 * wrote in the options page are left alone (and still win where they match).
 * Every mutation returns a patch for `changeSettings`, never mutates input.
 */

export type SiteEnableMode = 'enabled' | 'auto' | 'disabled';

export type SiteEnableSettings = Pick<UserSettings, 'enabledFor' | 'disabledFor'>;
export type SiteEnablePatch = Partial<SiteEnableSettings>;

type PageInfo = Partial<Pick<TabInfo, 'isProtected' | 'isInDarkList' | 'isDarkThemeDetected'>>;

export const SITE_ENABLE_LABELS: Record<SiteEnableMode, string> = {
    enabled: 'Enabled',
    auto: 'Auto',
    disabled: 'Disabled',
};

export function getSiteEnableMode(settings: SiteEnableSettings, url: string): SiteEnableMode {
    // same precedence as isURLEnabled: the enabled list wins
    if (isURLInList(url, settings.enabledFor)) {
        return 'enabled';
    }
    if (isURLInList(url, settings.disabledFor)) {
        return 'disabled';
    }
    return 'auto';
}

/** An entry naming this site (incl. its www-less form) — not a wildcard or /regexp/ pattern. */
function isExactEntry(url: string, entry: string): boolean {
    const isPattern = entry.includes('*') || (entry.length > 1 && entry.startsWith('/') && entry.endsWith('/'));
    return !isPattern && isURLMatched(url, entry);
}

export function setSiteEnableMode(settings: SiteEnableSettings, url: string, host: string, mode: SiteEnableMode): SiteEnablePatch {
    const enabledFor = settings.enabledFor.filter((entry) => !isExactEntry(url, entry));
    const disabledFor = settings.disabledFor.filter((entry) => !isExactEntry(url, entry));
    if (mode === 'enabled') {
        enabledFor.push(host);
    } else if (mode === 'disabled') {
        disabledFor.push(host);
    }
    return {enabledFor, disabledFor};
}

/** Whether the page gets darkened under these settings. */
export function isSiteDarkened(settings: UserSettings, url: string, page: PageInfo): boolean {
    return isURLEnabled(url, settings, page);
}

/**
 * "Toggle current site" (keyboard): flip whether the page is darkened,
 * landing on Auto whenever Auto gives that result (so a second press usually
 * returns to Auto), else on the explicit Enabled / Disabled.
 */
export function toggleSiteEnable(settings: UserSettings, url: string, host: string, page: PageInfo): SiteEnablePatch {
    const wanted = !isSiteDarkened(settings, url, page);
    const auto = setSiteEnableMode(settings, url, host, 'auto');
    if (isSiteDarkened({...settings, ...auto}, url, page) === wanted) {
        return auto;
    }
    return setSiteEnableMode(settings, url, host, wanted ? 'enabled' : 'disabled');
}
