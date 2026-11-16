import {m} from 'malevic';

import {DEFAULT_SETTINGS} from '../../../../defaults';
import type {ViewProps} from '../../../../definitions';
import {Glyph} from '../glyph';
import {changeSiteTheme} from '../utils';

export default function ResetButtonGroup(props: ViewProps) {
    function reset() {
        // The page always edits the current website, so Reset does too (not the shared default theme).
        // It does not touch the scheme automation, as before: only the theme values go back.
        changeSiteTheme(props, DEFAULT_SETTINGS.theme);
    }

    return (
        <div class="adv-reset">
            <button class="adv-reset__button" onclick={reset}>
                <Glyph name="reset" />
                <span>Reset to defaults</span>
            </button>
            <span class="adv-reset__hint">
                Restore this website's values to defaults
            </span>
        </div>
    );
}
