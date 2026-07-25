'use client'

import { useEffect, useState } from 'react'
import { getPlayerSession } from '@/lib/utils'
import { isIos, isStandalone, pushSupported } from '@/lib/push-client'

const dismissKey = (gameCode: string) => `push_ios_nudge_dismissed_${gameCode}`

/**
 * iOS-only nudge to install the PWA so push can work.
 *
 * On iPhone/iPad, web push is delivered only from a home-screen-installed PWA
 * (iOS 16.4+), and there's no API to trigger "Add to Home Screen" — so this is a
 * one-time instructional card. It's the counterpart to NotificationToggle: the header
 * bell hides on un-installed iOS (no push capability), this one fills the gap. They're
 * mutually exclusive, so only ever one shows.
 */
export function IosInstallPushNudge({ gameCode }: { gameCode: string }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return
    if (!isIos() || isStandalone()) return // only un-installed iOS
    if (pushSupported()) return // already installed + push-capable — nothing to nudge
    if (localStorage.getItem(dismissKey(gameCode))) return
    if (!getPlayerSession(gameCode)?.resumeToken) return
    setVisible(true)
  }, [gameCode])

  if (!visible) return null

  const dismiss = () => {
    localStorage.setItem(dismissKey(gameCode), '1')
    setVisible(false)
  }

  return (
    <div className="fixed bottom-3 right-3 z-50 max-w-xs">
      <div className="glass-card-strong flex flex-col gap-2 px-4 py-3">
        <p className="text-xs text-body">
          📲 Want a heads-up when the game starts? On iPhone, add FateRound to your Home Screen first: tap the{' '}
          <strong>Share</strong> icon (the square with an up arrow), choose <strong>Add to Home Screen</strong>, then
          open FateRound from there to turn on alerts.
        </p>
        <button type="button" onClick={dismiss} className="btn-secondary btn-fit self-end text-[11px]">
          Got it
        </button>
      </div>
    </div>
  )
}
