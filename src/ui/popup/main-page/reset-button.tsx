import {m} from 'malevic';
import {getContext} from 'malevic/dom';

import type {ViewProps} from '../../../definitions';
import {canResetSite, resetSite} from '../../../utils/named-themes';
import {getURLHostOrProtocol} from '../../../utils/url';

import {KitIcon} from './kit-icon';

// How long the first click keeps the button armed for the confirming second click.
const ARMED_MS = 3000;

interface ResetStore {
    armed?: boolean;
    timer?: ReturnType<typeof setTimeout>;
}

/**
 * Header button (mirrors the gear): a clean slate for the current site — its
 * tweaks (parked ones too), engine pick and saved theme go; it follows the
 * default again (utils/named-themes resetSite). The only way, besides the
 * Theme menu's Revert, to discard tweaks, so it takes two clicks: the first
 * arms it ("Reset?"), the second within 3 s resets.
 */
export function ResetButton(props: ViewProps) {
    const context = getContext();
    const store: ResetStore = context.store;
    const {settings, activeTab} = props.data;
    const url = activeTab.url;
    const host = url ? getURLHostOrProtocol(url) : '';
    const enabled = Boolean(url) && canResetSite(settings, url);
    const armed = enabled && Boolean(store.armed);

    function disarm() {
        store.timer && clearTimeout(store.timer);
        store.armed = false;
    }

    function onclick() {
        if (!enabled) {
            return;
        }
        if (!armed) {
            store.armed = true;
            store.timer = setTimeout(() => {
                store.armed = false;
                context.refresh();
            }, ARMED_MS);
            context.refresh();
            return;
        }
        disarm();
        props.actions.changeSettings(resetSite(settings, url));
    }

    const title = !enabled
        ? `${host || 'This page'} already follows the default`
        : armed
            ? `Click again to reset ${host}`
            : `Reset ${host}: drop its tweaks and follow the default`;

    return (
        <span class="m-header__side me-reset-wrap">
            <button
                class={{'me-reset': true, 'me-reset--armed': armed}}
                disabled={!enabled}
                title={title}
                aria-label={title}
                onclick={onclick}
            >
                <KitIcon name="reset" />
            </button>
            {armed ? <span class="me-reset__confirm">Reset?</span> : null}
        </span>
    );
}
