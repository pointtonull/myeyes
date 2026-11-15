/**
 * MyEyes! community styles (UserCSS, as published on userstyles.world and the
 * USO archive) — pure parsing, no browser APIs, no dependencies
 * (tests: tests/unit/utils/usercss.tests.ts).
 *
 * Written from the UserCSS format (https://github.com/openstyles/stylus/wiki/
 * Writing-UserCSS), not from Stylus' code (GPL-3.0).
 *
 * - parseMeta: the `==UserStyle==` header (name, version, license,
 *   preprocessor, variables with their defaults).
 * - resolveVars: css / default / uso styles become plain CSS; less is handed
 *   back with its variables prepended (compile it elsewhere); stylus is not
 *   supported (returns null).
 * - splitSections / sectionMatches: `@-moz-document` blocks and the URLs they
 *   apply to.
 * - parseRules: qualified rules flattened out of @media / @supports, with
 *   declarations sanitized — community CSS is untrusted: remote `url()` (can
 *   beacon or keylog), `@import`, `-moz-binding`, `behavior` and
 *   `expression()` are dropped.
 * - siteRules: all of the above for one URL.
 */

export interface UserCSSVar {
    type: string;
    name: string;
    label: string;
    /** The default value, as it would be substituted. */
    value: string;
}

export interface UserCSSMeta {
    name: string;
    version: string;
    license: string;
    namespace: string;
    preprocessor: string;
    vars: UserCSSVar[];
}

export type MatcherKind = 'domain' | 'url' | 'url-prefix' | 'regexp';

export interface Matcher {
    kind: MatcherKind;
    value: string;
}

export interface Section {
    /** Empty = applies everywhere (code outside any @-moz-document). */
    matchers: Matcher[];
    css: string;
}

export interface Declaration {
    property: string;
    value: string;
    important: boolean;
}

export interface Rule {
    selectors: string[];
    declarations: Declaration[];
    /** Enclosing @media / @supports preludes, outermost first. */
    conditions: string[];
}

export interface SiteRules {
    meta: UserCSSMeta;
    rules: Rule[];
    /** Why nothing could be produced (unsupported preprocessor…), else ''. */
    unsupported: string;
    /** Declarations / at-rules removed by the sanitizer. */
    dropped: number;
}

// --- low-level scanning ------------------------------------------------------

/** Index just past the string starting at `i` (quote at text[i]). */
function skipString(text: string, i: number): number {
    const quote = text[i];
    for (let j = i + 1; j < text.length; j++) {
        if (text[j] === '\\') {
            j++;
        } else if (text[j] === quote || text[j] === '\n') {
            return j + 1;
        }
    }
    return text.length;
}

function skipComment(text: string, i: number): number {
    const end = text.indexOf('*/', i + 2);
    return end < 0 ? text.length : end + 2;
}

/** Index of the `}` matching the `{` at `open` (or text.length). */
function matchBrace(text: string, open: number): number {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        const c = text[i];
        if (c === '"' || c === '\'') {
            i = skipString(text, i) - 1;
        } else if (c === '/' && text[i + 1] === '*') {
            i = skipComment(text, i) - 1;
        } else if (c === '{') {
            depth++;
        } else if (c === '}') {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }
    return text.length;
}

export function stripComments(text: string): string {
    let out = '';
    for (let i = 0; i < text.length;) {
        const c = text[i];
        if (c === '"' || c === '\'') {
            const end = skipString(text, i);
            out += text.slice(i, end);
            i = end;
        } else if (c === '/' && text[i + 1] === '*') {
            i = skipComment(text, i);
            out += ' ';
        } else {
            out += c;
            i++;
        }
    }
    return out;
}

/** Split on `sep` at nesting depth 0, outside strings, comments, () and []. */
function splitTopLevel(text: string, sep: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"' || c === '\'') {
            i = skipString(text, i) - 1;
        } else if (c === '/' && text[i + 1] === '*') {
            i = skipComment(text, i) - 1;
        } else if (c === '(' || c === '[') {
            depth++;
        } else if (c === ')' || c === ']') {
            depth = Math.max(0, depth - 1);
        } else if (c === sep && depth === 0) {
            parts.push(text.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(text.slice(start));
    return parts.map((p) => p.trim()).filter(Boolean);
}

function unquote(text: string): string {
    const t = text.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('\'') && t.endsWith('\''))) {
        // CSS string escapes: \\ → \, \" → "
        return t.slice(1, -1).replace(/\\(.)/g, '$1');
    }
    return t;
}

// --- metadata ----------------------------------------------------------------

const META_RX = /\/\*\s*==UserStyle==([\s\S]*?)==\/UserStyle==\s*\*\//;

/** A label: "quoted", 'quoted' or a bare word. Returns [label, rest]. */
function takeLabel(text: string): [string, string] {
    const t = text.trimStart();
    if (t[0] === '"' || t[0] === '\'') {
        const end = skipString(t, 0);
        return [unquote(t.slice(0, end)), t.slice(end)];
    }
    const m = /^(\S+)([\s\S]*)$/.exec(t);
    return m ? [m[1], m[2]] : ['', ''];
}

function jsonish(text: string): any {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

/** Default of a select-like list: the entry marked with `*`, else the first. */
function selectDefault(options: Array<{label: string; value: string}>): string {
    const starred = options.find((o) => o.label.endsWith('*'));
    return (starred || options[0] || {value: ''}).value;
}

function parseSelectOptions(raw: string): Array<{label: string; value: string}> {
    const data = jsonish(raw.trim());
    if (Array.isArray(data)) {
        return data.map((item: string) => {
            const s = String(item);
            const colon = s.indexOf(':');
            const value = (colon >= 0 ? s.slice(0, colon) : s).replace(/\*$/, '');
            const label = colon >= 0 ? s.slice(colon + 1) : s;
            return {label: s.endsWith('*') || label.endsWith('*') ? `${label.replace(/\*$/, '')}*` : label, value};
        });
    }
    if (data && typeof data === 'object') {
        return Object.entries(data).map(([label, value]) => ({label, value: String(value)}));
    }
    // @advanced dropdown { id "Label" <<<EOT … EOT; … } (also image/select)
    const options: Array<{label: string; value: string}> = [];
    const rx = /([\w-]+\*?)\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s+(?:<<<EOT([\s\S]*?)EOT\s*;|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^;\n]*);?)/g;
    for (let m = rx.exec(raw); m; m = rx.exec(raw)) {
        const starred = m[1].endsWith('*') || unquote(m[2]).endsWith('*');
        const value = m[3] !== undefined ? m[3].trim() : unquote(m[4] || '');
        options.push({label: starred ? `${unquote(m[2]).replace(/\*$/, '')}*` : unquote(m[2]), value});
    }
    return options;
}

function varDefault(type: string, raw: string): string {
    const text = raw.trim();
    switch (type) {
        case 'select':
        case 'dropdown':
        case 'image':
            return selectDefault(parseSelectOptions(text.startsWith('{') && !jsonish(text) ? text.slice(1, text.lastIndexOf('}')) : text));
        case 'range':
        case 'number': {
            const data = jsonish(text);
            if (Array.isArray(data)) {
                const unit = data.find((v: unknown, i: number) => i > 0 && typeof v === 'string');
                return `${data[0]}${unit || ''}`;
            }
            return text;
        }
        case 'checkbox':
            return text === '1' || text === 'true' ? '1' : '0';
        default:
            return unquote(text);
    }
}

export function parseMeta(source: string): {meta: UserCSSMeta; body: string} {
    const meta: UserCSSMeta = {name: '', version: '', license: '', namespace: '', preprocessor: 'default', vars: []};
    const match = META_RX.exec(source);
    if (!match) {
        return {meta, body: source};
    }
    const header = match[1];
    const body = source.slice(0, match.index) + source.slice(match.index + match[0].length);
    // split into @key entries (a value may span lines: dropdown blocks)
    const entries = header.split(/\n(?=\s*@[\w-]+)/);
    for (const entry of entries) {
        const m = /^\s*@([\w-]+)\s+([\s\S]*)$/.exec(entry);
        if (!m) {
            continue;
        }
        const [, key, rest] = m;
        if (key === 'var' || key === 'advanced') {
            const vm = /^([\w-]+)\s+([\w-]+)\s+([\s\S]*)$/.exec(rest.trim());
            if (!vm) {
                continue;
            }
            const [, type, name, afterName] = vm;
            const [label, value] = takeLabel(afterName);
            meta.vars.push({type, name, label, value: varDefault(type, value)});
        } else if (key in meta && key !== 'vars') {
            (meta as any)[key] = rest.trim().split('\n')[0].trim();
        }
    }
    return {meta, body};
}

// --- variables ---------------------------------------------------------------

/**
 * Plain CSS for css / default / uso styles; less source with its variables
 * declared on top for less; null for preprocessors we can't run (stylus).
 */
export function resolveVars(body: string, meta: UserCSSMeta): string | null {
    const pre = meta.preprocessor || 'default';
    if (pre === 'uso') {
        const values = new Map(meta.vars.map((v) => [v.name, v.value]));
        return body.replace(/\/\*\[\[([\w-]+)\]\]\*\//g, (whole, name) => (values.has(name) ? values.get(name)! : whole));
    }
    if (pre === 'less') {
        return meta.vars.map((v) => `@${v.name}: ${v.value || '~""'};`).join('\n') + (meta.vars.length ? '\n' : '') + body;
    }
    if (pre === 'default' || pre === 'css') {
        if (!meta.vars.length) {
            return body;
        }
        return `:root {\n${meta.vars.map((v) => `  --${v.name}: ${v.value};`).join('\n')}\n}\n${body}`;
    }
    return null;
}

// --- sections ----------------------------------------------------------------

function parseMatchers(prelude: string): Matcher[] {
    const matchers: Matcher[] = [];
    const rx = /(url-prefix|url|domain|regexp)\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^)]*)\s*\)/g;
    for (let m = rx.exec(prelude); m; m = rx.exec(prelude)) {
        matchers.push({kind: m[1] as MatcherKind, value: unquote(m[2])});
    }
    return matchers;
}

/** The style's `@-moz-document` sections, plus the code outside them (global). */
export function splitSections(css: string): Section[] {
    const sections: Section[] = [];
    let global = '';
    const rx = /@-moz-document\s/g;
    let pos = 0;
    for (let m = rx.exec(css); m; m = rx.exec(css)) {
        if (m.index < pos) {
            continue;
        }
        const open = css.indexOf('{', m.index);
        if (open < 0) {
            break;
        }
        const close = matchBrace(css, open);
        global += css.slice(pos, m.index);
        sections.push({matchers: parseMatchers(css.slice(m.index + m[0].length, open)), css: css.slice(open + 1, close)});
        pos = close + 1;
        rx.lastIndex = pos;
    }
    global += css.slice(pos);
    if (stripComments(global).trim()) {
        sections.unshift({matchers: [], css: global});
    }
    return sections;
}

export function sectionMatches(section: Section, url: string): boolean {
    if (!section.matchers.length) {
        return true;
    }
    let host = '';
    try {
        host = new URL(url).hostname;
    } catch {
        return false;
    }
    return section.matchers.some(({kind, value}) => {
        switch (kind) {
            case 'domain':
                return host === value || host.endsWith(`.${value}`);
            case 'url-prefix':
                return url.startsWith(value);
            case 'url':
                return url === value;
            case 'regexp':
                try {
                    return new RegExp(`^(?:${value})$`).test(url);
                } catch {
                    return false;
                }
            default:
                return false;
        }
    });
}

// --- rules + sanitizer -------------------------------------------------------

const DANGEROUS_PROPERTIES = new Set(['-moz-binding', 'behavior']);

/** True when a value may fetch from the network or run code. data: URIs are fine. */
function isUnsafeValue(value: string): boolean {
    if (/expression\s*\(|javascript:/i.test(value)) {
        return true;
    }
    const rx = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;
    for (let m = rx.exec(value); m; m = rx.exec(value)) {
        if (!/^data:/i.test(m[2].trim())) {
            return true;
        }
    }
    // image-set("…") / src() with bare strings
    return /(image-set|src)\(\s*['"](?!data:)/i.test(value);
}

function parseDeclarations(block: string, counter: {dropped: number}): Declaration[] {
    const declarations: Declaration[] = [];
    for (const part of splitTopLevel(stripComments(block), ';')) {
        const colon = part.indexOf(':');
        if (colon <= 0) {
            continue;
        }
        const property = part.slice(0, colon).trim().toLowerCase();
        let value = part.slice(colon + 1).trim();
        const important = /!\s*important\s*$/i.test(value);
        value = value.replace(/!\s*important\s*$/i, '').trim();
        if (!property || !value || property.includes('{') || property.includes('}')) {
            continue;
        }
        if (DANGEROUS_PROPERTIES.has(property) || isUnsafeValue(value)) {
            counter.dropped++;
            continue;
        }
        declarations.push({property: property.startsWith('--') ? part.slice(0, colon).trim() : property, value, important});
    }
    return declarations;
}

const RECURSE_AT_RULES = /^@(media|supports|document|-moz-document|layer|container)\b/i;

function collectRules(css: string, conditions: string[], out: Rule[], counter: {dropped: number}) {
    const text = stripComments(css);
    let i = 0;
    while (i < text.length) {
        while (i < text.length && /[\s;]/.test(text[i])) {
            i++;
        }
        if (i >= text.length) {
            break;
        }
        // find the end of the prelude: `{` or (for statement at-rules) `;`
        let j = i;
        let open = -1;
        for (; j < text.length; j++) {
            const c = text[j];
            if (c === '"' || c === '\'') {
                j = skipString(text, j) - 1;
            } else if (c === '{') {
                open = j;
                break;
            } else if (c === ';' && text[i] === '@') {
                break;
            } else if (c === '}') {
                break; // stray closer
            }
        }
        const prelude = text.slice(i, open >= 0 ? open : j).trim();
        if (open < 0) {
            if (/^@import\b/i.test(prelude)) {
                counter.dropped++;
            }
            i = j + 1;
            continue;
        }
        const close = matchBrace(text, open);
        const block = text.slice(open + 1, close);
        if (prelude.startsWith('@')) {
            if (RECURSE_AT_RULES.test(prelude)) {
                collectRules(block, conditions.concat(prelude), out, counter);
            }
            // @font-face, @keyframes, @page… carry no selectors to match
        } else if (prelude) {
            const selectors = splitTopLevel(prelude, ',');
            const declarations = parseDeclarations(block, counter);
            if (selectors.length && declarations.length) {
                out.push({selectors, declarations, conditions});
            }
        }
        i = close + 1;
    }
}

export function parseRules(css: string): {rules: Rule[]; dropped: number} {
    const rules: Rule[] = [];
    const counter = {dropped: 0};
    collectRules(css, [], rules, counter);
    return {rules, dropped: counter.dropped};
}

export interface PreparedStyle {
    meta: UserCSSMeta;
    /** Plain CSS (css/default/uso), or the less source with variables (needs: 'less'), or null. */
    code: string | null;
    /** A compile step still needed: 'less' (async, done by the caller), or '' when code is CSS. */
    needs: '' | 'less';
    /** Set when the style can't be used (e.g. 'stylus'). */
    unsupported: string;
}

/** Header + variables resolved; less is left for the caller's (async) compiler. */
export function prepareStyle(source: string): PreparedStyle {
    const {meta, body} = parseMeta(source);
    const code = resolveVars(body, meta);
    if (code === null) {
        return {meta, code, needs: '', unsupported: meta.preprocessor};
    }
    return {meta, code, needs: meta.preprocessor === 'less' ? 'less' : '', unsupported: ''};
}

/** The sanitized rules of the sections of plain CSS that apply to `url`. */
export function rulesForURL(css: string, url: string): {rules: Rule[]; dropped: number} {
    const rules: Rule[] = [];
    let dropped = 0;
    for (const section of splitSections(css)) {
        if (sectionMatches(section, url)) {
            const parsed = parseRules(section.css);
            rules.push(...parsed.rules);
            dropped += parsed.dropped;
        }
    }
    return {rules, dropped};
}

/** Everything a css / default / uso style says about one URL, sanitized (less/stylus: see prepareStyle). */
export function siteRules(source: string, url: string): SiteRules {
    const prepared = prepareStyle(source);
    if (prepared.unsupported || prepared.needs || prepared.code === null) {
        return {meta: prepared.meta, rules: [], unsupported: prepared.unsupported || prepared.needs, dropped: 0};
    }
    return {meta: prepared.meta, ...rulesForURL(prepared.code, url), unsupported: ''};
}
