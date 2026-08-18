/**
 * A single shimmering placeholder block.
 *
 * Used by route-level `loading.tsx` files and in-component loading states so a click always gets
 * immediate visual acknowledgement — the App Router shows nothing on its own between a navigation
 * and the server finishing, which reads as a frozen click. `--border` is defined in both the app
 * and `.fr-site` (marketing) scopes, so the same block works on either surface.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-[var(--border)] ${className}`} />
}
