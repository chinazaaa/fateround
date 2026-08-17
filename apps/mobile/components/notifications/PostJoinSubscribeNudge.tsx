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
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const FIRED_KEY = 'post-join-subscribe-nudge-fired'

type Props = { gameType: string | null | undefined }

export function PostJoinSubscribeNudge({ gameType }: Props) {
  const router = useRouter()
  const styles = useThemedStyles(makeStyles)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const fired = await SecureStore.getItemAsync(FIRED_KEY)
      if (!cancelled && fired !== '1') setVisible(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
              router.push(`/notifications?type=${encodeURIComponent(gameType)}` as never)
            }}
          >
            <Text style={styles.title}>Want a ping when new {label} games open?</Text>
            <Text style={styles.cta}>Subscribe →</Text>
          </Pressable>
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
    x: { color: theme.textMuted, fontSize: 22, paddingHorizontal: 4 },
  })
