import {ThemeEngine} from '../../../generators/theme-engines';

import {CodeIcon, FilterIcon, SlidersIcon} from './icons';

// The rendering engines offered by the MyEyes! pane (mode cards + default menu).
export const MODES = [
    {engine: ThemeEngine.dynamicTheme, label: 'Dynamic', Icon: CodeIcon},
    {engine: ThemeEngine.cssFilter, label: 'Filter+', Icon: FilterIcon},
    {engine: ThemeEngine.staticTheme, label: 'Custom', Icon: SlidersIcon},
];

export type Mode = typeof MODES[number];

export function modeFor(engine: string): Mode {
    return MODES.find((mode) => mode.engine === engine) || MODES[0];
}
