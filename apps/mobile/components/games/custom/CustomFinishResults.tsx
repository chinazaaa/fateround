import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { CustomSlot, Participant, Round, Vote } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { CustomRoundResults } from './CustomRoundResults'
import { buildCustomLeaderboard, tallyCustomVotes } from './custom-results'

type Props = {
  slots: CustomSlot[]
  participants: Participant[]
  rounds: Round[]
  votes: Vote[]
  myPlayerId?: string | null
}

/** Finish-screen custom results: cumulative Final Leaderboard + per-round history. */
export function CustomFinishResults({ slots, participants, rounds, votes, myPlayerId }: Props) {
  const styles = useThemedStyles(makeStyles)
  const leaderboard = useMemo(
    () => buildCustomLeaderboard(votes, participants, slots),
    [votes, participants, slots]
  )
  const photoById = useMemo(
    () => new Map(participants.map((p) => [p.id, p.photo_url])),
    [participants]
  )
  const slotKeys = useMemo(() => slots.map((s) => s.key), [slots])
  const nameById = useMemo(() => new Map(participants.map((p) => [p.id, p.name])), [participants])

  if (slots.length === 0) return null

  const orderedRounds = [...rounds].sort((a, b) => a.round_number - b.round_number)

  return (
    <View style={styles.wrap}>
      {/* Final leaderboard */}
      <View style={styles.card}>
        <Text style={styles.header}>Final Leaderboard</Text>
        {leaderboard.map((entry) => (
          <View key={entry.slot.key} style={styles.lbSlot}>
            <Text style={[styles.lbSlotTitle, { color: entry.slot.color }]}>
              {entry.slot.emoji} Most {entry.slot.label}
            </Text>
            {entry.entries.length === 0 ? (
              <Text style={styles.lbEmpty}>No votes</Text>
            ) : (
              entry.entries.slice(0, 3).map((e, i) => (
                <Text key={e.name} style={styles.lbRow}>
                  {i === 0 ? '🏆' : `${i + 1}.`} {e.name} ({e.count} votes)
                </Text>
              ))
            )}
          </View>
        ))}
      </View>

      {/* All round results */}
      {orderedRounds.length > 0 ? (
        <View style={styles.historyWrap}>
          <Text style={styles.historyHeader}>All round results</Text>
          {orderedRounds.map((round) => {
            const roundVotes = votes.filter((v) => v.round_id === round.id)
            const tally = tallyCustomVotes(roundVotes, round.participant_ids ?? [], nameById, slotKeys)
            const myVote = roundVotes.find((v) => v.player_id === myPlayerId)
            const myAssignment = (myVote?.pair_assignments as Record<string, string> | null) ?? null
            return (
              <View key={round.id} style={styles.historyRound}>
                <Text style={styles.roundLabel}>Round {round.round_number}</Text>
                <CustomRoundResults
                  tally={tally}
                  slots={slots}
                  myAssignment={myAssignment}
                  photoById={photoById}
                />
              </View>
            )
          })}
        </View>
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: 16, width: '100%' },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 12,
    },
    header: {
      color: theme.textMuted,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 1,
      textAlign: 'center',
      fontWeight: '700',
    },
    lbSlot: { gap: 3 },
    lbSlotTitle: { fontSize: 14, fontWeight: '700' },
    lbRow: { color: theme.text, fontSize: 14, paddingLeft: 18 },
    lbEmpty: { color: theme.textMuted, fontSize: 13, paddingLeft: 18 },
    historyWrap: { gap: 14 },
    historyHeader: {
      color: theme.textMuted,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 1,
      fontWeight: '700',
    },
    historyRound: { gap: 8 },
    roundLabel: {
      color: theme.textMuted,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 1,
      fontWeight: '700',
    },
  })
