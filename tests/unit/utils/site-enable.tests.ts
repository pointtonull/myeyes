import {DEFAULT_SETTINGS} from '../../../src/defaults';
import type {UserSettings} from '../../../src/definitions';
import {getSiteEnableMode, isSiteDarkened, setSiteEnableMode, toggleSiteEnable} from '../../../src/utils/site-enable';

const URL = 'https://www.example.com/page';
const HOST = 'www.example.com';
const LIGHT = {isProtected: false, isInDarkList: false, isDarkThemeDetected: false};
const DARK = {...LIGHT, isDarkThemeDetected: true};

function makeSettings(over: Partial<UserSettings> = {}): UserSettings {
    return {...DEFAULT_SETTINGS, enabledFor: [], disabledFor: [], ...over};
}

function apply(settings: UserSettings, patch: Partial<UserSettings>): UserSettings {
    return {...settings, ...patch};
}

describe('per-site Enabled / Auto / Disabled', () => {
    it('every site starts on Auto: darkened unless the page is already dark', () => {
        const settings = makeSettings();
        expect(getSiteEnableMode(settings, URL)).toBe('auto');
        expect(isSiteDarkened(settings, URL, LIGHT)).toBe(true);
        expect(isSiteDarkened(settings, URL, DARK)).toBe(false);
        expect(isSiteDarkened(settings, URL, {...LIGHT, isInDarkList: true})).toBe(false);
    });

    it('Enabled darkens even an already-dark page; Disabled never darkens', () => {
        let settings = makeSettings();
        settings = apply(settings, setSiteEnableMode(settings, URL, HOST, 'enabled'));
        expect(getSiteEnableMode(settings, URL)).toBe('enabled');
        expect(isSiteDarkened(settings, URL, DARK)).toBe(true);

        settings = apply(settings, setSiteEnableMode(settings, URL, HOST, 'disabled'));
        expect(getSiteEnableMode(settings, URL)).toBe('disabled');
        expect(settings.enabledFor).toEqual([]);
        expect(isSiteDarkened(settings, URL, LIGHT)).toBe(false);

        settings = apply(settings, setSiteEnableMode(settings, URL, HOST, 'auto'));
        expect(settings).toMatchObject({enabledFor: [], disabledFor: []});
    });

    it('clears the www-less entry too, but leaves wildcard patterns alone', () => {
        const settings = makeSettings({disabledFor: ['example.com', '*.example.com', 'other.org']});
        const patch = setSiteEnableMode(settings, URL, HOST, 'auto');
        expect(patch.disabledFor).toEqual(['*.example.com', 'other.org']);
    });
});

describe('keyboard: toggle current site', () => {
    it('flips what you see, and a second press returns to Auto', () => {
        let settings = makeSettings();
        settings = apply(settings, toggleSiteEnable(settings, URL, HOST, LIGHT));
        expect(getSiteEnableMode(settings, URL)).toBe('disabled');
        settings = apply(settings, toggleSiteEnable(settings, URL, HOST, LIGHT));
        expect(getSiteEnableMode(settings, URL)).toBe('auto');
        expect(isSiteDarkened(settings, URL, LIGHT)).toBe(true);
    });

    it('on an already-dark page in Auto, forces darkening on', () => {
        let settings = makeSettings();
        settings = apply(settings, toggleSiteEnable(settings, URL, HOST, DARK));
        expect(getSiteEnableMode(settings, URL)).toBe('enabled');
        settings = apply(settings, toggleSiteEnable(settings, URL, HOST, DARK));
        expect(getSiteEnableMode(settings, URL)).toBe('auto');
    });

    it('from Enabled on a light page goes straight to Disabled', () => {
        const settings = makeSettings({enabledFor: [HOST]});
        const after = apply(settings, toggleSiteEnable(settings, URL, HOST, LIGHT));
        expect(getSiteEnableMode(after, URL)).toBe('disabled');
    });
});
