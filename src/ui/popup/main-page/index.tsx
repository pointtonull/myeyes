import {m} from 'malevic';

import type {ViewProps} from '../../../definitions';
import {ThemeEngine} from '../../../generators/theme-engines';
import {isURLEnabled} from '../../../utils/url';
import {Slider} from '../../controls';
import {Brightness, Contrast, Sepia} from '../theme/controls';
import {formatPercent} from '../theme/controls/format';
import ThemeControl from '../theme/controls/theme-control';
import {getCurrentThemePreset} from '../theme/utils';

// MyEyes! popup pane (see brand/reference/popup-mockup.png). The top area
// controls the CURRENT site; "Default for new sites" is the global fallback.

const MODES = [
    {engine: ThemeEngine.dynamicTheme, label: 'Dynamic'},
    {engine: ThemeEngine.cssFilter, label: 'Filter+'},
    {engine: ThemeEngine.staticTheme, label: 'Custom'},
];

function EnablePills(props: ViewProps) {
    const tab = props.data.activeTab;
    const isPageEnabled = isURLEnabled(
        tab.url, props.data.settings, tab, props.data.isAllowedFileSchemeAccess);

    function set(enabled: boolean) {
        if (enabled !== isPageEnabled) {
            props.actions.toggleActiveTab();
        }
    }

    return (
        <div class="me-pills">
            <button
                class={{'me-pill': true, 'me-pill--disabled-active': !isPageEnabled}}
                onclick={() => set(false)}
            >Disabled</button>
            <button
                class={{'me-pill': true, 'me-pill--enabled-active': isPageEnabled}}
                onclick={() => set(true)}
            >Enabled</button>
        </div>
    );
}

function ModeCards(props: {engine: string; onEngine: (e: ThemeEngine) => void; onThemeNav: () => void}) {
    return (
        <div class="me-modes">
            {MODES.map((mode) => (
                <button
                    class={{'me-mode': true, 'me-mode--active': props.engine === mode.engine}}
                    onclick={() => props.onEngine(mode.engine)}
                >{mode.label}</button>
            ))}
            <button class="me-mode me-mode--theme" onclick={props.onThemeNav}>
                Theme ▾
            </button>
        </div>
    );
}

function Saturation(props: {value: number; onChange: (v: number) => void}) {
    // Approximated via grayscale inverse until the engine gets real saturation.
    return (
        <ThemeControl label="Saturation">
            <Slider
                value={props.value} min={0} max={100} step={1}
                formatValue={formatPercent} onChange={props.onChange}
            />
        </ThemeControl>
    );
}

function Sliders(props: {theme: any; change: (t: any) => void}) {
    const {theme, change} = props;
    return (
        <div class="me-sliders">
            <Brightness value={theme.brightness} onChange={(v) => change({brightness: v})} />
            <Contrast value={theme.contrast} onChange={(v) => change({contrast: v})} />
            <Saturation value={100 - theme.grayscale} onChange={(v) => change({grayscale: 100 - v})} />
            <Sepia value={theme.sepia} onChange={(v) => change({sepia: v})} />
        </div>
    );
}

function AiActions() {
    // Net-new local-model features — stubs until built.
    return (
        <div class="me-ai">
            <button class="me-ai__btn me-ai__btn--enhance" disabled>AI Enhance</button>
            <button class="me-ai__btn me-ai__btn--clean" disabled>Clean Up</button>
        </div>
    );
}

function DefaultForNewSites(props: ViewProps) {
    const engine = props.data.settings.theme.engine;
    const label = (MODES.find((m) => m.engine === engine) || MODES[0]).label;
    return (
        <div class="me-default">
            <span class="me-default__label">Default for new sites</span>
            <button class="me-default__value" onclick={() => {
                const i = MODES.findIndex((m) => m.engine === engine);
                const next = MODES[(i + 1) % MODES.length].engine;
                props.actions.setTheme({engine: next});
            }}>{label} ▾</button>
        </div>
    );
}

type MainPageProps = ViewProps & {
    onThemeNavClick: () => void;
    onSettingsNavClick: () => void;
};

export default function MainPage(props: MainPageProps) {
    const preset = getCurrentThemePreset(props);
    return (
        <Array>
            <section class="m-section me-top">
                <EnablePills {...props} />
            </section>
            <section class="m-section">
                <ModeCards
                    engine={preset.theme.engine}
                    onEngine={(engine) => preset.change({engine})}
                    onThemeNav={props.onThemeNavClick}
                />
            </section>
            <section class="m-section">
                <Sliders theme={preset.theme} change={preset.change} />
            </section>
            <section class="m-section">
                <AiActions />
            </section>
            <section class="m-section me-footer">
                <DefaultForNewSites {...props} />
            </section>
        </Array>
    );
}
