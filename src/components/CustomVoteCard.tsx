'use client'
import type { Participant, CustomSlot } from '@/types'
import { Avatar } from '@/components/Avatar'

interface CustomVoteCardProps {
  participants: Participant[]
  slots: CustomSlot[]
  assignments: Record<string, string>
  onAssign: (participantId: string, slotKey: string) => void
  disabled?: boolean
  disabledSlotKeys?: string[]
  getDisabledSlotKeys?: (participantId: string) => string[]
}

export function CustomVoteCard({
  participants,
  slots,
  assignments,
  onAssign,
  disabled,
  disabledSlotKeys = [],
  getDisabledSlotKeys,
}: CustomVoteCardProps) {
  const nameById = new Map(participants.map((p) => [p.id, p.name]))

  return (
    <div className="space-y-3">
      {participants.map((p) => {
        const currentSlot = assignments[p.id]
        return (
          <div key={p.id} className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <Avatar name={p.name} photoUrl={p.photo_url} />
              <div className="min-w-0 flex-1">
                <p className="text-body font-bold text-lg leading-tight truncate">{p.name}</p>
                {currentSlot &&
                  (() => {
                    const slot = slots.find((s) => s.key === currentSlot)
                    return slot ? (
                      <p className="text-xs mt-0.5" style={{ color: slot.color }}>
                        {slot.emoji} {slot.label}
                      </p>
                    ) : null
                  })()}
              </div>
            </div>
            <div className="flex gap-1.5">
              {slots.map((slot) => {
                const isActive = currentSlot === slot.key
                const perParticipantDisabled = getDisabledSlotKeys?.(p.id) ?? disabledSlotKeys
                const isDisabled = perParticipantDisabled.includes(slot.key)
                const holderId = Object.entries(assignments).find(
                  ([id, key]) => key === slot.key && id !== p.id
                )?.[0]
                const holderName = holderId ? nameById.get(holderId) : null
                const usedByOther = !!holderName
                return (
                  <button
                    key={slot.key}
                    type="button"
                    onClick={() => onAssign(p.id, slot.key)}
                    disabled={disabled || isDisabled}
                    title={
                      usedByOther && !isActive
                        ? `Swap with ${holderName} — they’ll get your current pick`
                        : isActive
                          ? 'Tap again to clear'
                          : undefined
                    }
                    className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                      isActive
                        ? 'text-white'
                        : 'surface-inset border-theme text-muted hover:border-theme-strong hover:text-body-muted'
                    }`}
                    style={
                      isActive
                        ? { backgroundColor: `${slot.color}30`, borderColor: `${slot.color}80`, color: slot.color }
                        : undefined
                    }
                  >
                    {slot.emoji} {slot.label}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
