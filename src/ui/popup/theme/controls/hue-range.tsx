import {m} from 'malevic';
import {getContext} from 'malevic/dom';

import {clamp, scale} from '../../../../utils/math';
import {MAX_STATE_HUE, NEUTRAL_HUE} from '../../../../utils/state-colours';

import {formatDegrees} from './format';

type End = 'from' | 'to';

export interface HueRangeValue {
    from: number;
    to: number;
}

interface HueRangeProps extends HueRangeValue {
    onChange: (range: HueRangeValue) => void;
}

interface HueRangeStore {
    props: HueRangeProps;
    rootNode: HTMLElement;
    trackNode: HTMLElement;
    /** The end being dragged, and where the pointer has it so far (committed on release). */
    active: End | null;
    activeValue: number | null;
}

// The hue wheel from -180° to 180° round violet-blue (the middle of the track
// is today's hue), in a calm OKLCH colour: the track shows what the tint will
// look like, not how bright it is.
const TRACK_STOPS = 13;
const HUE_TRACK = `linear-gradient(90deg, ${Array.from({length: TRACK_STOPS}, (_, i) => {
    const relative = -MAX_STATE_HUE + (i * 2 * MAX_STATE_HUE) / (TRACK_STOPS - 1);
    return `oklch(0.68 0.1 ${Math.round((NEUTRAL_HUE.background + relative + 360) % 360)})`;
}).join(', ')})`;

const LABELS: Record<End, string> = {
    from: 'Hue of the states closest to white',
    to: 'Hue of the states furthest from white',
};

function percent(value: number): string {
    return `${scale(value, -MAX_STATE_HUE, MAX_STATE_HUE, 0, 100)}%`;
}

/**
 * MyEyes!: a hue scale with two ends, "from" and "to" (State colors): the
 * range of hues that the value of a light-page state (how far from white it
 * was) is turned into (utils/state-colours). The span between the ends is lit,
 * the rest dimmed; the ends can be dragged, or moved with the arrow keys
 * (Page Up/Down by 10, Home/End to the limits) when focused, and may cross.
 */
export default function HueRange(props: HueRangeProps) {
    const context = getContext();
    const store: HueRangeStore = context.store;
    store.props = props;

    function saveRoot(node: Node) {
        store.rootNode = node as HTMLElement;
        node.addEventListener('pointerdown', onPointerDown as EventListener);
    }

    function saveTrack(node: Node) {
        store.trackNode = node as HTMLElement;
    }

    function current(): HueRangeValue {
        const {from, to} = store.props;
        if (store.active == null || store.activeValue == null) {
            return {from, to};
        }
        return store.active === 'from' ? {from: store.activeValue, to} : {from, to: store.activeValue};
    }

    function valueAt(clientX: number): number {
        const rect = store.trackNode.getBoundingClientRect();
        const value = scale(clientX, rect.left, rect.right, -MAX_STATE_HUE, MAX_STATE_HUE);
        return Math.round(clamp(value, -MAX_STATE_HUE, MAX_STATE_HUE));
    }

    function commit(end: End, value: number) {
        const {from, to, onChange} = store.props;
        onChange(end === 'from' ? {from: value, to} : {from, to: value});
    }

    function onPointerDown(e: PointerEvent) {
        if (store.active || (e.pointerType === 'mouse' && e.button !== 0)) {
            return;
        }
        const grabbed = (e.target as HTMLElement).closest?.('[data-end]') as HTMLElement | null;
        const {from, to} = store.props;
        const start = valueAt(e.clientX);
        // on a handle: that one (without it jumping to the pointer); on the track: the nearest one,
        // and when they are level (or the pointer is midway), the one on the pointer's side
        let end: End;
        let dx = 0;
        if (grabbed) {
            end = grabbed.dataset.end as End;
            const rect = grabbed.getBoundingClientRect();
            dx = rect.left + rect.width / 2 - e.clientX;
        } else if (Math.abs(start - from) === Math.abs(start - to)) {
            end = start < Math.min(from, to) ? (from <= to ? 'from' : 'to') : (from <= to ? 'to' : 'from');
        } else {
            end = Math.abs(start - from) < Math.abs(start - to) ? 'from' : 'to';
        }

        function onMove(ev: PointerEvent) {
            store.activeValue = valueAt(ev.clientX + dx);
            context.refresh();
        }

        function stop() {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onCancel);
            store.active = null;
            store.activeValue = null;
            context.refresh();
        }

        function onUp(ev: PointerEvent) {
            const value = valueAt(ev.clientX + dx);
            stop();
            commit(end, value);
        }

        // The browser took the gesture over (scrolling, a system dialog) and
        // its coordinates mean nothing: drop the drag, keep the old value.
        function onCancel() {
            stop();
        }

        e.preventDefault();
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
        store.active = end;
        // where the handle is (dx is in pixels, start in degrees: never add them)
        store.activeValue = valueAt(e.clientX + dx);
        (store.rootNode.querySelector(`[data-end="${end}"]`) as HTMLElement | null)?.focus();
        context.refresh();
    }

    function onKeyDown(end: End, e: KeyboardEvent) {
        const value = current()[end];
        let next: number | null = null;
        switch (e.key) {
            case 'ArrowLeft':
            case 'ArrowDown':
                next = value - 1;
                break;
            case 'ArrowRight':
            case 'ArrowUp':
                next = value + 1;
                break;
            case 'PageDown':
                next = value - 10;
                break;
            case 'PageUp':
                next = value + 10;
                break;
            case 'Home':
                next = -MAX_STATE_HUE;
                break;
            case 'End':
                next = MAX_STATE_HUE;
                break;
        }
        if (next == null) {
            return;
        }
        e.preventDefault();
        commit(end, Math.round(clamp(next, -MAX_STATE_HUE, MAX_STATE_HUE)));
    }

    const range = current();
    const lowest = Math.min(range.from, range.to);
    const highest = Math.max(range.from, range.to);

    function renderHandle(end: End) {
        const value = range[end];
        return (
            <span
                class={{
                    'hue-range__handle': true,
                    [`hue-range__handle--${end}`]: true,
                    'hue-range__handle--active': store.active === end,
                }}
                data-end={end}
                role="slider"
                tabindex="0"
                title={LABELS[end]}
                aria-label={LABELS[end]}
                aria-valuemin={String(-MAX_STATE_HUE)}
                aria-valuemax={String(MAX_STATE_HUE)}
                aria-valuenow={String(value)}
                aria-valuetext={formatDegrees(value)}
                onkeydown={(e: KeyboardEvent) => onKeyDown(end, e)}
                style={{left: percent(value)}}
            />
        );
    }

    // Two siblings for a stacked ThemeControl: the readout joins the label's
    // line, the rail takes the full width under it.
    return (
        <Array>
            <span class="hue-range__value">
                {`${formatDegrees(range.from)} → ${formatDegrees(range.to)}`}
            </span>
            <span class="hue-range__rail" oncreate={saveRoot}>
                <span class="hue-range__track" oncreate={saveTrack} style={{background: HUE_TRACK}} />
                <span class="hue-range__dim" style={{left: '0%', width: percent(lowest)}} />
                <span class="hue-range__dim" style={{left: percent(highest), right: '0%'}} />
                {renderHandle('from')}
                {renderHandle('to')}
            </span>
        </Array>
    );
}
