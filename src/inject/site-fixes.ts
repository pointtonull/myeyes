/**
 * MyEyes! AI Enhance fixes, page side: one stylesheet of its own, separate
 * from the theme engines. Updating it repaints only what its rules target —
 * saving a fix never rebuilds the dynamic theme — and it also applies on
 * pages left undarkened because they are already dark, so those keep their
 * own look and get only the specific fixes. The `darkreader` class makes the
 * dynamic theme leave it alone (its colours are already the intended ones).
 */

const STYLE_CLASS = 'darkreader darkreader--myeyes-fixes';
let style: HTMLStyleElement | null = null;

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
    // last in the document, after the engines' own sheets
    const parent = document.head || document.documentElement;
    if (style.parentNode !== parent || style.nextSibling) {
        parent.append(style);
    }
}

export function removeSiteFixes(): void {
    style?.remove();
}
