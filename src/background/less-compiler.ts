import {createImportPlugin, inlineAllowedCSSImports, MAX_IMPORT_BYTES} from '../utils/less-imports';

import {logInfo} from './utils/log';

declare const __CHROMIUM_MV3__: boolean;

/**
 * MyEyes! LESS compiler for AI Enhance's community styles. The vendored
 * browser build of less.js (src/vendor/less, ~160 KB) is loaded into the
 * background page only the first time a LESS style is needed, so it costs
 * nothing until then. Inline JavaScript in LESS stays off; remote imports go
 * through the allowlist plugin (utils/less-imports); every compile has a
 * deadline. Chrome MV3 (service worker, no late script loading) is not
 * supported yet: LESS styles are skipped there.
 */

const LESS_PATH = 'vendor/less/less.min.js';
const COMPILE_TIMEOUT_MS = 8000;
const IMPORT_TIMEOUT_MS = 5000;

let loading: Promise<any> | null = null;

export function canCompileLess(): boolean {
    return !__CHROMIUM_MV3__ && typeof document !== 'undefined';
}

function loadLess(): Promise<any> {
    if (!loading) {
        loading = new Promise((resolve, reject) => {
            // options read by the browser build when it loads: no page processing, no logging
            (window as any).less = {env: 'production', logLevel: 0, onReady: false, javascriptEnabled: false};
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL(LESS_PATH);
            script.onload = () => resolve((window as any).less);
            script.onerror = () => {
                loading = null;
                reject(new Error('could not load less.js'));
            };
            document.head.append(script);
        });
    }
    return loading;
}

async function fetchImport(url: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMPORT_TIMEOUT_MS);
    try {
        const response = await fetch(url, {credentials: 'omit', signal: controller.signal});
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const text = await response.text();
        if (text.length > MAX_IMPORT_BYTES) {
            throw new Error('too large');
        }
        return text;
    } finally {
        clearTimeout(timer);
    }
}

/** Compile a style's LESS (variables already declared by utils/usercss prepareStyle) to CSS. */
export async function compileLess(source: string): Promise<string> {
    if (!canCompileLess()) {
        throw new Error('LESS is not supported here yet');
    }
    const less = await loadLess();
    const started = Date.now();
    const render = less.render(inlineAllowedCSSImports(source), {
        math: 'always', // community styles were written for LESS 3's math
        javascriptEnabled: false,
        plugins: [createImportPlugin(less, fetchImport)],
    }).then((output: {css: string}) => output.css);
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('LESS compile timed out')), COMPILE_TIMEOUT_MS);
    });
    try {
        const css = await Promise.race([render, deadline]);
        logInfo(`LESS compiled in ${Date.now() - started} ms`);
        return css;
    } finally {
        clearTimeout(timer!);
    }
}
