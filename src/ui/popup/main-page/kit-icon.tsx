import {m} from 'malevic';

// Icons from the MyEyes! UI kit (brand/ui-kit/icons), shipped as SVG files in
// src/ui/assets/images/myeyes/icons/. Loaded as <img> rather than inlined:
// every kit SVG defines the same gradient ids ("g", "p"), which would collide
// in one document. The kit's own colours are kept as designed.
export type KitIconName = (
    'ai-enhance' | 'brightness' | 'check' | 'chevron-down' | 'clean-up' |
    'contrast' | 'custom' | 'dynamic' | 'filter-plus' | 'heart-puzzle' |
    'home' | 'mode-ai' | 'mode-disabled' | 'mode-enabled' | 'reset' |
    'saturation' | 'sepia' | 'theme'
);

export function KitIcon(props: {name: KitIconName}) {
    return (
        <img
            class="me-icon"
            src={`../assets/images/myeyes/icons/${props.name}.svg`}
            alt=""
            draggable="false"
        />
    );
}
