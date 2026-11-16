import {m} from 'malevic';
import {getContext} from 'malevic/dom';

import type {ViewProps} from '../../../definitions';
import {isMobile} from '../../../utils/platform';
import {Overlay} from '../../controls';
import {openExtensionPage} from '../../utils';
import {SettingsIcon} from '../../icons';
import MainPage from '../main-page';
import {Page, PageViewer} from '../page-viewer';
import {Glyph} from '../theme/glyph';
import ThemePage from '../theme/page';

type PageId = (
    'main'
    | 'theme'
    | 'settings'
    | 'site-list'
    | 'automation'
    | 'manage-settings'
);

interface IndexStore {
    activePage: PageId;
}

function Logo() {
    return (
        <span class="m-logo">
            <img class="m-logo__icon" src="../assets/images/myeyes/brand/logo-mark.svg" alt="" />
            <span class="m-logo__text">MyEyes!</span>
        </span>
    );
}

let popstate: (() => void) | null = null;
isMobile && window.addEventListener('popstate', () => popstate && popstate(), {passive: true});

function isTypingTarget(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable));
}

export default function Body(props: ViewProps) {
    const context = getContext();
    const store: IndexStore = context.store;
    if (store.activePage == null) {
        store.activePage = 'main';
    }

    function onThemeNavClick() {
        isMobile && history.pushState(undefined, '');
        store.activePage = 'theme';
        context.refresh();
    }

    function onSettingsNavClick() {
        openExtensionPage('options');
    }

    function goBack() {
        const activePage = store.activePage;
        const settingsPageSubpages: PageId[] = ['automation', 'manage-settings', 'site-list'];
        if (settingsPageSubpages.includes(activePage)) {
            store.activePage = 'settings';
        } else {
            store.activePage = 'main';
        }
        context.refresh();
    }

    popstate = goBack;

    function onBackClick() {
        if (isMobile) {
            history.back();
        } else {
            goBack();
        }
    }

    // Esc goes Back from Advanced Tweaks. Controls that use Esc themselves (an
    // open dropdown, a text box) consume it first.
    function onKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape' && store.activePage === 'theme' && !e.defaultPrevented && !isTypingTarget(e.target)) {
            e.preventDefault();
            onBackClick();
        }
    }

    context.onCreate(() => {
        if (isMobile) {
            window.addEventListener('contextmenu', ({preventDefault}) => preventDefault());
        }
        window.addEventListener('keydown', onKeyDown);
    });
    context.onRemove(() => {
        document.documentElement.classList.remove('preview');
        window.removeEventListener('keydown', onKeyDown);
    });

    const isAdvanced = store.activePage === 'theme';

    return (
        <body
            class={{
                'm-body-short': !isAdvanced && !props.data.uiHighlights.includes('anniversary'),
                // Advanced Tweaks is longer than the main pane (max popup height is 600px)
                'm-body-tall': isAdvanced,
            }}
        >
            {isAdvanced ? (
                <header class="m-section m-header m-header--sub">
                    <button class="m-header__back" onclick={onBackClick} title="Back (Esc)" aria-label="Back">
                        <Glyph name="back" />
                    </button>
                    <Logo />
                    <h1 class="m-header__title">Advanced Tweaks</h1>
                </header>
            ) : (
                <header class="m-section m-header">
                    <span class="m-header__side" />
                    <Logo />
                    <button class="m-header__side m-header__gear" onclick={() => openExtensionPage('options')} aria-label="Settings">
                        <SettingsIcon />
                    </button>
                </header>
            )}
            <section class="m-section pages-section">
                <PageViewer
                    activePage={store.activePage}
                    onBackButtonClick={onBackClick}
                >
                    <Page id="main">
                        <MainPage
                            {...props}
                            onThemeNavClick={onThemeNavClick}
                            onSettingsNavClick={onSettingsNavClick}
                        />
                    </Page>
                    <Page id="theme" fill noBack>
                        <ThemePage {...props} />
                    </Page>
                </PageViewer>
            </section>
            <Overlay />
        </body>
    );
}
