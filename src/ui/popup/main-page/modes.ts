import {ThemeEngine} from '../../../generators/theme-engines';

import type {KitIconName} from './kit-icon';

// The plain engines offered on the mode cards and in "Default for new sites".
// "Custom" is not an engine: it is the state of a site with its own tweaks
// (brand/ui-kit README: "Custom = base engine + tweaks").
export const MODES: Array<{engine: ThemeEngine; label: string; icon: KitIconName}> = [
    {engine: ThemeEngine.dynamicTheme, label: 'Dynamic', icon: 'dynamic'},
    {engine: ThemeEngine.cssFilter, label: 'Filter+', icon: 'filter-plus'},
];

export type Mode = typeof MODES[number];

/** The card for an engine; the legacy SVG filter counts as Filter+. */
export function modeFor(engine: string): Mode {
    const normalized = engine === ThemeEngine.svgFilter ? ThemeEngine.cssFilter : engine;
    return MODES.find((mode) => mode.engine === normalized) || MODES[0];
}

export function engineLabel(engine: string): string {
    return engine === ThemeEngine.staticTheme ? 'Static' : modeFor(engine).label;
}
