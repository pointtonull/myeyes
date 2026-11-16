import type {UserSettings} from '../definitions';
import {ThemeEngine} from '../generators/theme-engines';
import {measureGlare, toLuma} from '../utils/glare-metric';
import type {Box, RGBAImage} from '../utils/glare-metric';
import {imageStats, triageImage} from '../utils/image-triage';
import {MessageTypeBGtoCS, MessageTypeCStoBG} from '../utils/message';
import {resolveSiteTheme} from '../utils/named-themes';
import {communityFix, describeOffender, fixBackground, generatedFix, rankMatches, relevantDeclaration} from '../utils/offender';
import type {FixCandidate, Offender, RuleMatch} from '../utils/offender';
import type {OSDMessage} from '../utils/osd-message';
import {addSiteFix, removeSiteFix} from '../utils/site-fixes';
import {USW_INDEX_URL, candidatesForHost, slimIndex, uswStyleURL} from '../utils/style-index';
import type {IndexEntry} from '../utils/style-index';
import {prepareStyle, rulesForURL} from '../utils/usercss';
import {generateUID} from '../utils/uid';
import {getURLHostOrProtocol} from '../utils/url';

import TabManager from './tab-manager';
import {readLocalStorage, writeLocalStorage} from './utils/extension-api';
import {logInfo, logWarn} from './utils/log';

/**
 * MyEyes! AI Enhance — LLM-less "worst offender" fixing (design + spike:
 * BrowserExtensions/docs/community-styles.md). One press:
 *
 * 1. screenshot the visible tab → glare metric → the largest bright region
 *    (sees images, iframes, canvas — everything computed styles can't);
 * 2. the page names what paints it (inject/offender.ts) → its path;
 * 3. community styles for the site (userstyles.world index, cached a week;
 *    sources cached per session) → rules that hit that element, ranked by
 *    precision and freshness; else a generated rule;
 * 4. colour fixes are tried invisibly first (virtual render);
 * 5. the fix is saved for the site, a second screenshot verifies the region
 *    got darker — otherwise the fix is removed again.
 *
 * Network: only on a press, only userstyles.world (index + the site's top
 * styles). Nothing about the page leaves the machine.
 */

interface Deps {
    settings: () => UserSettings;
    changeSettings: (patch: Partial<UserSettings>) => void;
    osd: (tabId: number, message: OSDMessage) => void;
    /** The theme engine is running on the page (false: left alone because it is already dark). */
    darkened: boolean;
}

const CAPTURE_WIDTH = 320;
const MIN_REGION_SHARE = 0.004;
const INDEX_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const STYLES_PER_SITE = 8;
const MAX_SELECTORS = 6000;
const SETTLE_MS = 900;
const PSEUDO_OR_STATE = /::?(before|after|first-line|first-letter|placeholder|selection|marker|backdrop|-webkit-[\w-]+|-moz-[\w-]+)|:(hover|focus|focus-within|focus-visible|active|visited|target)\b/i;

interface StyleRules {
    id: string;
    name: string;
    weekly: number;
    rules: Array<{selectors: string[]; declarations: Array<{property: string; value: string}>}>;
}

interface Shot {
    image: RGBAImage;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default class GlareFixer {
    private static pending = new Map<string, (result: any) => void>();
    private static index: IndexEntry[] | null = null;
    private static sources = new Map<number, string>();
    private static running = false;

    static init(): void {
        chrome.runtime.onMessage.addListener((message: any) => {
            if (message?.type === MessageTypeCStoBG.OFFENDER_RESPONSE) {
                const resolve = GlareFixer.pending.get(message.data?.id);
                GlareFixer.pending.delete(message.data?.id);
                resolve?.(message.data?.result);
            }
        });
    }

    /** Ask the tab's top-frame content script (inject/offender.ts). */
    private static ask<T>(tabId: number, op: string, args: unknown, timeoutMs = 8000): Promise<T | null> {
        return new Promise((resolve) => {
            const id = generateUID();
            const timer = setTimeout(() => {
                GlareFixer.pending.delete(id);
                resolve(null);
            }, timeoutMs);
            GlareFixer.pending.set(id, (result) => {
                clearTimeout(timer);
                resolve(result);
            });
            if (!TabManager.sendToTopFrame(tabId, MessageTypeBGtoCS.OFFENDER_REQUEST, {id, op, args})) {
                clearTimeout(timer);
                GlareFixer.pending.delete(id);
                resolve(null);
            }
        });
    }

    private static async capture(windowId: number): Promise<Shot> {
        const dataURL = await new Promise<string>((resolve, reject) => {
            chrome.tabs.captureVisibleTab(windowId, {format: 'png'}, (url) => {
                const error = chrome.runtime.lastError;
                error || !url ? reject(new Error(error?.message || 'capture failed')) : resolve(url);
            });
        });
        const bitmap = await createImageBitmap(await (await fetch(dataURL)).blob());
        const width = CAPTURE_WIDTH;
        const height = Math.max(1, Math.round(bitmap.height * CAPTURE_WIDTH / bitmap.width));
        const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), {width, height});
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
        ctx.drawImage(bitmap, 0, 0, width, height);
        return {image: {width, height, data: ctx.getImageData(0, 0, width, height).data}};
    }

    private static crop({width, data}: RGBAImage, box: Box): Uint8ClampedArray {
        const out = new Uint8ClampedArray(box.width * box.height * 4);
        for (let y = 0; y < box.height; y++) {
            const from = ((box.y + y) * width + box.x) * 4;
            out.set(data.subarray(from, from + box.width * 4), y * box.width * 4);
        }
        return out;
    }

    private static meanLuminance(image: RGBAImage, box: Box): number {
        const luma = toLuma({width: box.width, height: box.height, data: GlareFixer.crop(image, box)});
        let sum = 0;
        luma.Y.forEach((y) => sum += y);
        return sum / luma.Y.length;
    }

    private static async loadIndex(): Promise<IndexEntry[]> {
        if (GlareFixer.index) {
            return GlareFixer.index;
        }
        const stored = await readLocalStorage({myeyesStyleIndex: null as null | {fetched: number; entries: IndexEntry[]}});
        if (stored.myeyesStyleIndex && Date.now() - stored.myeyesStyleIndex.fetched < INDEX_MAX_AGE_MS) {
            GlareFixer.index = stored.myeyesStyleIndex.entries;
            return GlareFixer.index;
        }
        const response = await fetch(USW_INDEX_URL, {credentials: 'omit'});
        if (!response.ok) {
            throw new Error(`style index: HTTP ${response.status}`);
        }
        GlareFixer.index = slimIndex(await response.json());
        await writeLocalStorage({myeyesStyleIndex: {fetched: Date.now(), entries: GlareFixer.index}});
        return GlareFixer.index;
    }

    private static async styleRules(entry: IndexEntry, url: string): Promise<StyleRules | null> {
        const [id, name, , weekly] = entry;
        let source = GlareFixer.sources.get(id);
        if (source === undefined) {
            try {
                const response = await fetch(uswStyleURL(id), {credentials: 'omit'});
                source = response.ok ? await response.text() : '';
            } catch {
                source = '';
            }
            GlareFixer.sources.set(id, source);
        }
        const prepared = prepareStyle(source);
        if (!source || prepared.unsupported || prepared.needs || prepared.code === null) {
            return null; // less / stylus styles are skipped for now
        }
        return {id: `usw-${id}`, name, weekly, rules: rulesForURL(prepared.code, url).rules};
    }

    /** Community fixes for the offender: fetch + parse the site's styles, match in the page, rank. */
    private static async communityCandidates(tabId: number, url: string, host: string, target: Offender & {index: number}): Promise<FixCandidate[]> {
        let entries: IndexEntry[];
        try {
            entries = candidatesForHost(await GlareFixer.loadIndex(), host, {limit: STYLES_PER_SITE});
        } catch (err) {
            logWarn(`AI Enhance: no style index (${String(err)})`);
            return [];
        }
        const styles = (await Promise.all(entries.map((e) => GlareFixer.styleRules(e, url)))).filter(Boolean) as StyleRules[];
        if (!styles.length) {
            return [];
        }
        const flat: Array<{selector: string; declarations: string[]; style: number}> = [];
        styles.forEach((style, si) => style.rules.forEach((rule) => {
            const declarations = rule.declarations
                .filter((d) => relevantDeclaration(d.property, d.value, target.kind))
                .map((d) => `${d.property}: ${d.value}`);
            if (!declarations.length) {
                return;
            }
            rule.selectors.forEach((selector) => {
                if (!PSEUDO_OR_STATE.test(selector) && flat.length < MAX_SELECTORS) {
                    flat.push({selector, declarations, style: si});
                }
            });
        }));
        const [hits, rates] = await Promise.all([
            GlareFixer.ask<number[]>(tabId, 'match', {index: target.index, selectors: flat.map((f) => f.selector)}),
            GlareFixer.ask<number[]>(tabId, 'hitRates', {styles: styles.map((s) => s.rules.flatMap((r) => r.selectors).filter((sel) => !PSEUDO_OR_STATE.test(sel)).slice(0, 150))}),
        ]);
        const matches: RuleMatch[] = (hits || []).map((i) => ({
            selector: flat[i].selector,
            declarations: flat[i].declarations,
            styleName: styles[flat[i].style].name,
            styleId: styles[flat[i].style].id,
            hitRate: rates?.[flat[i].style] ?? 0,
            weeklyInstalls: styles[flat[i].style].weekly,
        }));
        logInfo(`AI Enhance: ${styles.length} styles, ${flat.length} rules, ${matches.length} hit ${target.path}`);
        return rankMatches(matches, target).slice(0, 3).map(communityFix);
    }

    static async enhance(tab: chrome.tabs.Tab, url: string, deps: Deps): Promise<void> {
        if (GlareFixer.running || !tab.id || tab.windowId === undefined) {
            return;
        }
        GlareFixer.running = true;
        const tabId = tab.id;
        const host = getURLHostOrProtocol(url);
        const say = (title: string, note: string) => deps.osd(tabId, {title, host, note, icon: 'custom'});
        let applied = '';
        try {
            const theme = resolveSiteTheme(deps.settings(), url).theme;
            // filter engines invert the whole page: a dark fix would come out bright
            if (deps.darkened && (theme.engine === ThemeEngine.cssFilter || theme.engine === ThemeEngine.svgFilter)) {
                say('AI Enhance', 'Fixes don\'t work with Filter+ yet: switch to Dynamic');
                return;
            }
            say('Looking for glare', 'Finding the brightest thing left');

            // 1. the worst bright region
            const before = await GlareFixer.capture(tab.windowId);
            const {regions} = measureGlare(toLuma(before.image));
            const {width: W, height: H} = before.image;
            const worst = regions.find((r) => r.width * r.height >= MIN_REGION_SHARE * W * H);
            if (!worst) {
                say('No glare found', 'Nothing bright is left on screen');
                return;
            }
            const regionY = GlareFixer.meanLuminance(before.image, worst);

            // 2. what paints it (centre, plus a few points inside, majority wins)
            const pts: Array<[number, number]> = [[0.5, 0.5], [0.3, 0.3], [0.7, 0.7], [0.3, 0.7], [0.7, 0.3]]
                .map(([fx, fy]) => [(worst.x + fx * worst.width) / W, (worst.y + fy * worst.height) / H]);
            const found = await GlareFixer.ask<Array<Offender & {index: number}>>(tabId, 'find', {points: pts});
            if (!found?.length) {
                say('AI Enhance', 'Could not read this page');
                return;
            }
            const votes = new Map<number, number>();
            found.forEach((o) => votes.set(o.index, (votes.get(o.index) || 0) + 1));
            const winner = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
            const target = found.find((o) => o.index === winner)!;
            const what = describeOffender(target);

            // 3. community rules, else a generated one
            say(`Found ${what}`, 'Looking for community fixes');
            const verdict = triageImage(imageStats(GlareFixer.crop(before.image, worst)), {width: 999, height: 999}).treatment;
            const community = await GlareFixer.communityCandidates(tabId, url, host, target);
            const generated = generatedFix(target, {background: fixBackground(target, theme.darkSchemeBackgroundColor)}, verdict === 'none' ? 'dim' : verdict);
            let chosen: FixCandidate = community[0] || generated;

            // 4. colour fixes: try invisibly, keep the first that really darkens it
            if (target.kind === 'color') {
                const options = [...community, generated];
                const tried = await GlareFixer.ask<Array<number | null>>(tabId, 'try', {index: target.index, css: options.map((o) => o.css)});
                const good = options.find((_, i) => tried?.[i] !== null && tried?.[i] !== undefined && tried[i]! < 0.2);
                if (good) {
                    chosen = good;
                }
            }

            // 5. apply, then verify with a second screenshot
            const fix = {css: chosen.css, target: what, source: chosen.source, created: Date.now()};
            deps.changeSettings(addSiteFix(deps.settings(), host, fix));
            applied = what;
            await sleep(SETTLE_MS);
            const after = await GlareFixer.capture(tab.windowId);
            const afterY = GlareFixer.meanLuminance(after.image, worst);
            const improved = afterY < 0.2 || afterY < regionY * 0.6;
            logInfo(`AI Enhance: ${what} via ${chosen.source}: region Y ${regionY.toFixed(3)} → ${afterY.toFixed(3)} (${improved ? 'kept' : 'reverted'})`);
            if (!improved) {
                deps.changeSettings(removeSiteFix(deps.settings(), host, what));
                applied = '';
                say(`Couldn't fix ${what}`, 'Tried, but it stayed bright, so nothing was kept');
                return;
            }
            applied = '';
            const by = chosen.source === 'generated' ? 'with a new rule' : `using "${chosen.label}"`;
            say(`Fixed ${what}`, `${Math.round(regionY * 100)}% → ${Math.round(afterY * 100)}% brightness, ${by}`);
        } catch (err) {
            logWarn(`AI Enhance failed: ${String(err)}`);
            if (applied) {
                deps.changeSettings(removeSiteFix(deps.settings(), host, applied)); // unverified: don't keep it
            }
            say('AI Enhance', 'Something went wrong; nothing was changed');
        } finally {
            GlareFixer.running = false;
        }
    }
}
