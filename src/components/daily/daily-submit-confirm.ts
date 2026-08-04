import type { ConfirmOptions } from '@/components/ui/ConfirmDialog'

// A daily challenge is a single scored attempt, so the manual "Submit" button ends the game for
// good. Guard it with a confirmation (auto-submit on time-up stays unconfirmed — it isn't a choice).
export const DAILY_SUBMIT_CONFIRM: ConfirmOptions = {
  title: 'Submit and end your attempt?',
  message: "You only get one attempt at today's challenge — you can't change your answers after this.",
  confirmLabel: 'Submit',
  cancelLabel: 'Keep playing',
}
