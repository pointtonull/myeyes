import {m} from 'malevic';

import type {ViewProps} from '../../../definitions';
import {customizeSite, pickSiteEngine, siteMode} from '../../../utils/named-themes';
import {getURLHostOrProtocol, isURLEnabled} from '../../../utils/url';
import {Slider} from '../../controls';
import {formatPercent} from '../theme/controls/format';
import {getCurrentThemePreset} from '../theme/utils';

import {KitIcon} from './kit-icon';
import type {KitIconName} from './kit-icon';
import {MODES, engineLabel, modeFor} from './modes';
import {DefaultMenu, ThemeMenu} from './theme-menus';

// MyEyes! popup pane (brand/ui-kit/reference/approved-popup-mockup.png). The
// top area controls the CURRENT site — edits fork its theme until saved (see
// utils/named-themes); "Default for new sites" is the global fallback.
// NB: never name a variable `m` in here — it is Malevic's JSX factory.

const MASCOT_HAPPY = '../assets/images/myeyes-mascot.png';
const MASCOT_STRESSED = '../assets/images/myeyes/mascot/blob-stressed.svg';

function EnablePills(props: ViewProps & {isPageEnabled: boolean}) {
    function set(enabled: boolean) {
        if (enabled !== props.isPageEnabled) {
            props.actions.toggleActiveTab();
        }
    }

    return (
        <div class="me-pills">
            <button
                class={{'me-pill': true, 'me-pill--disabled': true, 'me-pill--active': !props.isPageEnabled}}
                onclick={() => set(false)}
            >
                <span class="me-pill__icon"><KitIcon name="mode-disabled" /></span>
                <span class="me-pill__label">Disabled</span>
            </button>
            <button
                class={{'me-pill': true, 'me-pill--enabled': true, 'me-pill--active': props.isPageEnabled}}
                onclick={() => set(true)}
            >
                <span class="me-pill__icon"><KitIcon name="mode-enabled" /></span>
                <span class="me-pill__label">Enabled</span>
            </button>
        </div>
    );
}

function ModeCard(props: {icon: KitIconName; label: string; sub?: string; active: boolean; title: string; onclick: () => void}) {
    return (
        <button class={{'me-card': true, 'me-card--active': props.active}} title={props.title} onclick={props.onclick}>
            <span class="me-card__icon"><KitIcon name={props.icon} /></span>
            <span class="me-card__label">{props.label}</span>
            {props.sub ? <span class="me-card__sub">{props.sub}</span> : null}
        </button>
    );
}

// One card lit at a time, showing where this site's look comes from
// (siteMode): a plain engine, Custom (its own tweaks), or a saved Theme (the
// ThemeMenu card).
function ModeCards(props: ViewProps) {
    const {settings, activeTab} = props.data;
    const url = activeTab.url;
    const host = getURLHostOrProtocol(url);
    const current = siteMode(settings, url);
    const isCustom = current.card === 'custom';
    return (
        <Array>
            {MODES.map((mode) => (
                <ModeCard
                    icon={mode.icon}
                    label={mode.label}
                    active={current.card === 'engine' && modeFor(current.engine).engine === mode.engine}
                    title={`Use plain ${mode.label} on ${host}`}
                    onclick={() => props.actions.changeSettings(pickSiteEngine(settings, url, host, mode.engine))}
                />
            ))}
            <ModeCard
                icon="custom"
                label="Custom"
                sub={isCustom ? engineLabel(current.engine) : undefined}
                active={isCustom}
                title={isCustom ? `${host} has its own settings` : `Give ${host} its own settings (or just move a slider)`}
                onclick={() => props.actions.changeSettings(customizeSite(settings, url, host))}
            />
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
    const tab = props.data.activeTab;
    const isPageEnabled = isURLEnabled(tab.url, props.data.settings, tab, props.data.isAllowedFileSchemeAccess);
    return (
        <Array>
            <section class="m-section me-top">
                {/* mascot mood follows the site: happy when darkened, stressed when not */}
                <img
                    class={{'me-mascot': true, 'me-mascot--stressed': !isPageEnabled}}
                    src={isPageEnabled ? MASCOT_HAPPY : MASCOT_STRESSED}
                    alt=""
                />
                <EnablePills {...props} isPageEnabled={isPageEnabled} />
            </section>
            <section class="m-section me-modes-section">
                <div class="me-modes">
                    <ModeCards {...props} />
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
