import {candidatesForHost, categoryMatchesHost, slimIndex} from '../../../src/utils/style-index';

const NOW = Date.UTC(2026, 10, 1) / 1000;

describe('style index', () => {
    it('slims the userstyles.world index (ms timestamps become seconds)', () => {
        const slim = slimIndex({data: [
            {i: 1, n: 'GitHub Dark', c: 'GitHub', w: 50, u: NOW * 1000, sn: 'x.png', an: 'a'},
            {i: 'bad', n: 'x', c: 'y'},
        ]});
        expect(slim).toEqual([[1, 'GitHub Dark', 'github', 50, NOW]]);
    });

    it('matches categories the way Stylus does', () => {
        expect(categoryMatchesHost('github', 'gist.github.com')).toBe(true);
        expect(categoryMatchesHost('github.com', 'gist.github.com')).toBe(true);
        expect(categoryMatchesHost('wikipedia', 'en.wikipedia.org')).toBe(true);
        expect(categoryMatchesHost('git', 'github.com')).toBe(false);
        expect(categoryMatchesHost('hub.com', 'github.com')).toBe(false);
    });

    it('picks recent dark styles for the host, most installed first', () => {
        const index = slimIndex({data: [
            {i: 1, n: 'Wikipedia Dark', c: 'wikipedia', w: 5, u: NOW},
            {i: 2, n: 'Wikipedia Catppuccin', c: 'wikipedia', w: 50, u: NOW},
            {i: 3, n: 'Wikipedia Sans Font', c: 'wikipedia', w: 99, u: NOW},
            {i: 4, n: 'Wikipedia Night', c: 'wikipedia', w: 80, u: Date.UTC(2019, 0, 1) / 1000},
            {i: 5, n: 'GitHub Dark', c: 'github', w: 500, u: NOW},
        ]});
        expect(candidatesForHost(index, 'en.wikipedia.org').map((e) => e[0])).toEqual([2, 1]);
    });
});
