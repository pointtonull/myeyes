import {m} from 'malevic';

// Inline SVG icons for the MyEyes! pane (see brand/reference/popup-mockup.png).
// Stroke-based, currentColor, so CSS controls color/glow per context.

function svg(children: any, opts: {fill?: boolean} = {}) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill={opts.fill ? 'currentColor' : 'none'}
            stroke={opts.fill ? 'none' : 'currentColor'}
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
        >{children}</svg>
    );
}

export const CodeIcon = () => svg([
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />,
    <path d="M9.5 10l-2 2 2 2" />,
    <path d="M14.5 10l2 2-2 2" />,
    // the little yellow sparkle from the mockup's Dynamic card
    <path d="M19.5 1l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" fill="#fbbf24" stroke="none" />,
]);

export const ChevronIcon = () => svg(
    <path d="M6 9.5l6 6 6-6" stroke-width="2.6" />,
);

export const FilterIcon = () => svg([
    <circle cx="9.5" cy="10" r="4.5" fill="#c084fc" opacity="0.8" />,
    <circle cx="14.5" cy="10" r="4.5" fill="#818cf8" opacity="0.8" />,
    <circle cx="12" cy="14.5" r="4.5" fill="#60a5fa" opacity="0.8" />,
], {fill: true});

export const SlidersIcon = () => svg([
    <line x1="4" y1="8.5" x2="20" y2="8.5" />,
    <circle cx="9" cy="8.5" r="2.3" fill="currentColor" />,
    <line x1="4" y1="15.5" x2="20" y2="15.5" />,
    <circle cx="15" cy="15.5" r="2.3" fill="currentColor" />,
]);

export const LayersIcon = () => svg([
    <path d="M12 3l9 5-9 5-9-5 9-5z" />,
    <path d="M3 13l9 5 9-5" />,
]);

export const SunIcon = () => svg([
    <circle cx="12" cy="12" r="4" />,
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />,
]);

export const ContrastIcon = () => svg([
    <circle cx="12" cy="12" r="8.5" />,
    <path d="M12 3.5a8.5 8.5 0 010 17z" fill="currentColor" stroke="none" />,
]);

export const DropletIcon = () => svg(
    <path d="M12 3.5s6 5.8 6 9.8a6 6 0 11-12 0c0-4 6-9.8 6-9.8z" />,
);

export const LeafIcon = () => svg([
    <path d="M5 19c0-8.5 6.3-14 14-14 0 8.5-6.3 14-14 14z" />,
    <path d="M5 19l9-9" />,
]);

export const SparklesIcon = () => svg([
    <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />,
    <path d="M18.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />,
], {fill: true});

export const BroomIcon = () => svg([
    <path d="M14.5 4.5l5 5" />,
    <path d="M17 7l-7.5 7.5" />,
    <path d="M9.5 14.5L5 19v0l4.5-1 5-5z" />,
    <path d="M4.5 19.5l1-1M7 20l1-1M9.5 20.5l1-1" />,
]);

export const GearIcon = () => svg([
    <circle cx="12" cy="12" r="3.2" />,
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.1 5.1l2.1 2.1M16.8 16.8l2.1 2.1M18.9 5.1l-2.1 2.1M7.2 16.8l-2.1 2.1" />,
]);

// Happy glasses (enabled) — smiling eyes, brand blue->purple->pink gradient.
export const GlassesHappy = () => (
    <svg viewBox="0 0 128 72" fill="none" stroke="url(#me-glasses-grad)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
        <defs>
            <linearGradient id="me-glasses-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="#38bdf8" />
                <stop offset="0.55" stop-color="#7c6cf0" />
                <stop offset="1" stop-color="#e879f9" />
            </linearGradient>
        </defs>
        <path d="M8 18 L1 11" /><path d="M120 18 L127 11" />
        <path d="M54 20 Q64 10 74 20" />
        <rect x="8" y="6" width="46" height="46" rx="16" />
        <rect x="74" y="6" width="46" height="46" rx="16" />
        <path d="M22 26 Q31 38 40 26" /><path d="M88 26 Q97 38 106 26" />
    </svg>
);

// Squinting glasses (disabled) — > < eyes.
export const GlassesSquint = () => (
    <svg viewBox="0 0 128 72" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 18 L1 11" /><path d="M120 18 L127 11" />
        <path d="M54 20 Q64 10 74 20" />
        <rect x="8" y="6" width="46" height="46" rx="16" />
        <rect x="74" y="6" width="46" height="46" rx="16" />
        <path d="M24 24 L34 29 L24 34" /><path d="M104 24 L94 29 L104 34" />
    </svg>
);
