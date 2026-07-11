import { useState } from 'react'
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native'
import type { MatchingPairsSubmission } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import {
  tallyMatchingPairsScore,
  type MatchingPairsProgressWithTiming,
  type MatchingPairsScore,
} from './matchingPairsScore'

// Enable LayoutAnimation on Android (no-op on iOS where it's on by default).
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

// Fixed semantic chip colors — same palette as the play board (reads the same
// in light + dark); neutral chips use theme tokens.
const GREEN = '#22c55e'
const RED = '#ef4444'

function formatMinutesSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}:${rem.toString().padStart(2, '0')}`
}

type ChipVariant = 'green' | 'red' | 'neutral'

function StatChip({
  label,
  variant = 'neutral',
  styles,
}: {
  label: string
  variant?: ChipVariant
  styles: ReturnType<typeof makeStyles>
}) {
  return (
    <View
      style={[
        styles.chip,
        variant === 'green' && styles.chipGreen,
        variant === 'red' && styles.chipRed,
      ]}
    >
      <Text
        style={[
          styles.chipText,
          variant === 'green' && { color: GREEN },
          variant === 'red' && { color: RED },
        ]}
      >
        {label}
      </Text>
    </View>
  )
}

/** Stat chips for one scored round (mirrors web MatchingPairsStatDetails). */
function StatDetails({
  score,
  gridSizePairs,
  styles,
}: {
  score: MatchingPairsScore
  gridSizePairs: number
  styles: ReturnType<typeof makeStyles>
}) {
  const timeSecs =
    score.timeTakenMs != null && score.timeTakenMs >= 0
      ? Math.max(0, Math.floor(score.timeTakenMs / 1000))
      : null
  return (
    <View style={styles.detailsBlock}>
      <View style={styles.chipRow}>
        <StatChip label={`Pairs ${score.pairsMatched}/${gridSizePairs}`} styles={styles} />
        <StatChip label={`Wrong ${score.wrongAttempts}`} styles={styles} />
        {timeSecs !== null ? (
          <StatChip label={`⏱️ ${formatMinutesSeconds(timeSecs)}`} styles={styles} />
        ) : score.timeTakenMs === -1 ? (
          <StatChip label="⏱️ Unfinished" variant="red" styles={styles} />
        ) : null}
        <StatChip label={`🔥 ${score.longestStreak}`} styles={styles} />
      </View>
      <View style={styles.chipRow}>
        <StatChip label={`Base +${score.pairsMatched * 1000}`} variant="green" styles={styles} />
        {score.streakBonusTotal > 0 && (
          <StatChip label={`Streak +${score.streakBonusTotal}`} variant="green" styles={styles} />
        )}
        {score.placementBonus > 0 && (
          <StatChip label={`Placement +${score.placementBonus}`} variant="green" styles={styles} />
        )}
        {score.cleanStreakMultiplierBonus > 0 && (
          <StatChip
            label={`Clean streak +${score.cleanStreakMultiplierBonus}`}
            variant="green"
            styles={styles}
          />
        )}
        {score.speedParBonus > 0 && (
          <StatChip label={`Speed +${score.speedParBonus}`} variant="green" styles={styles} />
        )}
        {score.perfectGame && <StatChip label="⭐ Perfect +2000" variant="green" styles={styles} />}
        {score.wrongPenaltyTotal > 0 && (
          <StatChip label={`Penalty -${score.wrongPenaltyTotal}`} variant="red" styles={styles} />
        )}
      </View>
      <Text style={styles.total}>Total {score.finalScore} pts</Text>
    </View>
  )
}

/**
 * Full breakdown for one player. Single round → one stat block; multi-round →
 * one block per round the player participated in (mirrors web
 * MatchingPairsFinalBreakdown).
 */
function PlayerBreakdown({
  playerId,
  allSubmissions,
  allProgress,
  gridSizePairs,
  sessionStartedAt,
  roundStartedAtMap,
  totalRounds,
  timerSeconds,
  styles,
}: {
  playerId: string
  allSubmissions: MatchingPairsSubmission[]
  allProgress: MatchingPairsProgressWithTiming[]
  gridSizePairs: number
  sessionStartedAt: string | null
  roundStartedAtMap: Map<string, string>
  totalRounds: number
  timerSeconds: number | null
  styles: ReturnType<typeof makeStyles>
}) {
  const playerSubs = allSubmissions.filter((s) => s.player_id === playerId)
  const playerProgs = allProgress.filter((p) => p.player_id === playerId)

  // Global round order (by progress created_at) so late joiners get the right
  // round numbers, then keep only rounds this player played.
  const allRoundIds = [...new Set(allProgress.map((p) => p.round_id))].sort((a, b) => {
    const aTime = allProgress.find((p) => p.round_id === a)?.created_at ?? ''
    const bTime = allProgress.find((p) => p.round_id === b)?.created_at ?? ''
    return aTime.localeCompare(bTime)
  })
  const playerRoundSet = new Set([
    ...playerSubs.map((s) => s.round_id),
    ...playerProgs.map((p) => p.round_id),
  ])
  const roundIds = allRoundIds.filter((rid) => playerRoundSet.has(rid))

  if (totalRounds <= 1) {
    const prog = playerProgs[0]
    if (!prog) return null
    const roundStart = roundStartedAtMap.get(prog.round_id) ?? sessionStartedAt
    const score = tallyMatchingPairsScore(
      playerSubs,
      prog,
      gridSizePairs,
      sessionStartedAt,
      roundStart,
      timerSeconds
    )
    return <StatDetails score={score} gridSizePairs={gridSizePairs} styles={styles} />
  }

  return (
    <View style={{ gap: 12 }}>
      {roundIds.map((rid, i) => {
        const roundSubs = playerSubs.filter((s) => s.round_id === rid)
        const roundProg = playerProgs.find((p) => p.round_id === rid)
        if (!roundProg) return null
        const roundStart = roundStartedAtMap.get(rid) ?? sessionStartedAt
        const score = tallyMatchingPairsScore(
          roundSubs,
          roundProg,
          gridSizePairs,
          sessionStartedAt,
          roundStart,
          timerSeconds
        )
        return (
          <View key={rid}>
            <Text style={styles.roundLabel}>Round {i + 1}</Text>
            <StatDetails score={score} gridSizePairs={gridSizePairs} styles={styles} />
          </View>
        )
      })}
    </View>
  )
}

export type MatchingPairsBreakdownEntry = {
  playerId: string
  name: string
  finalScore: number
}

/**
 * Expandable per-player stat accordion for the final leaderboard — the mobile
 * equivalent of web's PaginatedLeaderboard rows + MatchingPairsFinalBreakdown.
 * Rendered under the standings via GameFinishPanel's `notice` slot.
 */
export function MatchingPairsBreakdownList({
  entries,
  allSubmissions,
  allProgress,
  gridSizePairs,
  sessionStartedAt,
  roundStartedAtMap,
  totalRounds,
  timerSeconds,
  myPlayerId,
}: {
  entries: MatchingPairsBreakdownEntry[]
  allSubmissions: MatchingPairsSubmission[]
  allProgress: MatchingPairsProgressWithTiming[]
  gridSizePairs: number
  sessionStartedAt: string | null
  roundStartedAtMap: Map<string, string>
  totalRounds: number
  timerSeconds: number | null
  myPlayerId?: string | null
}) {
  const styles = useThemedStyles(makeStyles)
  const [expanded, setExpanded] = useState<string | null>(null)

  if (entries.length === 0) return null

  const toggle = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setExpanded((cur) => (cur === id ? null : id))
  }

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Score breakdown</Text>
      {entries.map((entry, i) => {
        const isOpen = expanded === entry.playerId
        const you = entry.playerId === myPlayerId
        return (
          <View key={entry.playerId} style={styles.rowWrap}>
            <Pressable
              onPress={() => toggle(entry.playerId)}
              style={[styles.row, you && styles.rowYou]}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
            >
              <Text style={styles.rank}>{i + 1}</Text>
              <Text style={[styles.name, you && styles.nameYou]} numberOfLines={1}>
                {entry.name}
                {you ? ' (you)' : ''}
              </Text>
              <Text style={styles.score}>{entry.finalScore} pts</Text>
              <Text style={styles.chevron}>{isOpen ? '▲' : '▼'}</Text>
            </Pressable>
            {isOpen && (
              <View style={styles.expand}>
                <PlayerBreakdown
                  playerId={entry.playerId}
                  allSubmissions={allSubmissions}
                  allProgress={allProgress}
                  gridSizePairs={gridSizePairs}
                  sessionStartedAt={sessionStartedAt}
                  roundStartedAtMap={roundStartedAtMap}
                  totalRounds={totalRounds}
                  timerSeconds={timerSeconds}
                  styles={styles}
                />
              </View>
            )}
          </View>
        )
      })}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      borderRadius: 14,
      padding: 12,
      gap: 6,
    },
    heading: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 2,
    },
    rowWrap: {
      borderRadius: 10,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 8,
    },
    rowYou: { backgroundColor: theme.surfaceHover },
    rank: {
      width: 20,
      textAlign: 'center',
      color: theme.textMuted,
      fontWeight: '800',
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },
    name: { flex: 1, color: theme.text, fontWeight: '600', fontSize: 15 },
    nameYou: { color: theme.primary },
    score: {
      color: theme.text,
      fontWeight: '800',
      fontSize: 14,
      fontVariant: ['tabular-nums'],
    },
    chevron: { color: theme.textMuted, fontSize: 10, width: 14, textAlign: 'center' },
    expand: {
      paddingHorizontal: 8,
      paddingBottom: 12,
      paddingTop: 2,
      gap: 8,
    },
    detailsBlock: { gap: 8 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceHover,
    },
    chipGreen: { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.20)' },
    chipRed: { backgroundColor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.20)' },
    chipText: { fontSize: 11, fontWeight: '700', color: theme.textMuted },
    total: { color: theme.text, fontWeight: '800', fontSize: 13, marginTop: 2 },
    roundLabel: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 4,
    },
  })
