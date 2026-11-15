/**
 * MyEyes! on-screen confirmation for keyboard commands: a small dark pill in
 * the top-right corner ("Filter+ · example.com") that fades out by itself.
 *
 * Non-intrusive by construction: click-through (pointer-events: none), no
 * focus change, one pill reused for repeated presses, no motion when the user
 * prefers reduced motion. It lives in a closed shadow root so neither the
 * page nor the dynamic theme restyles it, and it is styled through the CSSOM
 * (not <style>/style attributes) so strict page CSPs can't block it.
 *
 * It must never turn bright: when a filter engine inverts the whole page
 * (filter on <html>), the pill gets the reverse filter, re-checked every
 * frame while visible because the engine may switch while it is on screen.
 */

const VISIBLE_MS = 1600;
const FADE_MS = 220;

let host: HTMLElement | null = null;
let pill: HTMLElement | null = null;
let titleEl: HTMLElement | null = null;
let detailEl: HTMLElement | null = null;
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

function glassesIcon(): SVGSVGElement {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 64 30');
    svg.setAttribute('width', '26');
    svg.setAttribute('height', '12');
    const defs = document.createElementNS(NS, 'defs');
    const gradient = document.createElementNS(NS, 'linearGradient');
    gradient.setAttribute('id', 'me-osd-g');
    for (const [offset, color] of [['0', '#46e0f5'], ['1', '#ef55ed']]) {
        const stop = document.createElementNS(NS, 'stop');
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', color);
        gradient.append(stop);
    }
    defs.append(gradient);
    svg.append(defs);
    for (const d of ['M14 4h6a9 9 0 0 1 9 9v0a9 9 0 0 1-9 9h-6a9 9 0 0 1-9-9v0a9 9 0 0 1 9-9z', 'M44 4h6a9 9 0 0 1 9 9v0a9 9 0 0 1-9 9h-6a9 9 0 0 1-9-9v0a9 9 0 0 1 9-9z', 'M29 10q3-4 6 0']) {
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'url(#me-osd-g)');
        path.setAttribute('stroke-width', '5');
        svg.append(path);
    }
    css(svg, {'display': 'block', 'flex': 'none'});
    return svg;
}

function create() {
    host = document.createElement('div');
    css(host, {
        'all': 'initial',
        'position': 'fixed',
        'top': '16px',
        'right': '16px',
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
        'gap': '9px',
        'max-width': '320px',
        'padding': '8px 14px 8px 11px',
        'border-radius': '999px',
        'background': 'rgba(24, 21, 46, 0.95)',
        'border': '1px solid rgba(152, 96, 245, 0.6)',
        'box-shadow': '0 4px 18px rgba(0, 0, 0, 0.45), 0 0 12px rgba(152, 96, 245, 0.25)',
        'color': '#ece8ff',
        'font': '600 13px/1.25 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        'letter-spacing': 'normal',
        'text-align': 'left',
        'white-space': 'nowrap',
        'opacity': '0',
        'transform': 'translateY(-4px)',
        'transition': prefersReducedMotion() ? 'none' : `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
    });

    titleEl = document.createElement('span');
    detailEl = document.createElement('span');
    css(detailEl, {
        'font-weight': '400',
        'color': '#b9b2d9',
        'overflow': 'hidden',
        'text-overflow': 'ellipsis',
    });
    pill.append(glassesIcon(), titleEl, detailEl);
    root.append(pill);
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
    titleEl!.textContent = title;
    detailEl!.textContent = detail ? `· ${detail}` : '';

    removeTimer && clearTimeout(removeTimer);
    hideTimer && clearTimeout(hideTimer);
    stopWatching();
    watchPageFilter();

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
