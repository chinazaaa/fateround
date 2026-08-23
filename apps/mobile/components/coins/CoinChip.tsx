import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { useRouter } from 'expo-router'
import { authHeaders } from '@/lib/identity'
import { apiUrl } from '@/lib/config'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { onCoinsAwarded } from '@/lib/coins/earn-events'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'

/**
 * Mobile mirror of `src/components/coins/CoinChip.tsx` — the coin balance
 * chip visible on non-in-game screens (plan §"UI surfaces").
 *
 * Hidden for guests and callers with no session yet. Reads `/api/profile/me`
 * so it stays in sync with the profile screen's balance card.
 */
export function CoinChip() {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const [coins, setCoins] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    try {
      const headers = await authHeaders()
      if (!headers) {
        setCoins(null)
        return
      }
      const res = await fetch(apiUrl('/api/profile/me'), { headers })
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) setCoins(null)
        return
      }
      const data = await res.json()
      const profile = data?.profile
      if (!profile || profile.is_anonymous) {
        setCoins(null)
        return
      }
      setCoins(Number(profile.coins ?? 0))
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    void refresh()
    return onCoinsAwarded(() => void refresh())
  }, [refresh])

  useRefreshOnFocus(refresh)

  if (coins == null) return null

  return (
    <Pressable
      onPress={() => router.push('/profile?tab=coins')}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${coins} coins`}
      hitSlop={10}
    >
      <Text style={styles.text}>🪙 {coins.toLocaleString()}</Text>
    </Pressable>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    pressed: { opacity: 0.7 },
    text: { color: theme.text, fontWeight: '700', fontSize: 14, fontVariant: ['tabular-nums'] },
  })
