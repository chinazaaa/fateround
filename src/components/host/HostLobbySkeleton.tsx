'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * Branded loading placeholder for the host lobby — a shimmer of the lobby's shape so a
 * reload feels instant instead of showing a bare spinner. Sets `data-host-lobby="active"`
 * (like the real HostLobby) so the app header + fixed theme toggle stay hidden through the
 * load, giving a seamless skeleton → lobby transition.
 */
export function HostLobbySkeleton() {
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-host-lobby', 'active')
    return () => root.removeAttribute('data-host-lobby')
  }, [])

  const block = 'rounded-2xl bg-[var(--surface-inset-bg)]'

  return createPortal(
    <div className="fixed inset-0 z-40 flex flex-col bg-[var(--background)]">
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="mx-auto w-full max-w-xl px-4 pt-6 pb-6 sm:px-6 space-y-5 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="h-8 w-28 rounded-lg bg-[var(--surface-inset-bg)]" />
            <div className="h-9 w-36 rounded-full bg-[var(--surface-inset-bg)]" />
          </div>
          <div className="h-4 w-24 rounded bg-[var(--surface-inset-bg)]" />
          <div className="h-9 w-52 rounded-lg bg-[var(--surface-inset-bg)]" />
          <div className={`h-16 ${block}`} />
          <div className={`h-24 ${block}`} />
          <div className={`h-40 ${block}`} />
          <div className={`h-28 ${block}`} />
        </div>
      </div>
      <div className="border-t border-[var(--border)] p-4">
        <div className="mx-auto h-12 max-w-xl rounded-xl bg-[var(--surface-inset-bg)] animate-pulse sm:px-6" />
      </div>
    </div>,
    document.body
  )
}
