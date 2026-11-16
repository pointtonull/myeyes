import {
    communityFix,
    describeOffender,
    generatedFix,
    isGenericSelector,
    isStableClass,
    isStableId,
    rankMatches,
    relevantDeclaration,
    specificity,
} from '../../../src/utils/offender';
import type {Offender, RuleMatch} from '../../../src/utils/offender';

const WIKI: Offender = {path: 'body > div.mw-page-container', tag: 'div', id: '', classes: ['mw-page-container'], kind: 'color', Y: 1};
const IMG: Offender = {path: '#content > img.plot', tag: 'img', id: '', classes: ['plot'], kind: 'media', Y: null};

function match(selector: string, over: Partial<RuleMatch> = {}): RuleMatch {
    return {selector, declarations: ['background-color: #111'], styleName: 'S', styleId: 'usw-1', hitRate: 0.3, weeklyInstalls: 10, ...over};
}

describe('stable paths', () => {
    it('rejects generated ids and keeps readable ones', () => {
        expect(['hnmain', 'bodyContent', 'appRoot', 'header-bottom-left'].every(isStableId)).toBe(true);
        expect(['mwNw', 'mwAQ', 'thing_t3_1xsnvnd', 'item12345', '9lives'].some(isStableId)).toBe(false);
    });

    it('rejects hashed classes and classes other extensions add', () => {
        expect(['mw-page-container', 'react-results--main', 'd-flex', 'site-wrapper'].every(isStableClass)).toBe(true);
        expect(['L6fj2A3X2mfJl5kE8caF', 'css-1x2y3z', 'sc-bdVaJa', 'vsc-initialized', 'prc-PageLayout-ContentWrapper-gR9eG'].some(isStableClass)).toBe(false);
    });
});

describe('specificity and ranking', () => {
    it('counts ids, classes/attributes/pseudo-classes and types', () => {
        expect(specificity('#hnmain td[bgcolor="#ff6600"]')).toEqual([1, 1, 1]);
        expect(specificity(':root .mw-page-container')).toEqual([0, 2, 0]);
        expect(specificity('body > div.x::before')).toEqual([0, 1, 2]);
    });

    it('type/universal-only selectors are generic', () => {
        expect(['*', 'li', 'body div', 'html > body'].every(isGenericSelector)).toBe(true);
        expect(isGenericSelector('.mw-page-container')).toBe(false);
    });

    it('prefers rules that name the offender, then fresh styles; drops generic ones', () => {
        const ranked = rankMatches([
            match('*', {hitRate: 1}),
            match('div', {hitRate: 1}),
            match('.vector-body .something-else'),
            match('.mw-page-container', {hitRate: 0.1, styleId: 'usw-stale'}),
            match(':root .mw-page-container', {hitRate: 0.6, styleId: 'usw-fresh'}),
        ], WIKI);
        expect(ranked.map((m) => m.selector)).toEqual([':root .mw-page-container', '.mw-page-container', '.vector-body .something-else']);
    });
});

describe('fix css', () => {
    it('keeps only relevant declarations per kind', () => {
        expect(relevantDeclaration('background-color', '#111', 'color')).toBe(true);
        expect(relevantDeclaration('background', 'url(data:x)', 'color')).toBe(false);
        expect(relevantDeclaration('color', '#eee', 'color')).toBe(false);
        expect(relevantDeclaration('filter', 'invert(1)', 'media')).toBe(true);
        expect(relevantDeclaration('background-color', '#111', 'media')).toBe(false);
    });

    it('a community fix forces its declarations', () => {
        const fix = communityFix(match('.mw-page-container', {declarations: ['background-color: #222', 'background-image: none !important']}));
        expect(fix.css).toBe('.mw-page-container { background-color: #222 !important; background-image: none !important; }');
        expect(fix.source).toBe('community:usw-1');
    });

    it('generated fixes: dark background for boxes, invert or dim for media', () => {
        expect(generatedFix(WIKI, {background: '#181a1b'}, 'none').css)
            .toBe('body > div.mw-page-container { background-color: #181a1b !important; background-image: none !important; }');
        expect(generatedFix(IMG, {background: '#181a1b'}, 'invert').css).toBe('#content > img.plot { filter: invert(90%) hue-rotate(180deg) !important; }');
        expect(generatedFix(IMG, {background: '#181a1b'}, 'dim').css).toBe('#content > img.plot { filter: brightness(70%) !important; }');
    });

    it('describes the offender briefly', () => {
        expect(describeOffender(WIKI)).toBe('div.mw-page-container');
        expect(describeOffender({...WIKI, id: 'hnmain', tag: 'table', classes: []})).toBe('#hnmain');
    });
});
