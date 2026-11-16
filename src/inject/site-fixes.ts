/**
 * MyEyes! AI Enhance fixes, page side: one stylesheet of its own, separate
 * from the theme engines. Updating it repaints only what its rules target —
 * saving a fix never rebuilds the dynamic theme — and it also applies on
 * pages left undarkened because they are already dark, so those keep their
 * own look and get only the specific fixes. The `darkreader` class makes the
 * dynamic theme leave it alone (its colours are already the intended ones);
 * the theme's teardown sweeps every .darkreader node, so while fixes are
 * wanted the sheet puts itself back.
 */

const STYLE_CLASS = 'darkreader darkreader--myeyes-fixes';
let style: HTMLStyleElement | null = null;
let wanted = false;
let guard: MutationObserver | null = null;

function place() {
    const parent = document.head || document.documentElement;
    // last in the document, after the engines' own sheets
    if (style && (style.parentNode !== parent || style.nextSibling)) {
        parent.append(style);
    }
}

function watch() {
    if (guard) {
        return;
    }
    guard = new MutationObserver(() => {
        if (wanted && style && !style.isConnected) {
            place();
        }
    });
    guard.observe(document.head || document.documentElement, {childList: true});
}

export function updateSiteFixes(css: string | undefined | null): void {
    if (!css) {
        removeSiteFixes();
        return;
    }
    if (!style) {
        style = document.createElement('style');
        style.className = STYLE_CLASS;
        style.media = 'screen';
    }
    if (style.textContent !== css) {
        style.textContent = css;
    }
    wanted = true;
    place();
    watch();
}

export function removeSiteFixes(): void {
    wanted = false;
    guard?.disconnect();
    guard = null;
    style?.remove();
}
