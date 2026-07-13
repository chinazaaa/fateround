import { StyleSheet, Text, View } from 'react-native'
import type { FinishedLeaderboardRow } from '@/components/game/GameChrome'

/**
 * Colors for one rendering of the results card. The same layout is drawn twice:
 * with the app theme for the on-screen finished section, and with a fixed light
 * palette for the off-screen PNG that gets shared. Keeping both on one component
 * is what makes the finished screen match the shared image exactly.
 */
export type ResultsPalette = {
  cardBg: string
  gameTitle: string
  label: string
  divider: string
  result: string
  subtitle: string
  detail: string
  rowBg: string
  rowBorder: string
  rowWinnerBg: string
  rowWinnerBorder: string
  rank: string
  rowName: string
  rowNameWinner: string
  you: string
  rowDetail: string
  rowValue: string
  rowValueWinner: string
  brand: string
}

const MEDALS = ['👑', '🥈', '🥉']

type Props = {
  palette: ResultsPalette
  /** Game-type emoji shown in the header (🎲, 🔤 …). */
  gameEmoji?: string | null
  /** Game title shown in the accent color, e.g. "Bingo". */
  gameTitle?: string | null
  /** Uppercase game label under the title, e.g. "BINGO". */
  label?: string | null
  /** Hero/trophy emoji — 🏆 for a winner, 🏁 otherwise. */
  emoji?: string
  /** Result headline, e.g. "Naza wins!". */
  resultTitle?: string
  /** Short uppercase flavor line, e.g. "FINAL STANDINGS". */
  subtitle?: string | null
  /** Secondary sentence under the headline. */
  detail?: string | null
  leaderboard?: FinishedLeaderboardRow[]
  /** Brand footer text (shared image only); omitted on-screen. */
  brand?: string | null
  /** Card width — a fixed px for the captured image, "100%" on-screen. */
  width?: number | '100%'
  /** Max standings rows to show. */
  maxRows?: number
}

/**
 * Branded results card: game emoji + title + label, trophy, "X wins!", an
 * optional flavor line + detail, per-player standings (winner row filled and
 * enlarged), and an optional brand footer. Colors come entirely from `palette`.
 */
export function ResultsCard({
  palette,
  gameEmoji,
  gameTitle,
  label,
  emoji = '🏆',
  resultTitle,
  subtitle,
  detail,
  leaderboard,
  brand,
  width = '100%',
  maxRows = 6,
}: Props) {
  const rows = (leaderboard ?? []).slice(0, maxRows)
  const showHeader = !!(gameEmoji || gameTitle || label)

  return (
    <View style={[styles.card, { backgroundColor: palette.cardBg, width }]}>
      {gameEmoji ? <Text style={styles.gameEmoji}>{gameEmoji}</Text> : null}
      {gameTitle ? <Text style={[styles.gameTitle, { color: palette.gameTitle }]}>{gameTitle}</Text> : null}
      {label ? <Text style={[styles.label, { color: palette.label }]}>{label}</Text> : null}

      {showHeader ? <View style={[styles.divider, { backgroundColor: palette.divider }]} /> : null}

      <Text style={styles.trophy}>{emoji}</Text>
      {resultTitle ? <Text style={[styles.result, { color: palette.result }]}>{resultTitle}</Text> : null}
      {subtitle ? <Text style={[styles.subtitle, { color: palette.subtitle }]}>{subtitle}</Text> : null}
      {detail ? <Text style={[styles.detail, { color: palette.detail }]}>{detail}</Text> : null}

      {rows.length > 0 ? (
        <View style={styles.standings}>
          {rows.map((row, i) => {
            const isWinner = i === 0 || row.highlight
            const rank = MEDALS[i] ?? String(i + 1)
            const raw = `${row.score}`.trim()
            const hasScore = raw !== '' && raw !== '—' && raw !== '-'
            const value = hasScore ? `${raw}${row.scoreSuffix ? ` ${row.scoreSuffix}` : ''}` : ''
            return (
              <View
                key={`${row.name}-${i}`}
                style={[
                  styles.row,
                  { backgroundColor: palette.rowBg, borderColor: palette.rowBorder },
                  isWinner && { backgroundColor: palette.rowWinnerBg, borderColor: palette.rowWinnerBorder },
                ]}
              >
                <Text style={[styles.rank, { color: palette.rank }]}>{rank}</Text>
                <View style={styles.rowText}>
                  <Text
                    style={[
                      styles.rowName,
                      { color: palette.rowName },
                      isWinner && [styles.rowNameWinner, { color: palette.rowNameWinner }],
                    ]}
                    numberOfLines={1}
                  >
                    {row.name?.trim() ? row.name : 'Player'}
                    {row.you ? <Text style={[styles.you, { color: palette.you }]}> (you)</Text> : null}
                  </Text>
                  {row.detail ? <Text style={[styles.rowDetail, { color: palette.rowDetail }]}>{row.detail}</Text> : null}
                </View>
                {value ? (
                  <Text
                    style={[
                      styles.rowValue,
                      { color: palette.rowValue },
                      isWinner && [styles.rowValueWinner, { color: palette.rowValueWinner }],
                    ]}
                  >
                    {value}
                  </Text>
                ) : null}
              </View>
            )
          })}
        </View>
      ) : null}

      {brand ? <Text style={[styles.brand, { color: palette.brand }]}>{brand}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 6,
  },
  gameEmoji: { fontSize: 40 },
  gameTitle: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  divider: { height: 1, width: '70%', marginVertical: 14 },
  trophy: { fontSize: 48, marginBottom: 4 },
  result: { fontSize: 28, fontWeight: '900', textAlign: 'center' },
  subtitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginTop: 2,
  },
  detail: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
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
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rank: { width: 26, textAlign: 'center', fontSize: 15, fontWeight: '900' },
  rowText: { flex: 1, gap: 1 },
  rowName: { fontSize: 15, fontWeight: '700' },
  rowNameWinner: { fontSize: 16, fontWeight: '900' },
  you: { fontSize: 13, fontWeight: '700' },
  rowDetail: { fontSize: 11 },
  rowValue: { fontSize: 14, fontWeight: '800' },
  rowValueWinner: { fontSize: 15, fontWeight: '900' },
  brand: { fontSize: 12, fontWeight: '700', marginTop: 22 },
})
