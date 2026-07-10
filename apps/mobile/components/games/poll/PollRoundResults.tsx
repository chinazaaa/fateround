import { StyleSheet, Text, View } from 'react-native'
import type { Game, GameType, Participant, Round, Vote } from '@fateround/shared'
import {
  isBinaryChoiceGame,
  isMostLikelyTo,
  isNeverHaveIEver,
  isThreeChoiceGame,
  mltVoteTargets,
  pairLabels,
  smkSlotLabels,
} from '@fateround/shared/poll-games'
import { tallyMltVotes, tallyRoundVotes, tallyWyrVotes } from '@fateround/shared/vote-stats'
import { ParticipantAvatar } from '@/components/ui/ParticipantAvatar'

type Props = {
  game: Game
  gameType: GameType
  round: Round
  participants: Participant[]
  votes: Vote[]
  players: import('@fateround/shared').Player[]
}

export function PollRoundResults({ game, gameType, round, participants, votes, players }: Props) {
  const roundVotes = votes.filter((v) => v.round_id === round.id)
  const roundPeople = round.participant_ids
    ? round.participant_ids
        .map((id) => participants.find((p) => p.id === id))
        .filter((p): p is Participant => !!p)
    : []

  if (isBinaryChoiceGame(gameType) || isNeverHaveIEver(gameType)) {
    const tally = tallyWyrVotes(roundVotes)
    const total = Math.max(tally.voterCount, 1)
    const pctA = Math.round((tally.countA / total) * 100)
    const pctB = Math.round((tally.countB / total) * 100)
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>Round results</Text>
        <ResultBar label={round.wyr_option_a ?? 'Option A'} count={tally.countA} pct={pctA} />
        <ResultBar label={round.wyr_option_b ?? 'Option B'} count={tally.countB} pct={pctB} />
        <Text style={styles.meta}>{tally.voterCount} vote{tally.voterCount === 1 ? '' : 's'}</Text>
      </View>
    )
  }

  if (isMostLikelyTo(gameType)) {
    const targets = mltVoteTargets(game, players, participants)
    const targetKind = targets[0]?.kind === 'participant' ? 'participant' : 'player'
    const tally = tallyMltVotes(roundVotes, targets, targetKind)
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>Round results</Text>
        {tally.rows.slice(0, 5).map((row) => (
          <View key={row.playerId} style={styles.row}>
            <Text style={styles.rowName}>{row.name}</Text>
            <Text style={styles.rowScore}>{row.count} vote{row.count === 1 ? '' : 's'}</Text>
          </View>
        ))}
        {tally.winnerNames.length > 0 ? (
          <Text style={styles.winner}>Top pick: {tally.winnerNames.join(', ')}</Text>
        ) : null}
      </View>
    )
  }

  if (isThreeChoiceGame(gameType)) {
    const tallies = tallyRoundVotes(round.participant_ids ?? [], roundVotes)
    const labels = smkSlotLabels()
    const nameById = new Map(roundPeople.map((p) => [p.id, p.name]))
    const photoById = new Map(roundPeople.map((p) => [p.id, p.photo_url]))
    const sorted = [...tallies].sort(
      (a, b) => b.kiss + b.marry + b.smash - (a.kiss + a.marry + a.smash)
    )
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>Round results</Text>
        {sorted.slice(0, 5).map((row) => (
          <View key={row.id} style={styles.personRow}>
            <ParticipantAvatar name={nameById.get(row.id) ?? '?'} photoUrl={photoById.get(row.id)} size={36} />
            <View style={styles.personStats}>
              <Text style={styles.rowName}>{nameById.get(row.id) ?? 'Unknown'}</Text>
              <Text style={styles.meta}>
                {labels.kiss} {row.kiss} · {labels.marry} {row.marry} · {labels.kill} {row.smash}
              </Text>
            </View>
          </View>
        ))}
      </View>
    )
  }

  const pairLabel = pairLabels(gameType)
  const tallies = tallyRoundVotes(round.participant_ids ?? [], roundVotes)
  const nameById = new Map(roundPeople.map((p) => [p.id, p.name]))
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Round results</Text>
      {tallies.slice(0, 5).map((row) => (
        <View key={row.id} style={styles.row}>
          <Text style={styles.rowName}>{nameById.get(row.id) ?? 'Unknown'}</Text>
          <Text style={styles.meta}>
            {pairLabel.positive} {row.kiss} · {pairLabel.negative} {row.smash}
          </Text>
        </View>
      ))}
    </View>
  )
}

function ResultBar({ label, count, pct }: { label: string; count: number; pct: number }) {
  return (
    <View style={styles.barWrap}>
      <View style={styles.barHeader}>
        <Text style={styles.rowName}>{label}</Text>
        <Text style={styles.rowScore}>
          {count} ({pct}%)
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%` }]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#17171d',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  personStats: { flex: 1, gap: 2 },
  rowName: { color: '#fff', fontSize: 15, fontWeight: '600', flex: 1 },
  rowScore: { color: '#fda4af', fontWeight: '700' },
  meta: { color: '#9ca3af', fontSize: 13, textAlign: 'center' },
  winner: { color: '#fda4af', fontWeight: '700', textAlign: 'center', marginTop: 4 },
  barWrap: { gap: 6 },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  barTrack: {
    height: 8,
    backgroundColor: '#0b0b0f',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#f43f5e',
    borderRadius: 4,
  },
})
