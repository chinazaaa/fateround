'use client'

import { useCallback, useEffect, useState } from 'react'
import { getPlayerSession } from '@/lib/utils'
import { isSubscribed, pushSupported, subscribeToGamePush, unsubscribeFromGamePush } from '@/lib/push-client'

const dismissKey = (gameCode: string) => `push_dismissed_${gameCode}`

// hidden   — feature off / unsupported / denied / dismissed-before-deciding
// prompt   — first-time invite (permission undecided)
// on       — this device is subscribed for this game
// off      — opted in before but currently turned off (can re-enable in one tap)
type Status = 'hidden' | 'prompt' | 'on' | 'off'

/**
 * Lobby control for game-lifecycle push notifications (start / play-again / end).
 *
 * First-time players see an invite; once they decide it becomes a persistent on/off
 * toggle so they can turn alerts back off (or on) any time. Renders nothing when the
 * browser can't deliver push — which excludes un-installed iOS Safari (Phase 2), a
 * denied permission, a missing resume token, or an unconfigured VAPID key.
 */
export function PushNotificationPrompt({ gameCode }: { gameCode: string }) {
  const [status, setStatus] = useState<Status>('hidden')
  const [busy, setBusy] = useState(false)

  const resumeToken = useCallback(() => getPlayerSession(gameCode)?.resumeToken ?? null, [gameCode])

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return
      if (!pushSupported() || Notification.permission === 'denied') return
      const token = resumeToken()
      if (!token) return

      if (Notification.permission === 'granted') {
        // Already opted into notifications globally — ensure THIS game has a live row
        // for this device (subscriptions are per-origin, so a new game needs its own
        // row), then reflect the actual subscription state.
        if (await isSubscribed()) {
          await subscribeToGamePush(gameCode, token)
          if (!cancelled) setStatus('on')
        } else if (!cancelled) {
          setStatus('off')
        }
        return
      }

      // permission === 'default' — first-time invite, unless they dismissed it.
      if (localStorage.getItem(dismissKey(gameCode))) return
      if (!cancelled) setStatus('prompt')
    }
    init()
    return () => {
      cancelled = true
    }
  }, [gameCode, resumeToken])

  const turnOn = async () => {
    const token = resumeToken()
    if (!token) {
      setStatus('hidden')
      return
    }
    setBusy(true)
    const ok = await subscribeToGamePush(gameCode, token)
    setBusy(false)
    if (ok) {
      localStorage.removeItem(dismissKey(gameCode))
      setStatus('on')
    } else if (Notification.permission === 'denied') {
      setStatus('hidden')
    } else {
      setStatus('off')
    }
  }

  const turnOff = async () => {
    setBusy(true)
    await unsubscribeFromGamePush(gameCode)
    setBusy(false)
    setStatus('off')
  }

  const dismiss = () => {
    localStorage.setItem(dismissKey(gameCode), '1')
    setStatus('hidden')
  }

  if (status === 'hidden') return null

  if (status === 'prompt') {
    return (
      <div className="fixed bottom-3 right-3 z-50 max-w-xs">
        <div className="glass-card-strong flex items-center gap-3 px-4 py-3">
          <p className="text-xs text-body">🔔 Get notified when the game starts, restarts, or ends?</p>
          <div className="flex shrink-0 flex-col gap-1">
            <button type="button" onClick={turnOn} disabled={busy} className="btn-primary btn-fit text-xs">
              {busy ? '…' : 'Enable'}
            </button>
            <button type="button" onClick={dismiss} className="btn-secondary btn-fit text-[11px]">
              No thanks
            </button>
          </div>
        </div>
      </div>
    )
  }

  // status === 'on' | 'off' — persistent toggle.
  const on = status === 'on'
  return (
    <div className="fixed bottom-3 right-3 z-50">
      <div className="glass-card-strong flex items-center gap-2 px-3 py-2">
        <span className="text-xs text-body">{on ? '🔔 Alerts on' : '🔕 Alerts off'}</span>
        <button
          type="button"
          onClick={on ? turnOff : turnOn}
          disabled={busy}
          className="btn-secondary btn-fit text-[11px]"
        >
          {busy ? '…' : on ? 'Turn off' : 'Turn on'}
        </button>
      </div>
    </div>
  )
}
