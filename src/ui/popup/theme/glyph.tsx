import {m} from 'malevic';

// Stroke icons for the Advanced Tweaks page (src/ui/assets/images/myeyes/glyphs).
// Drawn with `currentColor` and applied as a CSS mask (theme/page/glyph.less),
// so each place can tint them; <img> would render them black.
export type GlyphName = (
    'adjustments' | 'back' | 'brightness' | 'chevron-down' | 'chevron-up' |
    'colors' | 'contrast' | 'dropper' | 'font' | 'grayscale' | 'layers' |
    'mode' | 'reset' | 'scheme' | 'sepia'
);

export function Glyph(props: {name: GlyphName; class?: string}) {
    return (
        <span
            class={['me-glyph', `me-glyph--${props.name}`, props.class]}
            aria-hidden="true"
        />
    );
}
