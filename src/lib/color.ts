/** Converts #rgb or #rrggbb hex to rgba() for canvas / html-to-image compatibility. */
export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized.slice(0, 6)

  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)

  if ([r, g, b].some((n) => Number.isNaN(n))) {
    return `rgba(0, 0, 0, ${alpha})`
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
