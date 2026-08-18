'use client'

/**
 * SubscribeHomeBanner — dismissible nudge above the "Live games" strip.
 *
 * Appears from the visitor's 2nd page view onward (localStorage-counted).
 * iOS Safari not-yet-installed swaps the copy to state the PWA install
 * prerequisite up front.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { isIos, isStandalone } from '@/lib/push-client'

const DISMISS_KEY = 'fr:subscribe-banner-dismissed'
const OPEN_COUNT_KEY = 'fr:visit-count'

export function SubscribeHomeBanner() {
  const [visible, setVisible] = useState(false)
  const [copy, setCopy] = useState<'default' | 'ios-install'>('default')

  useEffect(() => {
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === '1') return
      const raw = window.localStorage.getItem(OPEN_COUNT_KEY)
      const next = Math.min((Number(raw) || 0) + 1, 99)
      window.localStorage.setItem(OPEN_COUNT_KEY, String(next))
      if (next < 2) return
    } catch {
      return
    }
    setVisible(true)
    if (isIos() && !isStandalone()) setCopy('ios-install')
  }, [])

  const onDismiss = useCallback(() => {
    setVisible(false)
    try {
      window.localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Best-effort.
    }
  }, [])

  if (!visible) return null

  return (
    <section className="fr-band fr-band--tight">
      <div className="mk-wrap">
        <div className="glass-card relative flex items-center gap-3 !p-3">
          <div className="min-w-0 flex-1">
            <Link href="/notifications" className="block">
              <p className="text-sm font-bold text-body">
                🔔 Get pinged when your favourite games open
                {copy === 'ios-install' ? (
                  <span className="ml-1 text-muted font-normal">— Add to Home Screen, then</span>
                ) : null}
              </p>
              <p className="mt-0.5 text-xs font-semibold" style={{ color: 'var(--primary)' }}>
                Subscribe →
              </p>
            </Link>
          </div>
          <button type="button" onClick={onDismiss} aria-label="Dismiss" className="text-xl text-muted hover:text-body">
            ×
          </button>
        </div>
      </div>
    </section>
  )
}
