'use client'
import { Modal } from '@/components/ui/Modal'
import { formatTemplateSavedAt, summarizeTemplate, type GameTemplate } from '@/lib/game-templates'

interface UseTemplateConfirmModalProps {
  /** The template pending confirmation, or null when the modal should be closed. */
  template: GameTemplate | null
  onCancel: () => void
  onConfirm: () => void
}

/** Confirms before "Use & create" fires, since that action skips straight to creating the game. */
export function UseTemplateConfirmModal({ template, onCancel, onConfirm }: UseTemplateConfirmModalProps) {
  return (
    <Modal open={!!template} onClose={onCancel} title="Create with this template?">
      {template && (
        <div className="space-y-4">
          <div className="surface-inset px-4 py-3">
            <p className="font-medium text-sm">{template.name}</p>
            <p className="text-faint text-xs mt-0.5">
              {summarizeTemplate(template.values)} · saved {formatTemplateSavedAt(template.savedAt)}
            </p>
          </div>
          <p className="text-muted text-sm">
            This creates the game immediately with these settings — you won&apos;t get a chance to review them first.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="btn-secondary flex-1 py-2.5">
              Cancel
            </button>
            <button type="button" onClick={onConfirm} className="btn-primary flex-1">
              Create game
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
