import type { IconSvgElement } from '@hugeicons/react'
import { HugeiconsIcon } from '@hugeicons/react'

type Props = {
  /** An icon from `@hugeicons/core-free-icons`, or one of our own in the same shape. */
  icon: IconSvgElement
  /** Rendered size in px for both axes. */
  size?: number
  /**
   * Set for icons whose art carries its own `fill` values (the Naija flag in
   * `theme-icon-art.ts`). `HugeiconsIcon` spreads its stroke props *after* each
   * element's own attributes, so passing a stroke width would paint
   * `currentColor` over every filled band. Omitting it lets the art's own fills
   * and strokes through untouched.
   */
  filled?: boolean
  className?: string
}

/**
 * Renders a Hugeicons glyph with the marketing design system's defaults.
 *
 * The free Hugeicons set is stroke-only, so depth comes from the `.fr-glyph`
 * plate around it (`fate-round-ds.css`), not from the icon art. Going through
 * this wrapper keeps stroke weight and colour inheritance identical everywhere
 * instead of each call site picking its own.
 */
export function Glyph({ icon, size = 24, filled = false, className }: Props) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      color="currentColor"
      strokeWidth={filled ? undefined : 1.8}
      className={className}
      aria-hidden
    />
  )
}
