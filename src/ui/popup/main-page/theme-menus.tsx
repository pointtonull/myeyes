import {m} from 'malevic';
import {getContext} from 'malevic/dom';

import type {ViewProps} from '../../../definitions';
import {
    DEFAULT_THEME_ID,
    assignSiteTheme,
    getDefaultTheme,
    getNamedTheme,
    listNamedThemes,
    resolveSiteTheme,
    revertSiteTheme,
    saveSiteTheme,
    saveSiteThemeAs,
    setDefaultEngine,
    setDefaultTheme,
    siteMode,
    suggestThemeName,
} from '../../../utils/named-themes';
import type {ThemePatch} from '../../../utils/named-themes';
import {generateUID} from '../../../utils/uid';
import {getURLHostOrProtocol, isURLInList} from '../../../utils/url';

import {KitIcon} from './kit-icon';
import {MODES, modeFor} from './modes';

// MyEyes! theme menus (see utils/named-themes for the model):
// - ThemeMenu: the "Theme" card — which named theme this site uses, plus
//   Save / Save as… / Revert when the site has unsaved (forked) changes.
// - DefaultMenu: "Default for new sites" — an engine, or a named theme from
//   the Themes submenu.

function MenuItem(props: {checked?: boolean; icon?: Malevic.Child; label: string; muted?: boolean; onclick: () => void}) {
    return (
        <button
            class={{
                'me-menu__item': true,
                'me-menu__item--checked': Boolean(props.checked),
                'me-menu__item--muted': Boolean(props.muted),
            }}
            onclick={props.onclick}
        >
            <span class="me-menu__check">{props.checked ? <KitIcon name="check" /> : null}</span>
            {props.icon ? <span class="me-menu__icon">{props.icon}</span> : null}
            <span class="me-menu__label">{props.label}</span>
        </button>
    );
}

/** Label for whatever "Default for new sites" currently is: the engine, or the theme name. */
function defaultLabel(props: ViewProps): string {
    const {settings} = props.data;
    const named = getNamedTheme(settings, settings.defaultThemeId);
    if (!named || named.id === DEFAULT_THEME_ID) {
        return modeFor(settings.theme.engine).label;
    }
    return named.name;
}

interface ThemeMenuStore {
    open: boolean;
    naming: boolean;
    draftName: string;
}

export function ThemeMenu(props: ViewProps & {onAdvanced: () => void}) {
    const context = getContext();
    const store: ThemeMenuStore = context.store;
    const {settings, activeTab} = props.data;
    const url = activeTab.url;
    const host = getURLHostOrProtocol(url);
    const site = resolveSiteTheme(settings, url);
    const pinned = settings.presets.find(({urls}) => isURLInList(url, urls));
    // lit when the site's look comes from a saved theme; named whenever the
    // site is on (or customizing) a saved theme, else just "Theme"
    const onSavedTheme = siteMode(settings, url).card === 'theme';
    const cardName = site.themeId && site.themeId !== DEFAULT_THEME_ID ? site.themeName : 'Theme';
    const followsDefault = !pinned && (site.source === 'default' || site.source === 'fork');

    function close() {
        store.open = false;
        store.naming = false;
        context.refresh();
    }

    function commit(patch: ThemePatch) {
        store.open = false;
        store.naming = false;
        props.actions.changeSettings(patch);
        context.refresh();
    }

    function startSaveAs() {
        const base = site.source === 'preset' || site.source === 'fork' ? site.themeName : 'My theme';
        store.naming = true;
        store.draftName = suggestThemeName(settings, base === 'Default' ? 'My theme' : base);
        context.refresh();
    }

    function confirmSaveAs() {
        const name = (store.draftName || '').trim();
        if (name) {
            commit(saveSiteThemeAs(settings, url, host, name, `preset-${generateUID()}`));
        }
    }

    const changesTitle = site.modified ?
        `Unsaved changes · ${site.themeName}` :
        site.source === 'custom' ? 'Custom for this site' : 'New theme';

    const changes = (site.modified || site.source === 'custom' || store.naming) ? (
        <div class="me-menu__section">
            <div class="me-menu__title">{changesTitle}</div>
            {site.modified ? (
                <MenuItem label={`Save to “${site.themeName}”`} onclick={() => commit(saveSiteTheme(settings, url))} />
            ) : null}
            {store.naming ? (
                <div class="me-menu__naming">
                    <input
                        class="me-menu__input"
                        value={store.draftName}
                        placeholder="Theme name"
                        oncreate={(node: Element) => {
                            const input = node as HTMLInputElement;
                            input.focus();
                            input.select();
                        }}
                        oninput={(e: Event) => {
                            store.draftName = (e.target as HTMLInputElement).value;
                        }}
                        onkeydown={(e: KeyboardEvent) => {
                            if (e.key === 'Enter') {
                                confirmSaveAs();
                            } else if (e.key === 'Escape') {
                                store.naming = false;
                                context.refresh();
                            }
                        }}
                    />
                    <button class="me-menu__ok" onclick={confirmSaveAs}>Save</button>
                </div>
            ) : (
                <MenuItem label="Save as…" onclick={startSaveAs} />
            )}
            {site.modified ? (
                <MenuItem label="Revert" muted onclick={() => commit(revertSiteTheme(settings, url))} />
            ) : null}
        </div>
    ) : null;

    const menu = store.open ? (
        <Array>
            <div class="me-backdrop" onclick={close} />
            <div class="me-menu me-menu--down">
                {changes}
                <div class="me-menu__section">
                    <div class="me-menu__title">Theme for {host}</div>
                    <MenuItem
                        checked={followsDefault}
                        icon={<KitIcon name="home" />}
                        label={`Default for new sites · ${defaultLabel(props)}`}
                        onclick={() => commit(assignSiteTheme(settings, url, host, DEFAULT_THEME_ID))}
                    />
                    {listNamedThemes(settings).map((theme) => (
                        <MenuItem
                            checked={pinned?.id === theme.id}
                            label={theme.name}
                            onclick={() => commit(assignSiteTheme(settings, url, host, theme.id))}
                        />
                    ))}
                    {(site.modified || site.source === 'custom' || store.naming) ? null : (
                        <MenuItem label="＋ New theme from this site…" muted onclick={startSaveAs} />
                    )}
                </div>
                <div class="me-menu__section">
                    <MenuItem label="More theme options…" muted onclick={() => {
                        close();
                        props.onAdvanced();
                    }} />
                </div>
            </div>
        </Array>
    ) : null;

    return (
        <div class="me-theme">
            <button
                class={{'me-card': true, 'me-card--theme': true, 'me-card--active': onSavedTheme, 'me-card--open': store.open}}
                title={site.modified ? 'Unsaved changes — open to Save, Save as… or Revert' : `Theme: ${cardName}`}
                onclick={() => {
                    store.open = !store.open;
                    store.naming = false;
                    context.refresh();
                }}
            >
                <span class="me-card__icon">
                    <KitIcon name="theme" />
                    {site.modified ? <span class="me-dot" /> : null}
                </span>
                <span class="me-card__label">
                    <span class="me-card__name">{cardName}</span>
                    <span class="me-chevron"><KitIcon name="chevron-down" /></span>
                </span>
            </button>
            {menu}
        </div>
    );
}

interface DefaultMenuStore {
    open: boolean;
    themesOpen: boolean | null;
}

export function DefaultMenu(props: ViewProps) {
    const context = getContext();
    const store: DefaultMenuStore = context.store;
    const {settings} = props.data;
    const fallback = getDefaultTheme(settings);
    const onBuiltIn = fallback.id === DEFAULT_THEME_ID;
    const engine = modeFor(settings.theme.engine);
    const named = listNamedThemes(settings);
    if (store.themesOpen == null) {
        store.themesOpen = !onBuiltIn;
    }

    function commit(patch: ThemePatch) {
        store.open = false;
        props.actions.changeSettings(patch);
        context.refresh();
    }

    const menu = store.open ? (
        <Array>
            <div class="me-backdrop" onclick={() => {
                store.open = false;
                context.refresh();
            }} />
            <div class="me-menu me-menu--up">
                <div class="me-menu__section">
                    <div class="me-menu__title">Engine</div>
                    {MODES.map((mode) => (
                        <MenuItem
                            checked={onBuiltIn && engine.engine === mode.engine}
                            icon={<KitIcon name={mode.icon} />}
                            label={mode.label}
                            onclick={() => commit(setDefaultEngine(settings, mode.engine))}
                        />
                    ))}
                </div>
                <div class="me-menu__section">
                    <button class="me-menu__item" onclick={() => {
                        store.themesOpen = !store.themesOpen;
                        context.refresh();
                    }}>
                        <span class="me-menu__check">{onBuiltIn ? null : <KitIcon name="check" />}</span>
                        <span class="me-menu__icon"><KitIcon name="theme" /></span>
                        <span class="me-menu__label">Themes</span>
                        {/* Malevic children must be strings, not numbers */}
                        <span class="me-menu__count">{String(named.length)}</span>
                        <span class={{'me-menu__caret': true, 'me-menu__caret--open': Boolean(store.themesOpen)}}><KitIcon name="chevron-down" /></span>
                    </button>
                    {store.themesOpen ? (
                        <div class="me-menu__submenu">
                            {named.length ? named.map((theme) => (
                                <MenuItem
                                    checked={!onBuiltIn && fallback.id === theme.id}
                                    label={theme.name}
                                    onclick={() => commit(setDefaultTheme(settings, theme.id))}
                                />
                            )) : (
                                <div class="me-menu__empty">No saved themes yet — use “Save as…” in the Theme menu.</div>
                            )}
                        </div>
                    ) : null}
                </div>
            </div>
        </Array>
    ) : null;

    return (
        <div class="me-default">
            <span class="me-default__home"><KitIcon name="home" /></span>
            <span class="me-default__label">Default for new sites</span>
            <div class="me-default__anchor">
                <button class={{'me-default__value': true, 'me-default__value--open': store.open}} onclick={() => {
                    store.open = !store.open;
                    context.refresh();
                }}>
                    <span class="me-default__value-icon">{onBuiltIn ? <KitIcon name={engine.icon} /> : <KitIcon name="theme" />}</span>
                    <span class="me-default__value-name">{onBuiltIn ? engine.label : fallback.name}</span>
                    <span class="me-chevron"><KitIcon name="chevron-down" /></span>
                </button>
                {menu}
            </div>
        </div>
    );
}
