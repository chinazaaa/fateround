'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type ConfirmOptions = {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type PendingConfirm = ConfirmOptions & {
  resolve: (value: boolean) => void
}

type ConfirmApi = {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmApi | null>(null)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)

  const confirm = useCallback((options: ConfirmOptions | string) => {
    const opts: ConfirmOptions =
      typeof options === 'string' ? { title: options } : options

    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve })
    })
  }, [])

  const close = useCallback((value: boolean) => {
    setPending((current) => {
      current?.resolve(value)
      return null
    })
  }, [])

  useEffect(() => {
    if (!pending) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pending, close])

  const api = useMemo<ConfirmApi>(() => ({ confirm }), [confirm])

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center p-4"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            aria-label="Cancel"
            onClick={() => close(false)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby={pending.message ? 'confirm-dialog-message' : undefined}
            className="relative w-full max-w-sm glass-card border border-[var(--border-strong)] rounded-2xl p-5 shadow-xl space-y-4 animate-[slide-up_0.2s_cubic-bezier(0.16,1,0.3,1)]"
          >
            <div className="space-y-1 text-center">
              <p id="confirm-dialog-title" className="font-semibold text-body leading-snug">
                {pending.title}
              </p>
              {pending.message && (
                <p id="confirm-dialog-message" className="text-muted text-sm leading-relaxed">
                  {pending.message}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="btn-secondary flex-1 py-2.5"
              >
                {pending.cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => close(true)}
                className={
                  pending.destructive
                    ? 'flex-1 py-2.5 rounded-xl font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors'
                    : 'btn-primary flex-1 py-2.5'
                }
              >
                {pending.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmApi {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmProvider')
  }
  return ctx
}
