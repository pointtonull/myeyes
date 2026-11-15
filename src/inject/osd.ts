/**
 * MyEyes! on-screen confirmation for keyboard commands, after
 * brand/reference/osd-mockup.png: a neon-glass pill in the top-right corner
 * with the mascot, a divider, "[icon] Filter+ · example.com" over a muted
 * second line, and a ring that drains until the pill fades out by itself.
 *
 * Non-intrusive by construction: click-through (pointer-events: none), no
 * focus change, one pill reused for repeated presses, no motion when the user
 * prefers reduced motion. It lives in a closed shadow root so neither the
 * page nor the dynamic theme restyles it, and it is styled through the CSSOM
 * (not <style>/style attributes) so strict page CSPs can't block it; the
 * icons are built node by node (createElementNS), never parsed from markup.
 *
 * It must never turn bright: when a filter engine inverts the whole page
 * (filter on <html>), the pill gets the reverse filter, re-checked every
 * frame while visible because the engine may switch while it is on screen.
 */

const VISIBLE_MS = 1600;
const FADE_MS = 220;

const NS = 'http://www.w3.org/2000/svg';
const RING_R = 9;
const RING_C = 2 * Math.PI * RING_R;

let host: HTMLElement | null = null;
let pill: HTMLElement | null = null;
let iconSlot: HTMLElement | null = null;
let titleEl: HTMLElement | null = null;
let hostEl: HTMLElement | null = null;
let noteEl: HTMLElement | null = null;
let ringArc: SVGCircleElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let removeTimer: ReturnType<typeof setTimeout> | null = null;
let frameRequest: number | null = null;

function css(el: HTMLElement | SVGElement, styles: Record<string, string>) {
    for (const [prop, value] of Object.entries(styles)) {
        el.style.setProperty(prop, value, 'important');
    }
}

function prefersReducedMotion(): boolean {
    try {
        return matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (err) {
        return false;
    }
}

// --- SVG built node by node ------------------------------------------------

type Shape = [string, Record<string, string | number>];

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
    const el = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attrs)) {
        el.setAttribute(name, String(value));
    }
    return el;
}

function gradient(id: string, stops: string[], vertical = false): SVGLinearGradientElement {
    const g = svgEl('linearGradient', vertical ? {id, x2: 0, y2: 1} : {id});
    stops.forEach((color, i) => g.append(svgEl('stop', {'offset': i / (stops.length - 1), 'stop-color': color})));
    return g;
}

function svg(viewBox: string, size: number, shapes: Shape[], defs: SVGElement[] = []): SVGSVGElement {
    const root = svgEl('svg', {viewBox, width: size, height: size, 'aria-hidden': 'true'});
    if (defs.length) {
        const d = svgEl('defs', {});
        defs.forEach((def) => d.append(def));
        root.append(d);
    }
    for (const [tag, attrs] of shapes) {
        root.append(svgEl(tag as keyof SVGElementTagNameMap, attrs));
    }
    css(root, {'display': 'block', 'flex': 'none', 'overflow': 'visible'});
    return root;
}

// Gradient ids live in this closed shadow root only, so they can't clash with
// the page's; still prefixed, in case of a page-level <use> oddity.
const GLASSES = 'url(#me-osd-glasses)';
const STROKE = {'fill': 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round'};
const LINE = {...STROKE, 'stroke': '#d8c8ff', 'stroke-width': 4};
const FRAMES: Shape[] = [
    ['rect', {'x': 5, 'y': 18, 'width': 24, 'height': 22, 'rx': 9, 'fill': 'none', 'stroke-width': 5}],
    ['rect', {'x': 35, 'y': 18, 'width': 24, 'height': 22, 'rx': 9, 'fill': 'none', 'stroke-width': 5}],
    ['path', {'d': 'M29 24 Q32 20 35 24', 'fill': 'none', 'stroke-width': 5}],
];
const coloredFrames = (stroke: string, opacity = 1): Shape[] =>
    FRAMES.map(([tag, attrs]) => [tag, {...attrs, stroke, 'stroke-opacity': opacity}]);
const HAPPY_EYES: Shape = ['path', {...STROKE, 'd': 'M12 30q5 -8 10 0M42 30q5 -8 10 0', 'stroke': '#b5f8ff', 'stroke-width': 2.7}];

/** The kit's mode icons (brand/ui-kit/icons, 64x64), ported shape by shape. */
const ICONS: Record<string, Shape[]> = {
    'dynamic': [
        ['rect', {...LINE, x: 8, y: 12, width: 48, height: 39, rx: 6}],
        ['path', {...LINE, d: 'M8 23h48M25 31l-7 7 7 7m14-14 7 7-7 7m-10 1 5-17'}],
        ['circle', {cx: 49, cy: 10, r: 5, fill: '#ffe087'}],
    ],
    'filter': [
        ['circle', {cx: 25, cy: 26, r: 15, fill: '#a675f8', opacity: 0.8}],
        ['circle', {cx: 40, cy: 26, r: 15, fill: '#d6a7ff', opacity: 0.8}],
        ['circle', {cx: 32, cy: 39, r: 15, fill: '#6fdcf9', opacity: 0.75}],
    ],
    'custom': [
        ['path', {...LINE, d: 'M10 17h44M10 32h44M10 47h44'}],
        ['circle', {cx: 38, cy: 17, r: 6, fill: '#bd90ff'}],
        ['circle', {cx: 24, cy: 32, r: 6, fill: '#bd90ff'}],
        ['circle', {cx: 43, cy: 47, r: 6, fill: '#bd90ff'}],
    ],
    'theme': [
        ['path', {...LINE, d: 'm32 7 23 12-23 12L9 19zM9 31l23 12 23-12M9 43l23 12 23-12'}],
    ],
    'enabled': [...coloredFrames(GLASSES), HAPPY_EYES],
    'disabled': [
        ...coloredFrames('#a5a0bd', 0.65),
        ['path', {...STROKE, 'd': 'm12 28 10 5-10 5m40-10-10 5 10 5', 'stroke': '#d5cde2', 'stroke-width': 2.8}],
    ],
    'auto': [
        ...coloredFrames(GLASSES).slice(0, 1),
        coloredFrames(GLASSES)[2],
        ['path', {...STROKE, 'd': 'M12 30q5 -8 10 0', 'stroke': '#b5f8ff', 'stroke-width': 2.7}],
        coloredFrames('#a5a0bd', 0.65)[1],
        ['path', {...STROKE, 'd': 'm52 28-10 5 10 5', 'stroke': '#d5cde2', 'stroke-width': 2.8}],
    ],
};

/** Which kit icon goes with a confirmation title (the command's new state). */
export function osdIconFor(title: string): string {
    const key = title.trim().toLowerCase();
    if (key === 'dynamic') {
        return 'dynamic';
    }
    if (key.startsWith('filter')) {
        return 'filter';
    }
    if (key === 'custom' || key === 'enabled' || key === 'disabled' || key === 'auto') {
        return key;
    }
    return 'theme'; // a saved theme's name
}

/**
 * Split the detail into what follows the title on line one (a host, like
 * "example.com") and the muted second line ("darkening", "all PDFs",
 * "default for new sites"): "example.com · darkening" gives both.
 */
export function splitOSDDetail(detail?: string): {host: string; note: string} {
    const parts = (detail || '').split(' · ').map((s) => s.trim()).filter(Boolean);
    const looksLikeHost = parts.length > 0 && !/\s/.test(parts[0]);
    return looksLikeHost
        ? {host: parts[0], note: parts.slice(1).join(' · ')}
        : {host: '', note: parts.join(' · ')};
}

function modeIcon(name: string): SVGSVGElement {
    const icon = svg('0 0 64 64', 20, ICONS[name] || ICONS.theme, [gradient('me-osd-glasses', ['#46e0f5', '#ef55ed'])]);
    css(icon, {'filter': 'drop-shadow(0 0 4px rgba(152, 96, 245, 0.45))'});
    return icon;
}

/** The kit's happy blob (brand/ui-kit/mascot), smiling, with the gold rays. */
function mascot(): SVGSVGElement {
    const m = svg('-8 -8 76 74', 58, [
        ['path', {...STROKE, 'd': 'M7 13 1 8M14 7 11 -1M23 4V-5', 'stroke': '#ffc94d', 'stroke-width': 3.5}],
        ['ellipse', {cx: 32, cy: 39, rx: 25, ry: 23, fill: 'url(#me-osd-blob)'}],
        ['ellipse', {cx: 17, cy: 53, rx: 10, ry: 7, fill: '#8052dc'}],
        ['ellipse', {cx: 49, cy: 53, rx: 10, ry: 7, fill: '#8052dc'}],
        ...FRAMES.map(([tag, attrs]): Shape => [tag, {...attrs, stroke: 'url(#me-osd-frames)'}]),
        ['path', {...STROKE, 'd': 'M12 30q5 -8 10 0M42 30q5 -8 10 0', 'stroke': '#b5f8ff', 'stroke-width': 2.7}],
        ['path', {...STROKE, 'd': 'M27 45q5 7 10 0', 'stroke': '#2a174c', 'stroke-width': 2.5}],
    ], [
        gradient('me-osd-frames', ['#46e0f5', '#ef55ed']),
        gradient('me-osd-blob', ['#a979ff', '#6541cf'], true),
    ]);
    // taller than the pill's content: the rays poke above the rim, as in the mockup
    css(m, {
        'filter': 'drop-shadow(0 0 8px rgba(152, 96, 245, 0.6))',
        'margin': '-16px 0 -8px -4px',
    });
    return m;
}

/** The ring on the right: drains while the pill is up (stays full if reduced motion). */
function countdownRing(): SVGSVGElement {
    ringArc = svgEl('circle', {
        'cx': 12, 'cy': 12, 'r': RING_R, 'fill': 'none',
        'stroke': 'url(#me-osd-ring)', 'stroke-width': 2.6, 'stroke-linecap': 'round',
        'stroke-dasharray': RING_C.toFixed(2), 'transform': 'rotate(-90 12 12)',
    });
    const ring = svg('0 0 24 24', 26, [
        ['circle', {'cx': 12, 'cy': 12, 'r': RING_R, 'fill': 'none', 'stroke': 'rgba(150, 130, 240, 0.28)', 'stroke-width': 2.6}],
    ], [gradient('me-osd-ring', ['#e4d8ff', '#9b6cff'])]);
    ring.append(ringArc);
    css(ring, {'margin-left': '4px', 'filter': 'drop-shadow(0 0 4px rgba(155, 108, 255, 0.5))'});
    return ring;
}

function create() {
    host = document.createElement('div');
    css(host, {
        'all': 'initial',
        'position': 'fixed',
        'top': '18px',
        'right': '18px',
        'z-index': '2147483647',
        'pointer-events': 'none',
        'display': 'block',
    });
    const root = host.attachShadow({mode: 'closed'});

    pill = document.createElement('div');
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    css(pill, {
        'display': 'flex',
        'align-items': 'center',
        'gap': '11px',
        'box-sizing': 'border-box',
        'min-width': '260px',
        'max-width': '420px',
        'min-height': '62px',
        'padding': '7px 14px 7px 14px',
        'border-radius': '999px',
        // glass surface inside a gradient rim: lavender-white along the
        // top-left, violet below (two background layers, no pseudo-elements)
        'border': '2px solid transparent',
        'background':
            'radial-gradient(120% 140% at 12% 0%, rgba(150, 120, 255, 0.16), transparent 55%) padding-box,' +
            'linear-gradient(180deg, rgba(40, 36, 92, 0.97), rgba(27, 24, 64, 0.97)) padding-box,' +
            'linear-gradient(160deg, #d9ccff, #9b6cff 40%, #7c4dff 70%, #b69cff) border-box',
        // the glow is separate from the rim: a tight violet halo, a wide soft
        // one, a drop shadow for depth, and a lit inner edge
        'box-shadow':
            '0 0 12px rgba(139, 92, 246, 0.6), 0 0 32px rgba(124, 58, 237, 0.32), ' +
            '0 8px 24px rgba(5, 3, 20, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.14), ' +
            'inset 0 0 16px rgba(139, 92, 246, 0.25)',
        'color': '#f6f2ff',
        'font': '600 13px/1.25 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        'letter-spacing': 'normal',
        'text-align': 'left',
        'white-space': 'nowrap',
        'opacity': '0',
        'transform': 'translateY(-4px)',
        'transition': prefersReducedMotion() ? 'none' : `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
    });

    const divider = document.createElement('span');
    css(divider, {
        'display': 'block',
        'flex': 'none',
        'width': '1px',
        'height': '34px',
        'background': 'linear-gradient(180deg, transparent, rgba(150, 130, 240, 0.7) 20%, rgba(150, 130, 240, 0.7) 80%, transparent)',
    });

    const text = document.createElement('div');
    css(text, {
        'display': 'flex',
        'flex': 'auto',
        'flex-direction': 'column',
        'gap': '3px',
        'min-width': '0',
    });
    const line = document.createElement('div');
    css(line, {'display': 'flex', 'align-items': 'center', 'gap': '7px', 'min-width': '0'});
    iconSlot = document.createElement('span');
    css(iconSlot, {'display': 'flex', 'flex': 'none'});
    titleEl = document.createElement('span');
    css(titleEl, {'font-size': '16px', 'font-weight': '700', 'color': '#ffffff', 'flex': 'none'});
    hostEl = document.createElement('span');
    css(hostEl, {
        'font-size': '16px',
        'font-weight': '600',
        'color': '#e6dfff',
        'overflow': 'hidden',
        'text-overflow': 'ellipsis',
    });
    line.append(iconSlot, titleEl, hostEl);
    noteEl = document.createElement('div');
    css(noteEl, {
        'font-size': '12.5px',
        'font-weight': '500',
        'color': '#b9a9f2',
        'overflow': 'hidden',
        'text-overflow': 'ellipsis',
    });
    text.append(line, noteEl);

    pill.append(mascot(), divider, text, countdownRing());
    root.append(pill);
}

/** Restart the drain from full: jump back without a transition, then run down. */
function drainRing() {
    if (!ringArc || prefersReducedMotion()) {
        return;
    }
    css(ringArc, {'transition': 'none', 'stroke-dashoffset': '0'});
    ringArc.getBoundingClientRect(); // commit the reset before transitioning
    requestAnimationFrame(() => css(ringArc!, {
        'transition': `stroke-dashoffset ${VISIBLE_MS}ms linear`,
        'stroke-dashoffset': RING_C.toFixed(2),
    }));
}

/** Undo a whole-page filter (filter engines invert <html>) so the pill stays dark. */
function counterPageFilter() {
    if (!host) {
        return;
    }
    const pageFilter = getComputedStyle(document.documentElement).filter;
    let reverse = 'none';
    if (pageFilter && pageFilter !== 'none') {
        reverse = pageFilter.includes('url(') ? 'url("#dark-reader-reverse-filter")' : 'invert(100%) hue-rotate(180deg)';
    }
    if (host.style.getPropertyValue('filter') !== reverse) {
        css(host, {filter: reverse});
    }
}

function watchPageFilter() {
    counterPageFilter();
    frameRequest = requestAnimationFrame(watchPageFilter);
}

function stopWatching() {
    if (frameRequest !== null) {
        cancelAnimationFrame(frameRequest);
        frameRequest = null;
    }
}

export function showOSD({title, detail}: {title: string; detail?: string}): void {
    if (window !== window.top || !document.documentElement) {
        return;
    }
    if (!host) {
        create();
    }
    if (!host!.isConnected) {
        document.documentElement.append(host!);
    }
    const {host: site, note} = splitOSDDetail(detail);
    iconSlot!.replaceChildren(modeIcon(osdIconFor(title)));
    titleEl!.textContent = title;
    hostEl!.textContent = site ? `·  ${site}` : '';
    noteEl!.textContent = note;
    css(noteEl!, {display: note ? 'block' : 'none'});

    removeTimer && clearTimeout(removeTimer);
    hideTimer && clearTimeout(hideTimer);
    stopWatching();
    watchPageFilter();
    drainRing();

    // next frame, so a freshly inserted pill fades in rather than popping
    requestAnimationFrame(() => css(pill!, {opacity: '1', transform: 'none'}));

    hideTimer = setTimeout(() => {
        css(pill!, {opacity: '0', transform: 'translateY(-4px)'});
        removeTimer = setTimeout(() => {
            stopWatching();
            host?.remove();
        }, FADE_MS);
    }, VISIBLE_MS);
}
