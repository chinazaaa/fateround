import { StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { gameLabel } from '@/lib/mobile-registry'
import { gameTypeMeta } from '@/lib/game-type-meta'

type Props = {
  gameType?: GameType | string | null
  gameTitle?: string | null
  /** Headline, e.g. "Naza wins!". */
  resultTitle?: string
  /** Sub-headline, e.g. "BINGO!". */
  resultDetail?: string | null
}

/**
 * Light, branded results card captured to an image for sharing — mirrors the
 * web share card (game emoji + title, trophy, "X wins!", sub-line, brand). Kept
 * off-screen and snapshotted via react-native-view-shot; not shown in the UI.
 */
export function ShareResultCard({ gameType, gameTitle, resultTitle, resultDetail }: Props) {
  const emoji = gameType ? gameTypeMeta(gameType as GameType).emoji : '🎮'
  const label = gameType ? gameLabel(gameType as GameType) : undefined

  return (
    <View style={styles.card}>
      <Text style={styles.emoji}>{emoji}</Text>
      {gameTitle ? <Text style={styles.gameTitle}>{gameTitle}</Text> : null}
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={styles.divider} />

      <Text style={styles.trophy}>🏆</Text>
      {resultTitle ? <Text style={styles.result}>{resultTitle}</Text> : null}
      {resultDetail ? <Text style={styles.detail}>{resultDetail}</Text> : null}

      <Text style={styles.brand}>fateround.com</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: 340,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 6,
  },
  emoji: { fontSize: 40 },
  gameTitle: { color: '#e11d48', fontSize: 24, fontWeight: '900', textAlign: 'center' },
  label: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  divider: {
    height: 1,
    width: '70%',
    backgroundColor: '#f1e0e4',
    marginVertical: 14,
  },
  trophy: { fontSize: 48, marginBottom: 4 },
  result: { color: '#0b0b0f', fontSize: 30, fontWeight: '900', textAlign: 'center' },
  detail: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  brand: { color: '#d1d5db', fontSize: 12, fontWeight: '700', marginTop: 22 },
})
