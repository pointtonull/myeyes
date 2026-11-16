/**
 * MyEyes! LESS community styles: what a style may import while it compiles —
 * pure helpers (tests: tests/unit/utils/less-imports.tests.ts). The compiler
 * itself is loaded on demand by background/less-compiler.ts.
 *
 * LESS styles often pull in a shared library at compile time (Catppuccin's
 * `lib.less`, Dracula's `lib.less`). That is remote input, so: https only, a
 * short allowlist of the hosts style authors actually use, a size cap, and
 * LESS's inline JavaScript stays off. Plain CSS imports from those hosts are
 * inlined (otherwise the sanitizer drops the `@import` and the style loses
 * its variables); anything else is left for the sanitizer to drop.
 */

/** Hosts (and their subdomains) community styles import from. */
export const LESS_IMPORT_HOSTS = ['catppuccin.com', 'raw.githubusercontent.com', 'cdn.jsdelivr.net', 'userstyles.world'];

export const MAX_IMPORT_BYTES = 512 * 1024;

export function isAllowedImportURL(url: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
        return false;
    }
    const host = parsed.hostname.toLowerCase();
    return LESS_IMPORT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** The absolute URL an import refers to (relative ones resolve against the importing file), or null. */
export function resolveImportURL(filename: string, currentDirectory = ''): string | null {
    let url: string;
    try {
        url = new URL(filename, currentDirectory || undefined).href;
    } catch {
        return null;
    }
    // a bare "lib" means "lib.less", as LESS itself assumes
    if (!/\.[a-z]+$/i.test(new URL(url).pathname)) {
        url = url.replace(/(\?|#|$)/, '.less$1');
    }
    return isAllowedImportURL(url) ? url : null;
}

/** `@import url("https://allowed/x.css");` → `@import (inline) "https://allowed/x.css";` so LESS fetches and inlines it. */
export function inlineAllowedCSSImports(source: string): string {
    return source.replace(
        /@import\s+(?:\(css\)\s*)?(?:url\(\s*)?(["'])(https:[^"']+\.css(?:\?[^"']*)?)\1\s*\)?\s*;/gi,
        (whole, _quote: string, url: string) => (isAllowedImportURL(url) ? `@import (inline) "${url}";` : whole),
    );
}

type FetchText = (url: string) => Promise<string>;

/**
 * A LESS plugin whose file manager answers every import: allowed URLs are
 * fetched (size-capped), everything else fails the compile of that import.
 * `less` is the compiler object: the browser build only exports
 * AbstractFileManager (the node build also has FileManager), so that is the
 * base class; plugin file managers take precedence over built-in ones.
 */
export function createImportPlugin(less: any, fetchText: FetchText): any {
    class AllowlistFileManager extends (less.AbstractFileManager || less.FileManager) {
        supports() {
            return true;
        }

        supportsSync() {
            return false;
        }

        async loadFile(filename: string, currentDirectory: string) {
            const url = resolveImportURL(filename, currentDirectory);
            if (!url) {
                throw {type: 'File', message: `MyEyes: import not allowed: ${filename}`};
            }
            const contents = await fetchText(url);
            if (contents.length > MAX_IMPORT_BYTES) {
                throw {type: 'File', message: `MyEyes: import too large: ${url}`};
            }
            return {contents, filename: url};
        }
    }
    return {
        install(_less: any, pluginManager: any) {
            pluginManager.addFileManager(new AllowlistFileManager());
        },
    };
}
