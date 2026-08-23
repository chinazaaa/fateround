import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import {
  onCoinsAwarded,
  onGuestCoinsPending,
  type CoinAwardWire,
} from '@/lib/coins/earn-events'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * Mobile mirror of `src/components/coins/CoinAwardPanel.tsx`. Same shape,
 * RN primitives. Renders itself when a coin event fires for `gameCode`
 * (or any coin event if `gameCode` isn't passed).
 *
 * Web ↔ mobile parity is a real requirement — the plan calls out that the
 * coin panel and the sign-up CTA render on both.
 */
type Props = { gameCode?: string | null }

export function CoinAwardPanel({ gameCode }: Props) {
  const styles = useThemedStyles(makeStyles)
  const router = useRouter()
  const [coins, setCoins] = useState<CoinAwardWire | null>(null)
  const [guest, setGuest] = useState<CoinAwardWire | null>(null)

  useEffect(() => {
    const off1 = onCoinsAwarded((payload, code) => {
      if (!gameCode || !code || code === gameCode) setCoins(payload)
    })
    const off2 = onGuestCoinsPending((payload, code) => {
      if (!gameCode || !code || code === gameCode) setGuest(payload)
    })
    return () => {
      off1()
      off2()
    }
  }, [gameCode])

  const shown = coins ?? guest
  const isGuest = !coins && Boolean(guest)
  if (!shown) return null

  const anyCredit = shown.total > 0
  const lines = shown.lines ?? []

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>Coins earned</Text>
        <Text style={styles.total}>{anyCredit ? `🪙 +${shown.total}` : '🪙 0'}</Text>
      </View>
      {lines.length > 0 ? (
        lines.map((line, i) => (
          <View key={`${line.reason}-${i}`} style={styles.row}>
            <Text style={styles.label}>{line.label}</Text>
            <Text style={styles.amount}>
              {line.credited > 0
                ? `+${line.credited}`
                : line.requested > line.credited
                ? '—'
                : `+${line.requested}`}
            </Text>
          </View>
        ))
      ) : (
        <Text style={styles.muted}>Needs 2 human players to earn coins.</Text>
      )}
      {isGuest && anyCredit && (
        <Pressable
          style={styles.cta}
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          accessibilityLabel={`Sign up to claim ${shown.total} coins`}
        >
          <Text style={styles.ctaText}>Sign up to claim {shown.total} coins</Text>
        </Pressable>
      )}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      borderRadius: 16,
      backgroundColor: theme.surface,
      padding: 16,
      gap: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    eyebrow: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1.5,
      color: theme.textMuted,
    },
    total: { fontSize: 22, fontWeight: '900', color: theme.text, fontVariant: ['tabular-nums'] },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
    label: { color: theme.textMuted, fontSize: 14 },
    amount: { color: theme.text, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
    muted: { color: theme.textMuted, fontSize: 13 },
    cta: {
      marginTop: 8,
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: 'center',
    },
    ctaText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  })
