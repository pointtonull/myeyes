import {m} from 'malevic';

import {Glyph} from '../glyph';
import type {GlyphName} from '../glyph';

export default function ThemeControl(props: {label: Malevic.Child; icon?: GlyphName; stacked?: boolean}, controls: Malevic.Child[]) {
    return (
        <span class={{'theme-control': true, 'theme-control--icon': Boolean(props.icon), 'theme-control--stacked': Boolean(props.stacked)}}>
            <label class="theme-control__label">
                {props.icon ? <Glyph name={props.icon} class={`theme-control__icon theme-control__icon--${props.icon}`} /> : null}
                {props.label}
            </label>
            {controls}
        </span>
    );
}
