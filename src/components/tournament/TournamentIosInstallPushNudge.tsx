'use client'

import { useEffect, useState } from 'react'
import { isIos, isStandalone, pushSupported } from '@/lib/push-client'

const dismissKey = (tournamentCode: string) => `tournament_ios_nudge_dismissed_${tournamentCode}`

/**
 * iOS-only nudge to install the PWA so tournament push reminders can work.
 * Parallel to IosInstallPushNudge but scoped to a tournament + shown only to
 * viewers who have some role on it (a resume token or host token — nobody
 * else needs the reminder). Same iOS-Safari constraint: web push only fires
 * from a home-screen-installed PWA on iOS 16.4+, and there's no API to
 * trigger "Add to Home Screen" — this is a one-time instructional card.
 */
export function TournamentIosInstallPushNudge({
  tournamentCode,
  hasRole,
}: {
  tournamentCode: string
  /** True when this device holds a player OR host token for this tournament. */
  hasRole: boolean
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return
    if (!isIos() || isStandalone()) return // only un-installed iOS
    if (pushSupported()) return // already installed + push-capable
    if (localStorage.getItem(dismissKey(tournamentCode))) return
    if (!hasRole) return
    setVisible(true)
  }, [tournamentCode, hasRole])

  if (!visible) return null

  const dismiss = () => {
    localStorage.setItem(dismissKey(tournamentCode), '1')
    setVisible(false)
  }

  return (
    <div className="fixed bottom-3 right-3 z-50 max-w-xs">
      <div className="glass-card-strong flex flex-col gap-2 px-4 py-3">
        <p className="text-xs text-body">
          📲 Want a heads-up when this tournament starts? On iPhone, add fateround to your Home Screen first: tap the{' '}
          <strong>Share</strong> icon (the square with an up arrow), choose <strong>Add to Home Screen</strong>, then
          open fateround from there to turn on reminders.
        </p>
        <button type="button" onClick={dismiss} className="btn-secondary btn-fit self-end text-[11px]">
          Got it
        </button>
      </div>
    </div>
  )
}
