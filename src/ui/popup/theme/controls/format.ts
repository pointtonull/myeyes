export function formatPercent(v: number): string {
    return `${v}%`;
}

export function formatDegrees(v: number): string {
    return `${v < 0 ? '−' : ''}${Math.abs(v)}°`;
}
