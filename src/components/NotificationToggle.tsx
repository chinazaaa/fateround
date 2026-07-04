'use client'

import { useEffect, useState } from 'react'
import { isSubscribed, pushSupported, subscribeToGamePush, unsubscribeFromGamePush } from '@/lib/push-client'

type Props = { gameCode: string | null; resumeToken: string | null }

/**
 * Header toggle (sits beside SoundToggle) for game-lifecycle push notifications —
 * start / play-again / end. A persistent, discoverable home rather than a floating
 * corner pill.
 *
 * Permission is granted once per device: after that every game auto-subscribes on
 * load and shows "on" with no re-prompt. First-timers (permission still undecided)
 * get a pulsing dot on the bell so the control is noticed. Renders nothing when push
 * can't be delivered (un-installed iOS, denied permission, no resume token, no key) —
 * un-installed iOS is handled separately by IosInstallPushNudge.
 */
export function NotificationToggle({ gameCode, resumeToken }: Props) {
  const [state, setState] = useState<'hidden' | 'on' | 'off'>('hidden')
  const [undecided, setUndecided] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return
      if (!gameCode || !resumeToken) return
      if (!pushSupported() || Notification.permission === 'denied') return

      if (Notification.permission === 'granted') {
        // Already opted in — ensure this game has a row for this device. Only show
        // "on" if that registration actually succeeded; otherwise report "off" so the
        // bell doesn't promise alerts the server never recorded (e.g. a failed call).
        const ok = (await isSubscribed()) && (await subscribeToGamePush(gameCode, resumeToken))
        if (!cancelled) {
          setState(ok ? 'on' : 'off')
          setUndecided(false)
        }
        return
      }

      // permission === 'default' — show the bell as off, with a first-time hint.
      if (!cancelled) {
        setState('off')
        setUndecided(true)
      }
    }
    init()
    return () => {
      cancelled = true
    }
  }, [gameCode, resumeToken])

  if (state === 'hidden') return null
  const on = state === 'on'

  const toggle = async () => {
    if (!gameCode || !resumeToken || busy) return
    setBusy(true)
    if (on) {
      await unsubscribeFromGamePush(gameCode)
      setState('off')
    } else {
      const ok = await subscribeToGamePush(gameCode, resumeToken)
      if (ok) {
        setState('on')
      } else if (Notification.permission === 'denied') {
        setState('hidden')
      }
      setUndecided(false)
    }
    setBusy(false)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-label={on ? 'Turn game alerts off' : 'Turn game alerts on'}
      aria-pressed={on}
      title={on ? 'Alerts on — tap to turn off' : 'Get notified when the game starts, restarts, or ends'}
      className="relative flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all duration-200 glass-card sm:px-3 sm:py-2 sm:text-sm"
      style={{ color: on ? 'var(--primary)' : 'var(--muted)' }}
    >
      {on ? <BellIcon /> : <BellOffIcon />}
      <span className="hidden sm:inline">{on ? 'Alerts on' : 'Alerts'}</span>
      {undecided && (
        <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5" aria-hidden>
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
            style={{ background: 'var(--primary)' }}
          />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: 'var(--primary)' }} />
        </span>
      )}
    </button>
  )
}

function BellIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function BellOffIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
      <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
      <path d="M18 8a6 6 0 0 0-9.33-5" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}
