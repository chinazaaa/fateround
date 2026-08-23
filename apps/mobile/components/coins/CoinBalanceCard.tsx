import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { authHeaders } from '@/lib/identity'
import { apiUrl } from '@/lib/config'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { onCoinsAwarded } from '@/lib/coins/earn-events'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'

/**
 * Coin balance card for the profile screen — mobile mirror of the web
 * `CoinBalanceCard`. Signed-in only; guests see nothing (they can't
 * earn or spend coins, and the profile screen already tells them how
 * to sign in).
 *
 * "View shop" is the primary CTA — the shop is now the destination for
 * anyone with a balance. "View history" is secondary and mirrors web,
 * where it opens the coin history tab on /profile. The mobile profile
 * screen doesn't yet host a history tab, so for now the button leads to
 * `/profile?tab=coins` — the same URL web uses — and a later PR wires
 * the mobile-side tab.
 */
export function CoinBalanceCard() {
  const router = useRouter()
  const styles = useThemedStyles(makeStyles)
  const [coins, setCoins] = useState<number | null>(null)
  const [visible, setVisible] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const headers = await authHeaders()
      if (!headers) {
        setVisible(false)
        return
      }
      const res = await fetch(apiUrl('/api/profile/me'), { headers })
      if (!res.ok) return
      const data = await res.json()
      const profile = data?.profile
      if (!profile || profile.is_anonymous) {
        setVisible(false)
        return
      }
      setCoins(Number(profile.coins ?? 0))
      setVisible(true)
    } catch {
      // silent — offline / cold start
    }
  }, [])

  useEffect(() => {
    void refresh()
    return onCoinsAwarded(() => void refresh())
  }, [refresh])

  useRefreshOnFocus(refresh)

  if (!visible) return null

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Coin balance</Text>
        <Text style={styles.value}>🪙 {(coins ?? 0).toLocaleString()}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          onPress={() => router.push('/shop' as never)}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>View shop</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          onPress={() => router.push('/profile?tab=coins' as never)}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>View history</Text>
        </Pressable>
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.bgElevated,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.borderAccent,
      padding: theme.space.md,
      gap: theme.space.sm,
    },
    header: { gap: 2 },
    eyebrow: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    value: {
      color: theme.text,
      fontSize: 28,
      fontWeight: '900',
      fontVariant: ['tabular-nums'],
    },
    actions: { flexDirection: 'row', gap: theme.space.sm, marginTop: 4 },
    primary: {
      flex: 1,
      backgroundColor: theme.primary,
      borderRadius: theme.radius.md,
      paddingVertical: 10,
      alignItems: 'center',
    },
    primaryText: { color: '#fff', fontSize: 14, fontWeight: '800' },
    secondary: {
      flex: 1,
      backgroundColor: theme.surface,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 10,
      alignItems: 'center',
    },
    secondaryText: { color: theme.text, fontSize: 14, fontWeight: '700' },
    pressed: { opacity: 0.75 },
  })
