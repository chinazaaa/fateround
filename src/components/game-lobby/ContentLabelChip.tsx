function TagIcon({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 opacity-80"
      aria-hidden="true"
    >
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )
}

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
      className={`inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-[var(--surface-inset-bg)] px-2.5 py-0.5 text-[11px] font-bold text-muted ${className}`}
      title={text}
    >
      <TagIcon size={10} />
      <span className="truncate">{text}</span>
    </span>
  )
}
