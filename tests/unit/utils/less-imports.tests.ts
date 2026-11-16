import {createRequire} from 'node:module';

import {createImportPlugin, inlineAllowedCSSImports, isAllowedImportURL, resolveImportURL} from '../../../src/utils/less-imports';
import {prepareStyle, rulesForURL} from '../../../src/utils/usercss';

// the node build of the same compiler the extension ships (dist/less.min.js)
const less = createRequire(__filename)('less');

describe('LESS imports: allowlist', () => {
    it('allows https from the hosts style authors use, nothing else', () => {
        expect(isAllowedImportURL('https://userstyles.catppuccin.com/lib/lib.less')).toBe(true);
        expect(isAllowedImportURL('https://raw.githubusercontent.com/a/b/main/lib.less')).toBe(true);
        expect(isAllowedImportURL('http://userstyles.catppuccin.com/lib/lib.less')).toBe(false);
        expect(isAllowedImportURL('https://evil.example/lib.less')).toBe(false);
        expect(isAllowedImportURL('https://catppuccin.com.evil.example/lib.less')).toBe(false);
        expect(isAllowedImportURL('https://user:pw@cdn.jsdelivr.net/x.less')).toBe(false);
    });

    it('resolves relative and extension-less imports against the importing file', () => {
        expect(resolveImportURL('lib', 'https://userstyles.catppuccin.com/lib/')).toBe('https://userstyles.catppuccin.com/lib/lib.less');
        expect(resolveImportURL('../x/mixins.less', 'https://cdn.jsdelivr.net/gh/a/b/lib/')).toBe('https://cdn.jsdelivr.net/gh/a/b/x/mixins.less');
        expect(resolveImportURL('local.less', 'moz-extension://abc/background/')).toBeNull();
    });

    it('inlines plain CSS imports only from allowed hosts', () => {
        const src = '@import url("https://python.catppuccin.com/vars.css");\n@import url("https://fonts.example/font.css");';
        expect(inlineAllowedCSSImports(src)).toBe('@import (inline) "https://python.catppuccin.com/vars.css";\n@import url("https://fonts.example/font.css");');
    });
});

describe('LESS compile with the import plugin', () => {
    const LIB = 'https://userstyles.catppuccin.com/lib/lib.less';
    const fetched: string[] = [];
    const fetchText = async (url: string) => {
        fetched.push(url);
        if (url === LIB) {
            return '@base: #1e1e2e; .dark(@c) { background-color: @c !important; }';
        }
        throw new Error('404');
    };

    it('compiles a usercss-style LESS source with a remote library and its variables', async () => {
        const source = `/* ==UserStyle==
@name        Example Catppuccin
@preprocessor less
@var color   accent "Accent" #cba6f7
==/UserStyle== */
@import "${LIB}";
@-moz-document domain("example.com") {
    .page { .dark(@base); color: @accent; }
}`;
        const prepared = prepareStyle(source);
        expect(prepared.needs).toBe('less');
        const {css} = await less.render(prepared.code, {math: 'always', plugins: [createImportPlugin(less, fetchText)]});
        expect(fetched).toEqual([LIB]);
        const {rules} = rulesForURL(css, 'https://example.com/');
        expect(rules[0].declarations).toEqual([
            {property: 'background-color', value: '#1e1e2e', important: true},
            {property: 'color', value: '#cba6f7', important: false},
        ]);
    });

    it('refuses imports outside the allowlist (the compile fails, the style is skipped)', async () => {
        await expect(less.render('@import "https://evil.example/x.less";', {plugins: [createImportPlugin(less, fetchText)]}))
            .rejects.toMatchObject({message: expect.stringContaining('import not allowed')});
    });
});
