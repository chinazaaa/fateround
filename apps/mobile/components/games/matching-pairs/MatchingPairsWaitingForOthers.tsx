import { StyleSheet, Text, View } from 'react-native'
import type { MatchingPairsProgress } from '@fateround/shared'
import { MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY } from '@fateround/shared/memory-match'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { MatchingPairsOpponentStrip } from './MatchingPairsOpponentStrip'

// Mirrors web MatchingPairsWaitingForOthers: rich "You finished!" screen with placement
// rank, Score/Pairs/Misses/Streak chips, penalty / perfect-game callout, and a live
// progress list of everyone still playing.
export function MatchingPairsWaitingForOthers({
  pairsMatched,
  gridSizePairs,
  finishRank,
  allProgress,
  myPlayerId,
  playerName,
  totalPoints,
  wrongAttempts,
  currentStreak,
  roundId,
}: {
  pairsMatched: number
  gridSizePairs: number
  finishRank: number | null
  allProgress: MatchingPairsProgress[]
  myPlayerId: string | null
  playerName: (playerId: string) => string
  totalPoints: number
  wrongAttempts: number
  currentStreak: number
  roundId: string | null
}) {
  const styles = useThemedStyles(makeStyles)
  const roundProgress = roundId ? allProgress.filter((p) => p.round_id === roundId) : allProgress
  const stillPlaying = roundProgress.filter((p) => !p.finished).length
  const placementLabel =
    finishRank === 1
      ? '1st 🥇'
      : finishRank === 2
        ? '2nd 🥈'
        : finishRank === 3
          ? '3rd 🥉'
          : finishRank
            ? `${finishRank}th`
            : ''
  const perfect = wrongAttempts === 0 && pairsMatched >= gridSizePairs

  return (
    <View style={styles.wrap}>
      <Text style={styles.emoji}>🎉</Text>
      <Text style={styles.title}>You finished! {placementLabel}</Text>
      <Text style={styles.subtitle}>
        {stillPlaying > 0
          ? `Waiting for ${stillPlaying} more player${stillPlaying !== 1 ? 's' : ''} to finish…`
          : 'All done! Results coming up.'}
      </Text>

      <View style={styles.chips}>
        <Chip label="Score" value={String(totalPoints)} accent="#f59e0b" styles={styles} />
        <Chip label="Pairs" value={`${pairsMatched}/${gridSizePairs}`} accent="#22c55e" styles={styles} />
        <Chip
          label="Misses"
          value={String(wrongAttempts)}
          accent={wrongAttempts === 0 ? '#22c55e' : '#ef4444'}
          styles={styles}
        />
        <Chip label="Streak" value={`${currentStreak}🔥`} accent="#f97316" styles={styles} />
      </View>

      {wrongAttempts > 0 && (
        <View style={styles.penaltyBox}>
          <Text style={styles.penaltyText}>
            -{wrongAttempts * MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY} penalty ({wrongAttempts} miss
            {wrongAttempts !== 1 ? 'es' : ''})
          </Text>
        </View>
      )}
      {perfect && (
        <View style={styles.perfectBox}>
          <Text style={styles.perfectText}>⭐ Perfect game! +2000 bonus</Text>
        </View>
      )}

      <View style={styles.stripContainer}>
        <MatchingPairsOpponentStrip
          allProgress={allProgress}
          myPlayerId={myPlayerId}
          playerName={playerName}
          gridSizePairs={gridSizePairs}
          roundId={roundId}
          includeSelf
          title={null}
        />
      </View>
    </View>
  )
}

function Chip({
  label,
  value,
  accent,
  styles,
}: {
  label: string
  value: string
  accent: string
  styles: ReturnType<typeof makeStyles>
}) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={[styles.chipValue, { color: accent }]}>{value}</Text>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', paddingVertical: 8, gap: 6 },
    emoji: { fontSize: 48 },
    title: { color: theme.text, fontWeight: '800', fontSize: 22, textAlign: 'center' },
    subtitle: { color: theme.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 8 },
    chips: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginVertical: 8 },
    chip: { alignItems: 'center', minWidth: 56 },
    chipLabel: {
      color: theme.textMuted,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    chipValue: { fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
    penaltyBox: {
      backgroundColor: 'rgba(239,68,68,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(239,68,68,0.2)',
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    penaltyText: { color: '#ef4444', fontWeight: '700' },
    perfectBox: {
      backgroundColor: 'rgba(34,197,94,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(34,197,94,0.3)',
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    perfectText: { color: '#22c55e', fontWeight: '700' },
    // Opponent strip renders full width — allow it to stretch inside the centered column.
    stripContainer: { alignSelf: 'stretch' },
  })
