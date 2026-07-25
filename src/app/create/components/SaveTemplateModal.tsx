'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import {
  MAX_TEMPLATE_SLOTS,
  firstFreeSlot,
  slotLabel,
  summarizeTemplate,
  type TemplateSlots,
} from '@/lib/game-templates'

interface SaveTemplateModalProps {
  open: boolean
  slots: TemplateSlots
  /** Set when opened via a slot's "Override this slot" action — skips the picker step. */
  presetSlot: number | null
  onClose: () => void
  onConfirm: (slot: number, name: string) => void
}

/**
 * Shared save flow for both the top quick-start row (override an existing slot)
 * and the bottom "Save current settings" button (auto-picks a free slot, or asks
 * which one to replace when both are full).
 */
export function SaveTemplateModal({ open, slots, presetSlot, onClose, onConfirm }: SaveTemplateModalProps) {
  const [chosenSlot, setChosenSlot] = useState<number | null>(null)
  const [nameInput, setNameInput] = useState('')

  useEffect(() => {
    if (!open) return
    const target = presetSlot ?? firstFreeSlot(slots)
    setChosenSlot(target)
    setNameInput(target !== null ? (slots[target]?.name ?? slotLabel(target)) : '')
  }, [open, presetSlot, slots])

  return (
    <Modal open={open} onClose={onClose} title={chosenSlot !== null ? 'Save as template' : 'Both slots are full'}>
      {chosenSlot !== null ? (
        <div className="space-y-4">
          <div>
            <label className="text-muted text-sm font-medium mb-2 block">Template name (optional)</label>
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={slotLabel(chosenSlot)}
              maxLength={30}
              className="input-field w-full"
              autoFocus
            />
          </div>
          <button
            type="button"
            onClick={() => onConfirm(chosenSlot, nameInput.trim() || slotLabel(chosenSlot))}
            className="btn-primary w-full"
          >
            Save to {slotLabel(chosenSlot)}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-muted text-sm">Pick a slot to replace, or cancel.</p>
          <div className="space-y-2">
            {Array.from({ length: MAX_TEMPLATE_SLOTS }, (_, i) => i).map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setChosenSlot(i)
                  setNameInput(slots[i]?.name ?? slotLabel(i))
                }}
                className="surface-inset w-full text-left px-4 py-3 hover:border-[var(--border-strong)] transition-colors"
              >
                <p className="font-medium text-sm">{slots[i]?.name ?? slotLabel(i)}</p>
                {slots[i] && <p className="text-faint text-xs mt-0.5">{summarizeTemplate(slots[i]!.values)}</p>}
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
