'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

type ToastKind = 'success' | 'error' | 'info'

type ToastItem = {
  id: number
  message: string
  kind: ToastKind
}

type ToastApi = {
  toast: (message: string, kind?: ToastKind) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const kindStyles: Record<ToastKind, string> = {
  success: 'border-emerald-500/35 bg-[var(--card-strong)]',
  error: 'border-red-500/35 bg-[var(--card-strong)]',
  info: 'border-[var(--border-strong)] bg-[var(--card-strong)]',
}

const kindIcons: Record<ToastKind, string> = {
  success: '✓',
  error: '!',
  info: 'ℹ',
}

const kindIconColors: Record<ToastKind, string> = {
  success: 'text-emerald-600',
  error: 'text-red-500',
  info: 'text-[var(--primary)]',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = Date.now() + Math.floor(Math.random() * 1000)
      setToasts((prev) => [...prev.slice(-2), { id, message, kind }])
      window.setTimeout(() => dismiss(id), 3200)
    },
    [dismiss]
  )

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (message) => toast(message, 'success'),
      error: (message) => toast(message, 'error'),
      info: (message) => toast(message, 'info'),
    }),
    [toast]
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="fixed bottom-5 left-1/2 z-[200] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 pointer-events-none"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-md animate-[slide-up_0.25s_cubic-bezier(0.16,1,0.3,1)] ${kindStyles[item.kind]}`}
          >
            <span className={`text-sm font-bold mt-0.5 shrink-0 ${kindIconColors[item.kind]}`}>
              {kindIcons[item.kind]}
            </span>
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
