import {m} from 'malevic';

import {DEFAULT_SETTINGS} from '../../../../defaults';
import type {ViewProps} from '../../../../definitions';
import {Glyph} from '../glyph';

export default function ResetButtonGroup(props: ViewProps) {
    function reset() {
        props.actions.setTheme(DEFAULT_SETTINGS.theme);
    }

    return (
        <div class="adv-reset">
            <button class="adv-reset__button" onclick={reset}>
                <Glyph name="reset" />
                <span>Reset to defaults</span>
            </button>
            <span class="adv-reset__hint">
                Restore current theme values to defaults
            </span>
        </div>
    );
}
