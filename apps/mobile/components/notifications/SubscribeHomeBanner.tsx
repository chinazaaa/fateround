/**
 * SubscribeHomeBanner — dismissible nudge for the /notifications screen.
 *
 * Appears above the "Live games" strip on the mobile home from the user's
 * second app open onward. Dismissal persists in SecureStore so it never
 * comes back for this device. Deep-links into /notifications.
 */

import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const DISMISS_KEY = 'subscribe-banner-dismissed'
const OPEN_COUNT_KEY = 'app-open-count'

export function SubscribeHomeBanner() {
  const router = useRouter()
  const styles = useThemedStyles(makeStyles)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // Bump the open counter once per mount; the banner shows from the 2nd
      // open onward so a fresh install doesn't hit users with a subscribe
      // prompt the first second they land.
      const [dismissed, rawCount] = await Promise.all([
        SecureStore.getItemAsync(DISMISS_KEY),
        SecureStore.getItemAsync(OPEN_COUNT_KEY),
      ])
      const nextCount = Math.min((Number(rawCount) || 0) + 1, 99)
      await SecureStore.setItemAsync(OPEN_COUNT_KEY, String(nextCount))
      if (!cancelled && dismissed !== '1' && nextCount >= 2) setVisible(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const onDismiss = useCallback(async () => {
    setVisible(false)
    try {
      await SecureStore.setItemAsync(DISMISS_KEY, '1')
    } catch {
      // Best-effort — state is already hidden locally.
    }
  }, [])

  if (!visible) return null

  return (
    <SurfaceCard accent style={styles.card}>
      <View style={styles.row}>
        <View style={styles.body}>
          <Pressable onPress={() => router.push('/notifications' as never)}>
            <Text style={styles.title}>🔔 Get pinged when your favourite games open</Text>
            <Text style={styles.cta}>Subscribe →</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => void onDismiss()} hitSlop={8} accessibilityLabel="Dismiss">
          <Text style={styles.x}>×</Text>
        </Pressable>
      </View>
    </SurfaceCard>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { marginBottom: theme.space.xs },
    row: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
    body: { flex: 1 },
    title: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '700' },
    cta: { color: theme.primary, fontSize: theme.type.label.size, fontWeight: '800', marginTop: 2 },
    x: { color: theme.textMuted, fontSize: 22, paddingHorizontal: 4 },
  })
