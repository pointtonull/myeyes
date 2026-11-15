/**
 * MyEyes!: what the keyboard-command OSD says (brand/reference/osd-mockup.png):
 * "[icon] Title · host" over a muted note line that says what just happened.
 * Pure, so the copy is unit-tested; the background picks one message per
 * command (background/extension.ts) and inject/osd.ts draws it.
 */
import {ThemeEngine} from '../generators/theme-engines';

import type {ThemeSettings} from './named-themes';
import {DEFAULT_THEME_ID, engineName, getDefaultTheme, resolveSiteTheme, siteMode} from './named-themes';
import type {SiteEnableMode} from './site-enable';
import {SITE_ENABLE_LABELS} from './site-enable';

/** The kit icon drawn before the title (inject/osd.ts ports these shapes). */
export type OSDIcon = 'dynamic' | 'filter' | 'custom' | 'theme' | 'enabled' | 'disabled' | 'auto';

export interface OSDMessage {
    title: string;
    /** After the title on line one ("Filter+ · example.com"). */
    host?: string;
    /** The muted second line. */
    note?: string;
    icon: OSDIcon;
}

const FOLLOWING_DEFAULT = 'Following the default for new sites';

function engineIcon(engine: ThemeEngine): OSDIcon {
    return engine === ThemeEngine.cssFilter || engine === ThemeEngine.svgFilter ? 'filter' : 'dynamic';
}

/** The extension on/off switch (all sites). */
export function extensionToggleOSD(enabled: boolean): OSDMessage {
    return enabled
        ? {title: 'MyEyes on', note: 'Darkening sites again', icon: 'enabled'}
        : {title: 'MyEyes off', note: 'Paused on every site', icon: 'disabled'};
}

/** The site toggle pressed on a PDF: it flips all PDFs. */
export function pdfToggleOSD(enabled: boolean): OSDMessage {
    return enabled
        ? {title: 'Enabled', host: 'PDFs', note: 'Darkening every PDF', icon: 'enabled'}
        : {title: 'Disabled', host: 'PDFs', note: 'PDFs are left as they are', icon: 'disabled'};
}

/** The site toggle: Disabled / Auto / Enabled for this site (utils/site-enable). */
export function siteEnableOSD(mode: SiteEnableMode, host: string, darkened: boolean): OSDMessage {
    let note: string;
    if (mode === 'enabled') {
        note = 'Always darkening this site';
    } else if (mode === 'disabled') {
        note = 'Never darkening this site';
    } else {
        note = darkened ? 'Darkening: this page is bright' : 'Left as is: this page is already dark';
    }
    return {title: SITE_ENABLE_LABELS[mode], host, note, icon: mode};
}

/** The site's look after cycling (same choices as the popup's cards). */
export function siteThemeOSD(settings: ThemeSettings, url: string, host: string): OSDMessage {
    const mode = siteMode(settings, url);
    const site = resolveSiteTheme(settings, url);
    if (mode.card === 'custom') {
        return {title: 'Custom', host, note: `This site's own settings, on ${engineName(mode.engine)}`, icon: 'custom'};
    }
    const following = site.source === 'default';
    if (mode.card === 'engine') {
        return {title: engineName(mode.engine), host, note: following ? FOLLOWING_DEFAULT : 'Engine for this site', icon: engineIcon(mode.engine)};
    }
    return {title: site.themeName, host, note: following ? FOLLOWING_DEFAULT : 'Theme for this site', icon: 'theme'};
}

/** The global fallback after cycling it. */
export function defaultThemeOSD(settings: ThemeSettings): OSDMessage {
    const fallback = getDefaultTheme(settings);
    const note = 'Default for new sites';
    if (fallback.id === DEFAULT_THEME_ID) {
        return {title: engineName(settings.theme.engine), note, icon: engineIcon(settings.theme.engine)};
    }
    return {title: fallback.name, note, icon: 'theme'};
}
