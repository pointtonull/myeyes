import {m} from 'malevic';

import type {ViewProps} from '../../../definitions';
import {Button} from '../../controls';
import ThemePresetPicker from '../theme/preset-picker';

// MyEyes!: the main popup only picks a theme and opens the editor.
// Brightness/contrast/mode live in the theme editor (theme/page), not here.
export default function ThemeGroup(props: ViewProps & {onThemeNavClick: () => void}) {
    return (
        <div class="theme-group">
            <div class="theme-group__presets-wrapper">
                <ThemePresetPicker {...props} />
            </div>
            <div class="theme-group__controls-wrapper">
                <Button class="theme-group__more-button" onclick={props.onThemeNavClick}>
                    Edit theme
                </Button>
            </div>
            <label class="theme-group__description">
                Theme
            </label>
        </div>
    );
}
