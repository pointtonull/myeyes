/**
 * MyEyes! community style index (userstyles.world) — pure helpers
 * (tests: tests/unit/utils/style-index.tests.ts). The background fetches
 * `https://userstyles.world/api/index/uso-format` (~4 MB, the same index
 * Stylus' "Find styles" uses), keeps a slim copy, and asks for candidates.
 */

/** [id, name, category, weeklyInstalls, updated (unix seconds)] */
export type IndexEntry = [number, string, string, number, number];

export const USW_INDEX_URL = 'https://userstyles.world/api/index/uso-format';
export const uswStyleURL = (id: number | string): string => `https://userstyles.world/api/style/${id}.user.css`;

const DARK_NAME = /dark|night|black|midnight|dim|amoled|oled|noir|dracula|nord|gruvbox|catppuccin|solarized|tokyo/i;

/** Keep only what candidate picking needs (the raw index entries carry screenshots, authors…). */
export function slimIndex(raw: any): IndexEntry[] {
    const rows = Array.isArray(raw) ? raw : raw && Array.isArray(raw.data) ? raw.data : [];
    return rows
        .filter((r: any) => r && Number.isFinite(r.i) && typeof r.c === 'string' && typeof r.n === 'string')
        .map((r: any): IndexEntry => {
            const updated = Number(r.u) || 0;
            return [r.i, r.n, r.c.toLowerCase(), Number(r.w) || 0, updated > 1e11 ? Math.round(updated / 1000) : updated];
        });
}

/** A style category names this host: "github.com" matches *.github.com; "github" matches any *.github.*. */
export function categoryMatchesHost(category: string, host: string): boolean {
    const c = category.toLowerCase();
    if (!c) {
        return false;
    }
    const h = `.${host.toLowerCase()}.`;
    return c.includes('.') ? h.endsWith(`.${c}.`) : h.includes(`.${c}.`);
}

/** The styles worth trying for a host: dark ones, updated recently, most installed first. */
export function candidatesForHost(index: IndexEntry[], host: string, {limit = 8, sinceYear = 2023} = {}): IndexEntry[] {
    const since = Date.UTC(sinceYear, 0, 1) / 1000;
    return index
        .filter(([, name, category, , updated]) => updated >= since && DARK_NAME.test(name) && categoryMatchesHost(category, host))
        .sort((a, b) => b[3] - a[3])
        .slice(0, limit);
}
