import type {Theme, ViewProps} from '../../../definitions';
import {editSiteTheme, resolveSiteTheme} from '../../../utils/named-themes';
import {getURLHostOrProtocol} from '../../../utils/url';

interface ThemePresets {
    theme: Theme;
    change: (config: Partial<Theme>) => void;
}

// MyEyes!: the current site's theme. Edits fork it per site (see
// utils/named-themes) instead of changing a shared theme in place; the user
// commits them with Save / Save as from the Theme menu.
export function getCurrentThemePreset(props: ViewProps): ThemePresets {
    const url = props.data.activeTab.url;
    let theme = resolveSiteTheme(props.data.settings, url).theme;
    if (props.data.forcedScheme) {
        const mode = props.data.forcedScheme === 'dark' ? 1 : 0;
        theme = {...theme, mode};
    }

    function setTheme(config: Partial<Theme>) {
        props.actions.changeSettings(
            editSiteTheme(props.data.settings, url, getURLHostOrProtocol(url), config),
        );
        if (
            config.mode != null &&
            props.data.settings.automation.behavior === 'Scheme'
        ) {
            props.actions.changeSettings({
                automation: {...props.data.settings.automation, ...{enabled: false}},
            });
        }
    }

    return {
        theme,
        change: setTheme,
    };
}
