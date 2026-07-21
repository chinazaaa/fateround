'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

type ToastKind = 'success' | 'error' | 'info'

type ToastItem = {
  id: number
  message: string
  kind: ToastKind
}

type ToastApi = {
  toast: (message: string, kind?: ToastKind, durationMs?: number) => void
  success: (message: string, durationMs?: number) => void
  error: (message: string, durationMs?: number) => void
  info: (message: string, durationMs?: number) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const kindStyles: Record<ToastKind, string> = {
  success: 'border-emerald-500/60 bg-[var(--card-strong)] shadow-[0_0_15px_rgba(16,185,129,0.3)]',
  error: 'border-red-500/60 bg-[var(--card-strong)] shadow-[0_0_15px_rgba(239,68,68,0.3)]',
  info: 'border-[var(--border-strong)] bg-[var(--card-strong)] shadow-[0_0_15px_var(--shadow-color,rgba(150,150,150,0.15))]',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextIdRef = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, kind: ToastKind = 'info', durationMs = 3200) => {
      const id = nextIdRef.current++
      setToasts((prev) => [...prev.slice(-2), { id, message, kind }])
      window.setTimeout(() => dismiss(id), durationMs)
    },
    [dismiss]
  )

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (message, durationMs) => toast(message, 'success', durationMs),
      error: (message, durationMs) => toast(message, 'error', durationMs),
      info: (message, durationMs) => toast(message, 'info', durationMs),
    }),
    [toast]
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="fixed top-[4.5rem] left-1/2 z-[200] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4 pointer-events-none"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            role="status"
            className={`pointer-events-auto flex max-w-full items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-md animate-slide-down ${kindStyles[item.kind]}`}
          >
            <p className="text-sm font-medium text-body leading-snug">{item.message}</p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}
