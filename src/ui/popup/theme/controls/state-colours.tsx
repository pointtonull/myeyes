import {m} from 'malevic';

import {getLocalMessage} from '../../../../utils/locales';
import {DEFAULT_STATE_COLOURS} from '../../../../utils/state-colours';
import {Slider} from '../../../controls';

import {formatPercent} from './format';
import ThemeControl from './theme-control';

/**
 * MyEyes!: how strongly light-page states (read/unread, hover, selected) come
 * back as a tint in dark mode, at the same lightness (utils/state-colours).
 * 0 = Dark Reader's own mapping.
 */
export default function StateColours(props: {value: number | undefined; onChange: (v: number) => void}) {
    return (
        <ThemeControl label={getLocalMessage('state_colours')} icon="dropper">
            <Slider
                value={props.value ?? DEFAULT_STATE_COLOURS}
                min={0}
                max={100}
                step={1}
                formatValue={formatPercent}
                onChange={props.onChange}
            />
        </ThemeControl>
    );
}
