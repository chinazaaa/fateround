import { useEffect, useRef } from 'react'
import * as Notifications from 'expo-notifications'
import { getPlayerSession } from '@/lib/secure-session'
import { registerGamePush, unsubscribeGamePush, getExpoPushToken } from '@/lib/push-notifications'
import { isPushMutedForGame } from '@/lib/push-preferences'
import { subscribePlayerSession } from '@/lib/session-events'

/**
 * Register this device for game lifecycle + turn push notifications once the
 * player has a resume token. Re-runs when gameCode changes.
 */
export function useGamePush(gameCode: string) {
  const tokenRef = useRef<string | null>(null)
  const mutedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    const reloadMute = async () => {
      mutedRef.current = await isPushMutedForGame(gameCode)
    }

    void reloadMute()
    const unsub = subscribePlayerSession(gameCode, () => void reloadMute())

    const setup = async () => {
      await reloadMute()
      if (cancelled || mutedRef.current) return

      const session = await getPlayerSession(gameCode)
      if (cancelled || !session?.resumeToken) return

      const ok = await registerGamePush(gameCode, session.resumeToken)
      if (cancelled || !ok) return

      tokenRef.current = await getExpoPushToken()
    }

    void setup()

    return () => {
      cancelled = true
      unsub()
      const token = tokenRef.current
      if (token) void unsubscribeGamePush(gameCode, token)
    }
  }, [gameCode])
}

/**
 * Show in-app toast when a push arrives while the app is foregrounded.
 */
export function useForegroundPushBanner(onMessage: (title: string, body: string) => void) {
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const title = notification.request.content.title ?? 'Fate Round'
      const body = notification.request.content.body ?? ''
      if (body || title) onMessage(title, body)
    })
    return () => sub.remove()
  }, [onMessage])
}
