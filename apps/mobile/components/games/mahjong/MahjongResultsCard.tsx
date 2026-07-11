import { StyleSheet, Text, View } from 'react-native'
import type { MahjongSession } from '@fateround/shared'
import { mahjongTileShortLabel } from '@fateround/shared/mahjong'
import { MAHJONG_RULESET_LABELS } from '@fateround/shared/mahjong-rulesets'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/** Human label for the winning hand pattern (mirrors web MahjongFinalResultsShareBlock). */
function patternLabel(pattern: string | null | undefined): string {
  switch (pattern) {
    case 'seven_pairs':
      return 'Seven pairs'
    case 'thirteen_orphans':
      return 'Thirteen orphans'
    case 'knitted_straight':
      return 'Knitted straight'
    case 'greater_honors_knitted':
      return 'Greater honors knitted'
    case 'lesser_honors_knitted':
      return 'Lesser honors knitted'
    default:
      return 'Standard hand'
  }
}

/**
 * Rich score breakdown for the finished screen: pattern, ruleset, fan/points, fu,
 * limit-hand name, per-yaku scoring lines, win type and the winning tile.
 * Rendered under the standings; returns null on a wall draw (no score summary).
 */
export function MahjongResultsCard({ session }: { session: MahjongSession | null | undefined }) {
  const styles = useThemedStyles(makeStyles)
  const score = session?.score_summary ?? null
  if (!score) return null

  const isMcr = score.ruleset === 'mcr'
  const winType =
    session?.win_type === 'self_draw' ? 'Self draw' : session?.win_type === 'discard' ? 'On discard' : null
  const winTile = session?.winning_tile ? mahjongTileShortLabel(session.winning_tile) : null

  return (
    <View style={styles.card}>
      {winTile ? (
        <Text style={styles.winLine}>
          {winType ? `${winType} · ` : ''}Winning tile {winTile}
        </Text>
      ) : winType ? (
        <Text style={styles.winLine}>{winType}</Text>
      ) : null}

      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Pattern</Text>
          <Text style={styles.statValue}>{patternLabel(score.pattern)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Ruleset</Text>
          <Text style={styles.statValue}>{MAHJONG_RULESET_LABELS[score.ruleset]?.label ?? score.ruleset}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>{isMcr ? 'Points' : 'Fan'}</Text>
          <Text style={styles.statValue}>{score.fan}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>{score.fu != null ? 'Fu' : 'Paid'}</Text>
          <Text style={styles.statValue}>{score.fu != null ? score.fu : score.total_points}</Text>
        </View>
      </View>

      {score.limit ? <Text style={styles.limit}>{score.limit}</Text> : null}

      {score.lines.length > 0 ? (
        <View style={styles.lines}>
          {score.lines.map((line, index) => (
            <View key={`${line.label}-${index}`} style={styles.lineChip}>
              <Text style={styles.lineChipText}>
                {line.label} +{line.fan}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 12,
    },
    winLine: { color: theme.textSecondary, fontSize: 13, fontWeight: '700', textAlign: 'center' },
    statRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
    stat: { flexBasis: '22%', flexGrow: 1, alignItems: 'center', gap: 2 },
    statLabel: { color: theme.textFaint, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    statValue: { color: theme.text, fontSize: 14, fontWeight: '900', textAlign: 'center' },
    limit: { color: theme.primary, fontSize: 12, fontWeight: '800', textAlign: 'center' },
    lines: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
    lineChip: { backgroundColor: theme.bgElevated, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
    lineChipText: { color: theme.textSecondary, fontSize: 12, fontWeight: '700' },
  })
