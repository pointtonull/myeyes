/**
 * MyEyes! "worst offender" fixing — pure helpers, no browser APIs
 * (tests: tests/unit/utils/offender.tests.ts). The pipeline lives in
 * background/glare-fixer.ts (screenshot → glare region → offender → fix) and
 * inject/offender.ts (finding / matching / virtually trying in the page).
 *
 * LLM-less by design: the offender comes from the glare metric, the fix from
 * community rules that already target that element (ranked by how precisely
 * they target it and how fresh the style is) or, failing that, a generated
 * rule. Every fix is verified by a second screenshot before it is kept.
 */

export type OffenderKind = 'color' | 'bg-image' | 'media' | 'canvas';

export interface Offender {
    /** A CSS selector path that finds the element again. */
    path: string;
    tag: string;
    id: string;
    classes: string[];
    kind: OffenderKind;
    /** Luminance of its computed background (null for media). */
    Y: number | null;
}

export interface RuleMatch {
    selector: string;
    /** Declarations relevant to the offender's kind, "prop: value" each. */
    declarations: string[];
    styleName: string;
    styleId: string;
    /** Share of the style's selectors that hit the page (freshness). */
    hitRate: number;
    weeklyInstalls: number;
}

export interface FixCandidate {
    css: string;
    /** 'community:<style id>' or 'generated'. */
    source: string;
    label: string;
}

// --- stable paths ------------------------------------------------------------

/** Classes added by other extensions / frameworks' runtime state, never part of a site's markup. */
const FOREIGN_CLASSES = /^(vsc-initialized|darkreader|js-focus-visible|focus-visible|is-focused|hover|active)$/;

/** An id worth anchoring a path on: readable, not generated (no long digit runs, no base64-ish ids). */
export function isStableId(id: string): boolean {
    if (!/^[A-Za-z][\w-]{0,40}$/.test(id) || /\d{3,}/.test(id)) {
        return false;
    }
    // generated per-page ids like "mwNw", "mwAQ" (MediaWiki Parsoid)
    if (/^mw[A-Z0-9][A-Za-z0-9]{1,3}$/.test(id)) {
        return false;
    }
    // a base36-ish chunk: "thing_t3_1xsnvnd" (Reddit post ids)
    return !id.split(/[-_]/).some((chunk) => chunk.length >= 6 && /\d/.test(chunk) && /[a-z]/i.test(chunk));
}

/** Shannon entropy per character. */
function entropy(text: string): number {
    const counts = new Map<string, number>();
    for (const ch of text) {
        counts.set(ch, (counts.get(ch) || 0) + 1);
    }
    let h = 0;
    for (const n of counts.values()) {
        const p = n / text.length;
        h -= p * Math.log2(p);
    }
    return h;
}

/** A class name worth using in a path: not hashed (css-modules, styled-components…) and not runtime state. */
export function isStableClass(cls: string): boolean {
    if (!cls || cls.length > 40 || FOREIGN_CLASSES.test(cls)) {
        return false;
    }
    if (/^(css|sc|jsx|svelte|emotion|tw)-/.test(cls) || /\d{3,}/.test(cls) || /[-_][a-zA-Z0-9]{5,}$/.test(cls) && /\d/.test(cls.slice(-6))) {
        return false;
    }
    // mixed-case + digits with high entropy: "L6fj2A3X2mfJl5kE8caF"
    const mixed = /[a-z]/.test(cls) && /[A-Z]/.test(cls) && /\d/.test(cls);
    if (mixed && cls.length >= 8 && entropy(cls) > 3.2) {
        return false;
    }
    return true;
}

// --- specificity & ranking ------------------------------------------------------

/** [ids, classes/attributes/pseudo-classes, types] — close enough for ranking (pseudo-element parts ignored). */
export function specificity(selector: string): [number, number, number] {
    let s = selector
        .replace(/::?(before|after|first-line|first-letter|placeholder|selection|marker|backdrop)\b/gi, ' ')
        .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
    const ids = (s.match(/#[\w-]+/g) || []).length;
    const attrs = (s.match(/\[[^\]]*\]/g) || []).length;
    s = s.replace(/\[[^\]]*\]/g, ' ');
    const classes = (s.match(/\.[\w-]+/g) || []).length;
    const pseudos = (s.match(/:(?!:)[\w-]+/g) || []).filter((p) => !/^:(not|is|where|has)$/.test(p)).length;
    const types = (s.replace(/[#.:][\w-]+/g, ' ').match(/(^|[\s>+~(,])[a-zA-Z][\w-]*/g) || []).length;
    return [ids, classes + attrs + pseudos, types];
}

/** Only type / universal selectors (`*`, `div`, `body li`): touches far more than the offender. */
export function isGenericSelector(selector: string): boolean {
    const [ids, classes] = specificity(selector);
    return ids === 0 && classes === 0;
}

function mentionsTarget(selector: string, target: Offender): boolean {
    if (target.id && selector.includes(`#${target.id}`)) {
        return true;
    }
    return target.classes.some((cls) => new RegExp(`\\.${cls.replace(/[^\w-]/g, '\\$&')}(?![\\w-])`).test(selector));
}

/** Score a matched community rule: precision first, then freshness, then popularity. */
export function scoreMatch(match: RuleMatch, target: Offender): number {
    if (isGenericSelector(match.selector)) {
        return -Infinity;
    }
    const [ids, classes, types] = specificity(match.selector);
    const precision = (mentionsTarget(match.selector, target) ? 4 : 0) + Math.min(3, ids * 2 + classes * 0.5 + types * 0.1);
    return precision + 3 * match.hitRate + Math.log10(1 + match.weeklyInstalls) * 0.5;
}

/** Usable matches, best first (generic selectors dropped). */
export function rankMatches(matches: RuleMatch[], target: Offender): RuleMatch[] {
    return matches
        .map((m) => ({m, s: scoreMatch(m, target)}))
        .filter(({s}) => s > -Infinity)
        .sort((a, b) => b.s - a.s)
        .map(({m}) => m);
}

// --- fix CSS ------------------------------------------------------------------

const COLOR_PROPS = /^(background|background-color|background-image)$/;
const MEDIA_PROPS = /^filter$/;

/** Which declarations of a community rule are about this kind of offender. */
export function relevantDeclaration(property: string, value: string, kind: OffenderKind): boolean {
    if (kind === 'media') {
        return MEDIA_PROPS.test(property);
    }
    if (!COLOR_PROPS.test(property)) {
        return false;
    }
    // a background that is an image would just swap one picture for another
    return !/url\(/i.test(value);
}

function important(declaration: string): string {
    return /!\s*important\s*$/i.test(declaration) ? declaration : `${declaration} !important`;
}

/** One community rule as a fix: its selector with only the relevant declarations, forced. */
export function communityFix(match: RuleMatch): FixCandidate {
    return {
        css: `${match.selector} { ${match.declarations.map(important).join('; ')}; }`,
        source: `community:${match.styleId}`,
        label: match.styleName,
    };
}

export interface ThemeColors {
    background: string;
}

/** A generated fix when no community rule fits. `verdict` comes from the region's pixels (image-triage). */
export function generatedFix(target: Offender, colors: ThemeColors, verdict: 'invert' | 'dim' | 'none'): FixCandidate {
    let declarations: string;
    if (target.kind === 'media' || target.kind === 'bg-image' || target.kind === 'canvas') {
        declarations = verdict === 'invert' ? 'filter: invert(90%) hue-rotate(180deg) !important' : 'filter: brightness(70%) !important';
        if (target.kind === 'canvas' && target.tag === 'html') {
            declarations = `background-color: ${colors.background} !important`;
        }
    } else {
        declarations = `background-color: ${colors.background} !important; background-image: none !important`;
    }
    return {css: `${target.path} { ${declarations}; }`, source: 'generated', label: 'new rule'};
}

/** Short human name for the offender ("div.mw-page-container", "img", "#hnmain"). */
export function describeOffender(target: Offender): string {
    if (target.id && isStableId(target.id)) {
        return `#${target.id}`;
    }
    const cls = target.classes.filter(isStableClass)[0];
    return cls ? `${target.tag}.${cls}` : target.tag;
}
