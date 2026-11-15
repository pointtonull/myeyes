import {ThemeEngine} from '../../../generators/theme-engines';

import type {KitIconName} from './kit-icon';

// The rendering engines offered by the MyEyes! pane (mode cards + default menu).
export const MODES: Array<{engine: ThemeEngine; label: string; icon: KitIconName}> = [
    {engine: ThemeEngine.dynamicTheme, label: 'Dynamic', icon: 'dynamic'},
    {engine: ThemeEngine.cssFilter, label: 'Filter+', icon: 'filter-plus'},
    {engine: ThemeEngine.staticTheme, label: 'Custom', icon: 'custom'},
];

export type Mode = typeof MODES[number];

export function modeFor(engine: string): Mode {
    return MODES.find((mode) => mode.engine === engine) || MODES[0];
}
