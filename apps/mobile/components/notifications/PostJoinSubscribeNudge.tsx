/**
 * PostJoinSubscribeNudge — one-shot finish-screen nudge for /notifications.
 *
 * Fires once per app install regardless of the home-banner state. Preselects
 * the finished game's type on the /notifications deep link.
 */

import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import type { GameType } from '@fateround/shared'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { gameLabel } from '@/lib/mobile-registry'
import { apiUrl } from '@/lib/config'
import { getExpoPushToken } from '@/lib/push-notifications'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const FIRED_KEY = 'post-join-subscribe-nudge-fired'

type Props = { gameType: string | null | undefined }

export function PostJoinSubscribeNudge({ gameType }: Props) {
  const router = useRouter()
  const styles = useThemedStyles(makeStyles)
  const [visible, setVisible] = useState(false)
  const [alreadySubscribed, setAlreadySubscribed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const fired = await SecureStore.getItemAsync(FIRED_KEY)
      if (cancelled || fired === '1') return
      // Check if this device is already subscribed to the finished game's type.
      // If so we swap the copy to "You're subscribed — see all →" instead of
      // asking them to subscribe to something they already have. Non-blocking:
      // if the token isn't available we show the default subscribe copy.
      const tokenKey = await getExpoPushToken()
      if (tokenKey && gameType) {
        try {
          const res = await fetch(apiUrl(`/api/notifications?tokenKey=${encodeURIComponent(tokenKey)}`), {
            cache: 'no-store',
          })
          if (res.ok) {
            const data = await res.json()
            const types = (data.subscribedGameTypes ?? []) as string[]
            if (!cancelled) setAlreadySubscribed(types.includes(gameType))
          }
        } catch {
          // ignore — default subscribe copy is fine
        }
      }
      if (!cancelled) setVisible(true)
    })()
    return () => {
      cancelled = true
    }
  }, [gameType])

  const markFired = useCallback(async () => {
    setVisible(false)
    try {
      await SecureStore.setItemAsync(FIRED_KEY, '1')
    } catch {
      // Best-effort.
    }
  }, [])

  if (!visible || !gameType) return null
  const label = gameLabel(gameType as GameType)

  return (
    <SurfaceCard accent style={styles.card}>
      <View style={styles.row}>
        <View style={styles.body}>
          <Pressable
            onPress={() => {
              void markFired()
              // Already subscribed → land on the full list. Not subscribed →
              // preselect this game's type so the toggle is easy to find.
              const href = alreadySubscribed ? '/notifications' : `/notifications?type=${encodeURIComponent(gameType)}`
              router.push(href as never)
            }}
          >
            <Text style={styles.title}>
              {alreadySubscribed
                ? `You’re subscribed to ${label} pings ✓`
                : `Want a ping when new ${label} games open?`}
            </Text>
            <Text style={styles.cta}>{alreadySubscribed ? 'See all notification preferences →' : 'Subscribe →'}</Text>
          </Pressable>
          {/* Secondary "see all" link for the not-yet-subscribed case, so users
              can jump straight to the full list without going through the
              type-specific deep link first. */}
          {!alreadySubscribed ? (
            <Pressable
              onPress={() => {
                void markFired()
                router.push('/notifications' as never)
              }}
            >
              <Text style={styles.secondaryLink}>See all notifications →</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={() => void markFired()} hitSlop={8} accessibilityLabel="Dismiss">
          <Text style={styles.x}>×</Text>
        </Pressable>
      </View>
    </SurfaceCard>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { marginBottom: theme.space.sm },
    row: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
    body: { flex: 1 },
    title: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '700' },
    cta: { color: theme.primary, fontSize: theme.type.label.size, fontWeight: '800', marginTop: 2 },
    secondaryLink: { color: theme.textMuted, fontSize: 12, fontWeight: '600', marginTop: 6 },
    x: { color: theme.textMuted, fontSize: 22, paddingHorizontal: 4 },
  })
