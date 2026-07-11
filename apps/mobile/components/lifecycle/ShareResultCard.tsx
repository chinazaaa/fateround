import { StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { gameLabel } from '@/lib/mobile-registry'
import { gameTypeMeta } from '@/lib/game-type-meta'
import { shareDomain } from '@/lib/config'
import type { FinishedLeaderboardRow } from '@/components/game/GameChrome'

type Props = {
  gameType?: GameType | string | null
  gameTitle?: string | null
  /** Headline, e.g. "Naza wins!". */
  resultTitle?: string
  /** Sub-headline, e.g. "BINGO!". */
  resultDetail?: string | null
  /** Hero emoji — 🏆 for a winner, 🏁 otherwise. */
  emoji?: string
  leaderboard?: FinishedLeaderboardRow[]
}

const MEDALS = ['👑', '🥈', '🥉']

/**
 * Light, branded results card captured to an image for sharing — mirrors the
 * web share card (game emoji + title, trophy, "X wins!", sub-line, per-player
 * standings, brand). Kept off-screen and snapshotted via react-native-view-shot.
 */
export function ShareResultCard({
  gameType,
  gameTitle,
  resultTitle,
  resultDetail,
  emoji = '🏆',
  leaderboard,
}: Props) {
  const gameEmoji = gameType ? gameTypeMeta(gameType as GameType).emoji : '🎮'
  const label = gameType ? gameLabel(gameType as GameType) : undefined
  const rows = (leaderboard ?? []).slice(0, 6)

  return (
    <View style={styles.card}>
      <Text style={styles.emoji}>{gameEmoji}</Text>
      {gameTitle ? <Text style={styles.gameTitle}>{gameTitle}</Text> : null}
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={styles.divider} />

      <Text style={styles.trophy}>{emoji}</Text>
      {resultTitle ? <Text style={styles.result}>{resultTitle}</Text> : null}
      {resultDetail ? <Text style={styles.detail}>{resultDetail}</Text> : null}

      {rows.length > 0 ? (
        <View style={styles.standings}>
          {rows.map((row, i) => {
            const isWinner = i === 0 || row.highlight
            const rank = MEDALS[i] ?? String(i + 1)
            const raw = `${row.score}`.trim()
            const hasScore = raw !== '' && raw !== '—' && raw !== '-'
            const value = hasScore ? `${raw}${row.scoreSuffix ? ` ${row.scoreSuffix}` : ''}` : ''
            return (
              <View key={`${row.name}-${i}`} style={[styles.row, isWinner && styles.rowWinner]}>
                <Text style={styles.rank}>{rank}</Text>
                <View style={styles.rowText}>
                  <Text style={[styles.rowName, isWinner && styles.rowNameWinner]} numberOfLines={1}>
                    {row.name}
                    {row.you ? <Text style={styles.you}> (you)</Text> : null}
                  </Text>
                  {row.detail ? <Text style={styles.rowDetail}>{row.detail}</Text> : null}
                </View>
                {value ? (
                  <Text style={[styles.rowValue, isWinner && styles.rowValueWinner]}>{value}</Text>
                ) : null}
              </View>
            )
          })}
        </View>
      ) : null}

      <Text style={styles.brand}>{shareDomain()}</Text>
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
  divider: { height: 1, width: '70%', backgroundColor: '#f1e0e4', marginVertical: 14 },
  trophy: { fontSize: 48, marginBottom: 4 },
  result: { color: '#0b0b0f', fontSize: 28, fontWeight: '900', textAlign: 'center' },
  detail: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  standings: {
    width: '100%',
    gap: 8,
    marginTop: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#f7f7fa',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rowWinner: { borderColor: '#f43f5e', backgroundColor: '#fdeef1' },
  rank: { width: 26, textAlign: 'center', fontSize: 15, fontWeight: '900', color: '#6b7280' },
  rowText: { flex: 1, gap: 1 },
  rowName: { color: '#1a1a1a', fontSize: 15, fontWeight: '700' },
  rowNameWinner: { color: '#0b0b0f', fontSize: 16, fontWeight: '900' },
  you: { color: '#0d9488', fontSize: 13, fontWeight: '700' },
  rowDetail: { color: '#9ca3af', fontSize: 11 },
  rowValue: { color: '#6b7280', fontSize: 14, fontWeight: '800' },
  rowValueWinner: { color: '#e11d48', fontSize: 15, fontWeight: '900' },
  brand: { color: '#d1d5db', fontSize: 12, fontWeight: '700', marginTop: 22 },
})
