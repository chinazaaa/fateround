'use client'

export function ViewerModeBanner({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-xl border border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] px-4 py-3 text-center text-sm text-body ${className}`}
    >
      <p className="font-semibold">Spectating</p>
      <p className="text-muted text-xs mt-1">You joined after the game started — watch only until the next lobby.</p>
    </div>
  )
}
