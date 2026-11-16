import {m} from 'malevic';

import type {ViewProps} from '../../../definitions';
import {customizeSite, hasSiteTweaks, pickSiteEngine, siteMode} from '../../../utils/named-themes';
import {SITE_ENABLE_LABELS, getSiteEnableMode, setSiteEnableMode} from '../../../utils/site-enable';
import type {SiteEnableMode} from '../../../utils/site-enable';
import {getURLHostOrProtocol, isURLEnabled} from '../../../utils/url';
import {Slider} from '../../controls';
import {formatPercent} from '../theme/controls/format';
import {getCurrentThemePreset} from '../theme/utils';

import {keyHint} from './key-hint';
import {KitIcon} from './kit-icon';
import type {KitIconName} from './kit-icon';
import {MODES, engineLabel, modeFor} from './modes';
import {ResetButton} from './reset-button';
import {DefaultMenu, ThemeMenu} from './theme-menus';

// MyEyes! popup pane (brand/reference/popup-mockup.png). The
// top area controls the CURRENT site — edits fork its theme until saved (see
// utils/named-themes); "Default for new sites" is the global fallback.
// NB: never name a variable `m` in here — it is Malevic's JSX factory.

const MASCOT = '../assets/images/myeyes-mascot.png';

// Per-site Disabled / Auto / Enabled (utils/site-enable); Auto is every
// site's default: darken unless the page is already dark.
const PILLS: Array<{mode: SiteEnableMode; icon: KitIconName; title: string}> = [
    {mode: 'disabled', icon: 'mode-disabled', title: 'Never darken this site'},
    {mode: 'auto', icon: 'mode-auto', title: 'Darken this site unless the page is already dark'},
    {mode: 'enabled', icon: 'mode-enabled', title: 'Always darken this site, even if it is already dark'},
];

function EnablePills(props: ViewProps & {isPageEnabled: boolean}) {
    const {settings, activeTab} = props.data;
    const url = activeTab.url;
    const host = getURLHostOrProtocol(url);
    const current = getSiteEnableMode(settings, url);
    const hint = keyHint(props, 'addSite');

    return (
        <div class="me-pills">
            {PILLS.map(({mode, icon, title}) => (
                <button
                    class={{'me-pill': true, [`me-pill--${mode}`]: true, 'me-pill--active': current === mode}}
                    title={`${title}${hint ? ` · toggle${hint}` : ''}`}
                    onclick={() => current !== mode && props.actions.changeSettings(setSiteEnableMode(settings, url, host, mode))}
                >
                    <span class="me-pill__icon"><KitIcon name={icon} /></span>
                    <span class="me-pill__label">{SITE_ENABLE_LABELS[mode]}</span>
                    {mode === 'auto' && current === 'auto' ? (
                        <span class="me-pill__sub">{props.isPageEnabled ? 'darkening' : 'already dark'}</span>
                    ) : null}
                </button>
            ))}
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
    // tweaks parked while another card/theme is active: the Custom card brings them back
    const parked = !isCustom && hasSiteTweaks(settings, url);
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
                sub={isCustom ? engineLabel(current.engine) : parked ? 'restore' : undefined}
                active={isCustom}
                title={isCustom ? `${host} has its own settings` : parked
                    ? `Bring back ${host}'s own settings (kept while you try others)`
                    : `Give ${host} its own settings (or just move a slider)`}
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

function AiActions(props: ViewProps) {
    // AI Enhance: find the brightest thing left on this page and fix it
    // (background/glare-fixer; progress and result show on the page's OSD).
    // Clean Up is still a stub: aria-disabled keeps the mockup's look yet does nothing.
    return (
        <div class="me-ai">
            <button
                class="me-ai__btn me-ai__btn--enhance"
                title="AI Enhance: find the brightest thing left on this page and fix it (community styles first, verified by a screenshot)"
                onclick={() => props.actions.enhanceSite()}
            >
                <span class="me-ai__icon"><KitIcon name="ai-enhance" /></span>AI Enhance
            </button>
            <button class="me-ai__btn me-ai__btn--clean" aria-disabled="true" title="Clean Up: coming soon (on-device)">
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
                <img class="me-mascot" src={MASCOT} alt="" />
                <EnablePills {...props} isPageEnabled={isPageEnabled} />
            </section>
            <section class="m-section me-modes-section">
                <div class="me-modes">
                    <ModeCards {...props} />
                    <ThemeMenu {...props} onAdvanced={props.onThemeNavClick} />
                </div>
            </section>
            <section class="m-section me-tune">
                <Sliders theme={preset.theme} change={preset.change} />
                <span class="me-tune__divider" />
                <ResetButton {...props} />
            </section>
            <section class="m-section me-ai-section">
                <AiActions {...props} />
            </section>
            <section class="m-section me-footer">
                <DefaultMenu {...props} />
            </section>
        </Array>
    );
}
