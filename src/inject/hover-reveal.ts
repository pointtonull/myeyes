import {IMAGE_ATTR, REVEAL_ATTR, elementSelector} from '../utils/image-triage';

import {mediaFilterSelectors} from './dynamic-theme/selectors';

/**
 * MyEyes! hover reveal: images MyEyes darkened only to tame glare are shown as
 * they are while the pointer rests on them — dimmed photos (image triage) and
 * large light background images under the dynamic theme's overlay — so photo
 * albums aren't ruined. Inverted diagrams are not revealed (a white flash).
 *
 * Photophobia guards: a short hover intent first (a pointer passing over
 * reveals nothing), only the innermost such element under the pointer, and
 * never anything covering most of the viewport (a page background must not
 * flip bright while the mouse moves). Leaving it, or the window, hides it at once.
 */

const INTENT_MS = 350;
const MAX_VIEWPORT_SHARE = 0.75;
const DIMMED_IMG = `img[${IMAGE_ATTR}="dim"]`;

let active = false;
let candidate: Element | null = null;
let revealed: Element | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let cachedKey = '';
let cachedSelector = '';

/** One selector for every overlaid element (pseudo-element parts dropped, invalid ones skipped). */
function overlaySelector(): string {
    const all: string[] = [];
    mediaFilterSelectors.forEach(({overlay}) => overlay.forEach((s) => all.push(elementSelector(s))));
    const key = all.join('\n');
    if (key !== cachedKey) {
        cachedKey = key;
        cachedSelector = all.filter((s) => {
            try {
                document.documentElement.matches(s);
                return true;
            } catch {
                return false;
            }
        }).join(', ');
    }
    return cachedSelector;
}

function isPageSized(el: Element): boolean {
    const r = el.getBoundingClientRect();
    return r.width * r.height > MAX_VIEWPORT_SHARE * innerWidth * innerHeight;
}

function findCandidate(target: EventTarget | null): Element | null {
    const overlaid = overlaySelector();
    for (let el = target instanceof Element ? target : null; el && el !== document.documentElement; el = el.parentElement) {
        if (el.matches(DIMMED_IMG) || (overlaid && el.matches(overlaid))) {
            return isPageSized(el) ? null : el;
        }
    }
    return null;
}

function hide() {
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
    revealed?.removeAttribute(REVEAL_ATTR);
    revealed = null;
    candidate = null;
}

function onPointerOver(e: PointerEvent) {
    const next = findCandidate(e.target);
    if (next === candidate) {
        return;
    }
    hide();
    candidate = next;
    if (next) {
        timer = setTimeout(() => {
            timer = null;
            if (candidate === next && active) {
                next.setAttribute(REVEAL_ATTR, '');
                revealed = next;
            }
        }, INTENT_MS);
    }
}

function onPointerOut(e: PointerEvent) {
    if (!e.relatedTarget) {
        hide(); // left the window
    }
}

export function runHoverReveal(): void {
    if (active) {
        return;
    }
    active = true;
    document.addEventListener('pointerover', onPointerOver, {passive: true, capture: true});
    document.addEventListener('pointerout', onPointerOut, {passive: true, capture: true});
    window.addEventListener('blur', hide);
}

export function stopHoverReveal(): void {
    active = false;
    hide();
    document.removeEventListener('pointerover', onPointerOver, {capture: true});
    document.removeEventListener('pointerout', onPointerOut, {capture: true});
    window.removeEventListener('blur', hide);
}
