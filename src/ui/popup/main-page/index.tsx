import {m} from 'malevic';

import type {ViewProps} from '../../../definitions';
import type {ThemeEngine} from '../../../generators/theme-engines';
import {isURLEnabled} from '../../../utils/url';
import {Slider} from '../../controls';
import {formatPercent} from '../theme/controls/format';
import {getCurrentThemePreset} from '../theme/utils';

import {KitIcon} from './kit-icon';
import type {KitIconName} from './kit-icon';
import {MODES} from './modes';
import {DefaultMenu, ThemeMenu} from './theme-menus';

// MyEyes! popup pane (see brand/reference/popup-mockup.png). The top area
// controls the CURRENT site — edits fork its theme until saved (see
// utils/named-themes); "Default for new sites" is the global fallback.

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
                class={{'me-pill': true, 'me-pill--disabled': true, 'me-pill--active': !isPageEnabled}}
                onclick={() => set(false)}
            >
                <span class="me-pill__icon"><KitIcon name="mode-disabled" /></span>
                <span class="me-pill__label">Disabled</span>
            </button>
            <button
                class={{'me-pill': true, 'me-pill--enabled': true, 'me-pill--active': isPageEnabled}}
                onclick={() => set(true)}
            >
                <span class="me-pill__icon"><KitIcon name="mode-enabled" /></span>
                <span class="me-pill__label">Enabled</span>
            </button>
        </div>
    );
}

function EngineCards(props: {engine: string; onEngine: (e: ThemeEngine) => void}) {
    return (
        <Array>
            {MODES.map((mode) => (
                <button
                    class={{'me-card': true, 'me-card--active': props.engine === mode.engine}}
                    onclick={() => props.onEngine(mode.engine)}
                >
                    <span class="me-card__icon"><KitIcon name={mode.icon} /></span>
                    <span class="me-card__label">{mode.label}</span>
                </button>
            ))}
        </Array>
    );
}

function MeSlider(props: {trackKey: string; label: string; icon: KitIconName; value: number; min: number; max: number; onChange: (v: number) => void}) {
    return (
        <div class={`me-slider me-slider--${props.trackKey}`}>
            <span class="me-slider__icon"><KitIcon name={props.icon} /></span>
            <label class="me-slider__label">{props.label}</label>
            <Slider
                value={props.value} min={props.min} max={props.max} step={1}
                formatValue={formatPercent} onChange={props.onChange}
            />
        </div>
    );
}

function Sliders(props: {theme: any; change: (t: any) => void}) {
    const {theme, change} = props;
    return (
        <div class="me-sliders">
            <MeSlider trackKey="brightness" label="Brightness" icon="brightness"
                value={theme.brightness} min={50} max={150} onChange={(v) => change({brightness: v})} />
            <MeSlider trackKey="contrast" label="Contrast" icon="contrast"
                value={theme.contrast} min={50} max={150} onChange={(v) => change({contrast: v})} />
            <MeSlider trackKey="saturation" label="Saturation" icon="saturation"
                value={100 - theme.grayscale} min={0} max={100} onChange={(v) => change({grayscale: 100 - v})} />
            <MeSlider trackKey="sepia" label="Sepia" icon="sepia"
                value={theme.sepia} min={0} max={100} onChange={(v) => change({sepia: v})} />
        </div>
    );
}

function AiActions() {
    // Net-new local-model features — stubs until built.
    return (
        <div class="me-ai">
            <button class="me-ai__btn me-ai__btn--enhance" disabled>
                <span class="me-ai__icon"><KitIcon name="ai-enhance" /></span>AI Enhance
            </button>
            <button class="me-ai__btn me-ai__btn--clean" disabled>
                <span class="me-ai__icon"><KitIcon name="clean-up" /></span>Clean Up
            </button>
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
                <img class="me-mascot" src="../assets/images/myeyes-mascot.png" alt="" />
                <EnablePills {...props} />
            </section>
            <section class="m-section me-modes-section">
                <div class="me-modes">
                    <EngineCards
                        engine={preset.theme.engine}
                        onEngine={(engine) => preset.change({engine})}
                    />
                    <ThemeMenu {...props} onAdvanced={props.onThemeNavClick} />
                </div>
            </section>
            <section class="m-section">
                <Sliders theme={preset.theme} change={preset.change} />
            </section>
            <section class="m-section">
                <AiActions />
            </section>
            <section class="m-section me-footer">
                <DefaultMenu {...props} />
            </section>
        </Array>
    );
}
