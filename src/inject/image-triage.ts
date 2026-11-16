import {IMAGE_ATTR, imageStats, shouldDimWhilePending, triageCSS, triageImage} from '../utils/image-triage';
import type {ImageTreatment} from '../utils/image-triage';

import {bgFetch} from './dynamic-theme/network';
import {logWarn} from './utils/log';

/**
 * MyEyes! image triage — the DOM shell around utils/image-triage.ts.
 *
 * Watches <img> elements, samples each image's pixels (drawn directly when
 * same-origin / data: / blob:, else fetched through the background like the
 * dynamic theme's own image analysis, so CORS doesn't matter), and marks the
 * element with its verdict; one stylesheet turns verdicts into filters.
 * Verdicts are cached per URL for the page's lifetime, so a repeated image is
 * treated instantly; large images are dimmed while pending.
 */

const SAMPLE_SIDE = 64;
const MAX_CONCURRENT = 2;
const MAX_IMAGES_PER_PAGE = 300;
const STYLE_CLASS = 'darkreader darkreader--myeyes-images';

let active = false;
let engine: 'dynamic' | 'filter' = 'dynamic';
let style: HTMLStyleElement | null = null;
let observer: MutationObserver | null = null;
let analysed = 0;
let running = 0;
const queue: string[] = [];
const verdicts = new Map<string, ImageTreatment>();
const pending = new Map<string, Set<HTMLImageElement>>();

function urlOf(img: HTMLImageElement): string {
    return img.currentSrc || img.src || '';
}

function renderedSize(img: HTMLImageElement) {
    const rect = img.getBoundingClientRect();
    return {
        width: Math.max(rect.width, img.width || 0) || img.naturalWidth,
        height: Math.max(rect.height, img.height || 0) || img.naturalHeight,
    };
}

function mark(img: HTMLImageElement, value: ImageTreatment | 'pending') {
    if (value === 'none') {
        img.removeAttribute(IMAGE_ATTR);
    } else if (img.getAttribute(IMAGE_ATTR) !== value) {
        img.setAttribute(IMAGE_ATTR, value);
    }
}

function dataURLToBlob(dataURL: string): Blob | null {
    const comma = dataURL.indexOf(',');
    const header = dataURL.slice(5, comma);
    if (comma < 0 || !header.includes(';base64')) {
        return null;
    }
    const type = header.split(';')[0];
    const chars = atob(dataURL.slice(comma + 1));
    const bytes = new Uint8Array(chars.length);
    for (let i = 0; i < chars.length; i++) {
        bytes[i] = chars.charCodeAt(i);
    }
    return new Blob([bytes], {type});
}

/** A small RGBA sample of the image, or null when it can't be read (SVG, errors…). */
async function samplePixels(url: string, img: HTMLImageElement): Promise<Uint8ClampedArray | null> {
    let source: CanvasImageSource | null = null;
    const local = url.startsWith('data:') || url.startsWith('blob:') || new URL(url, location.href).origin === location.origin;
    if (local && img.complete && img.naturalWidth > 0) {
        source = img;
    } else {
        const dataURL = await bgFetch({url, responseType: 'data-url', origin: location.origin});
        const blob = dataURLToBlob(dataURL);
        if (!blob || blob.type.includes('svg')) {
            return null; // SVG blobs can't become bitmaps; left alone for now
        }
        source = await createImageBitmap(blob);
    }
    const w = (source as any).naturalWidth || (source as any).width;
    const h = (source as any).naturalHeight || (source as any).height;
    if (!w || !h) {
        return null;
    }
    const k = Math.min(1, SAMPLE_SIDE / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * k));
    const ch = Math.max(1, Math.round(h * k));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d', {willReadFrequently: true})!;
    ctx.drawImage(source, 0, 0, cw, ch);
    return ctx.getImageData(0, 0, cw, ch).data;
}

async function analyse(url: string) {
    const imgs = pending.get(url);
    const first = imgs && [...imgs][0];
    let verdict: ImageTreatment = 'none';
    if (first) {
        try {
            const data = await samplePixels(url, first);
            if (data) {
                verdict = triageImage(imageStats(data), renderedSize(first)).treatment;
            }
        } catch (err) {
            logWarn(`Image triage skipped ${url.slice(0, 80)}: ${String(err)}`);
        }
    }
    verdicts.set(url, verdict);
    pending.delete(url);
    if (active) {
        imgs?.forEach((img) => urlOf(img) === url && mark(img, verdict));
    }
}

function pump() {
    while (active && running < MAX_CONCURRENT && queue.length) {
        const url = queue.shift()!;
        running++;
        analyse(url).finally(() => {
            running--;
            pump();
        });
    }
}

function consider(img: HTMLImageElement) {
    if (!active) {
        return;
    }
    const url = urlOf(img);
    if (!url) {
        return;
    }
    const known = verdicts.get(url);
    if (known) {
        mark(img, known);
        return;
    }
    if (analysed >= MAX_IMAGES_PER_PAGE && !pending.has(url)) {
        return;
    }
    // dim a large image already while it loads (they paint progressively) and while it's analysed
    if (engine === 'dynamic' && shouldDimWhilePending(renderedSize(img))) {
        mark(img, 'pending');
    }
    if (!img.complete) {
        return; // the capturing `load` listener comes back here
    }
    if (img.naturalWidth === 0) {
        img.removeAttribute(IMAGE_ATTR); // broken image
        return;
    }
    const waiting = pending.get(url);
    if (waiting) {
        waiting.add(img);
        return;
    }
    analysed++;
    pending.set(url, new Set([img]));
    queue.push(url);
    pump();
}

function scan(root: ParentNode) {
    root.querySelectorAll('img').forEach(consider);
}

function onLoad(e: Event) {
    if (e.target instanceof HTMLImageElement) {
        consider(e.target);
    }
}

function onMutations(records: MutationRecord[]) {
    for (const record of records) {
        if (record.type === 'attributes') {
            const img = record.target as HTMLImageElement;
            img.removeAttribute(IMAGE_ATTR);
            consider(img);
            continue;
        }
        record.addedNodes.forEach((node) => {
            if (node instanceof HTMLImageElement) {
                consider(node);
            } else if (node instanceof Element) {
                scan(node);
            }
        });
    }
}

function ensureStyle() {
    if (!style) {
        style = document.createElement('style');
        style.className = STYLE_CLASS;
        style.media = 'screen';
    }
    const css = triageCSS(engine);
    if (style.textContent !== css) {
        style.textContent = css;
    }
    if (!style.isConnected) {
        (document.head || document.documentElement).append(style);
    }
}

/** Start (or switch engine for) image triage on this document. */
export function runImageTriage(mode: 'dynamic' | 'filter'): void {
    const engineChanged = mode !== engine;
    engine = mode;
    ensureStyle();
    if (active && !engineChanged) {
        return;
    }
    active = true;
    if (!observer) {
        observer = new MutationObserver(onMutations);
        observer.observe(document, {childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset']});
        document.addEventListener('load', onLoad, true);
    }
    if (engineChanged) {
        // "pending" has no meaning under filter engines
        document.querySelectorAll(`img[${IMAGE_ATTR}="pending"]`).forEach((img) => img.removeAttribute(IMAGE_ATTR));
    }
    scan(document);
}

/** Stop and undo everything (theme off, site disabled, page already dark). */
export function stopImageTriage(): void {
    active = false;
    queue.length = 0;
    pending.clear();
    observer?.disconnect();
    observer = null;
    document.removeEventListener('load', onLoad, true);
    style?.remove();
    document.querySelectorAll(`img[${IMAGE_ATTR}]`).forEach((img) => img.removeAttribute(IMAGE_ATTR));
}
