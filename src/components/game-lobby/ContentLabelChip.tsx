'use client'

/**
 * Compact pill showing a game's host-set content label ("Maths", "Bible trivia") —
 * the subject of a CSV/library content pack. Rendered next to the room name on the
 * join, gameplay, and finished screens so players know what they're playing.
 * Renders nothing when there's no label.
 */
export function ContentLabelChip({ label, className = '' }: { label?: string | null; className?: string }) {
  const text = label?.trim()
  if (!text) return null
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 truncate rounded-full bg-[var(--surface-inset-bg)] px-2.5 py-0.5 text-[11px] font-bold text-muted ${className}`}
      title={text}
    >
      <span aria-hidden>🏷️</span>
      <span className="truncate">{text}</span>
    </span>
  )
}
