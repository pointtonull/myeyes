import {m} from 'malevic';

import {getLocalMessage} from '../../../../utils/locales';
import {DEFAULT_STATE_HUE_FROM, DEFAULT_STATE_HUE_TO} from '../../../../utils/state-colours';

import HueRange from './hue-range';
import type {HueRangeValue} from './hue-range';
import ThemeControl from './theme-control';

/**
 * MyEyes!: how light-page states (read/unread, hover, selected) come back as a
 * tint in dark mode, at the same lightness (utils/state-colours): the value of
 * a state (how far from white it was) is turned into a hue, on a scale from
 * the first handle's hue to the second's. Greys follow the scale; the more
 * saturated a colour, the more it keeps its own hue.
 */
export default function StateColours(props: {
    from: number | undefined;
    to: number | undefined;
    onChange: (range: HueRangeValue) => void;
}) {
    return (
        <ThemeControl label={getLocalMessage('state_colours')} icon="dropper" stacked>
            <HueRange
                from={props.from ?? DEFAULT_STATE_HUE_FROM}
                to={props.to ?? DEFAULT_STATE_HUE_TO}
                onChange={props.onChange}
            />
        </ThemeControl>
    );
}
