'use client'

import type { GameType } from '@/types'
import type { Participant } from '@/types'
import { slotMeta, voteSlots } from '@/lib/game-types'
import type { VoteSlot } from '@/lib/game-types'

function PlaceholderSilhouette({ name }: { name: string }) {
  return (
    <div className="w-full aspect-[3/4] rounded-xl bg-[var(--surface-inset-bg)] flex flex-col items-center justify-center gap-2">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
        className="w-16 h-16 text-[var(--border-strong)]"
        aria-hidden="true"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
      </svg>
      <span className="text-faint text-xs uppercase tracking-wider" role="img" aria-label={`No photo for ${name}`}>
        {name}
      </span>
    </div>
  )
}

export function ParticipantPhotoCard({
  gameType,
  participant,
  action,
  onAssign,
  disabled,
  disabledSlots = [],
}: {
  gameType: GameType
  participant: Participant
  action: VoteSlot | null
  onAssign: (a: VoteSlot) => void
  disabled: boolean
  disabledSlots?: VoteSlot[]
}) {
  const cfg = action ? slotMeta(gameType, action) : null

  return (
    <div
      className={`rounded-2xl border-2 overflow-hidden transition-all backdrop-blur-sm ${
        cfg ? cfg.borderClass : 'glass-card border-theme'
      }`}
    >
      {/* Photo */}
      {participant.photo_url ? (
        <div className="w-full aspect-[3/4] overflow-hidden">
          <img
            src={participant.photo_url}
            alt={participant.name}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <PlaceholderSilhouette name={participant.name} />
      )}

      {/* Name + assignment label */}
      <div className="px-3 pt-2.5 pb-1">
        <p className="font-bold text-body text-base leading-tight text-center truncate">{participant.name}</p>
        {action && cfg && (
          <p className="text-xs font-medium text-center mt-0.5" style={{ color: cfg.textColor }}>
            {cfg.emoji} {cfg.label}
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-1.5 px-3 pb-3 pt-1">
        {voteSlots(gameType).map((a) => {
          const slot = slotMeta(gameType, a)
          const slotDisabled = disabled || disabledSlots.includes(a)
          return (
            <button
              key={a}
              onClick={() => onAssign(a)}
              disabled={slotDisabled}
              aria-label={`${slot.label} ${participant.name}`}
              className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                action === a
                  ? slot.activeClass
                  : `surface-inset border-theme text-muted ${!slotDisabled ? 'hover:border-theme-strong hover:text-body-muted' : ''}`
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              <span className="sm:hidden">{slot.emoji}</span>
              <span className="hidden sm:inline">
                {slot.emoji} {slot.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
