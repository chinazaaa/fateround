import { StyleSheet, Text, View } from 'react-native'
import type { Game, GameType, Participant, Round, Vote } from '@fateround/shared'
import {
  isBinaryChoiceGame,
  isMostLikelyTo,
  isNeverHaveIEver,
  isPickANumber,
  isThreeChoiceGame,
  isWhoSaidThis,
  mltVoteTargets,
  pairLabels,
  smkSlotLabels,
} from '@fateround/shared/poll-games'
import { hotSeatPlayerDisplayName } from '@fateround/shared/hot-seat'
import { tallyMltVotes, tallyRoundVotes, tallyWyrVotes } from '@fateround/shared/vote-stats'
import { ParticipantAvatar } from '@/components/ui/ParticipantAvatar'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  game: Game
  gameType: GameType
  round: Round
  participants: Participant[]
  votes: Vote[]
  players: import('@fateround/shared').Player[]
}

export function PollRoundResults({ game, gameType, round, participants, votes, players }: Props) {
  const styles = useThemedStyles(makeStyles)
  const roundVotes = votes.filter((v) => v.round_id === round.id)
  const roundPeople = round.participant_ids
    ? round.participant_ids
        .map((id) => participants.find((p) => p.id === id))
        .filter((p): p is Participant => !!p)
    : []

  if (isPickANumber(gameType)) {
    const pickerName = hotSeatPlayerDisplayName(round.submitter_player_id ?? null, players, participants)
    const pickerVote = roundVotes.find((v) => v.player_id === round.submitter_player_id)
    const pickedNumber = pickerVote?.picked_number ?? null
    const question = round.mlt_question?.trim()
    if (!question) {
      return (
        <View style={styles.panel}>
          <Text style={styles.title}>Pick a Number</Text>
          <Text style={styles.meta}>No number picked this round</Text>
        </View>
      )
    }
    return (
      <View style={styles.panel}>
        <Text style={styles.kicker}>Pick a Number</Text>
        <Text style={styles.panPicker}>
          {pickerName}
          {pickedNumber ? ` picked #${pickedNumber}` : ' revealed a question'}
        </Text>
        <View style={styles.panQuestionBox}>
          <Text style={styles.panQuestionLabel}>Revealed question</Text>
          <Text style={styles.panQuestion}>{question}</Text>
        </View>
      </View>
    )
  }

  if (isWhoSaidThis(gameType)) {
    const anime = round.anime_metadata
    let correctLabel: string | null = null
    let correctCount = 0
    let distribution: { key: string; name: string; count: number; isCorrect: boolean }[] = []
    if (anime) {
      correctLabel = anime.correct_character
      correctCount = roundVotes.filter((v) => v.anime_choice === anime.correct_character).length
      distribution = anime.choices.map((choice) => ({
        key: choice,
        name: choice,
        count: roundVotes.filter((v) => v.anime_choice === choice).length,
        isCorrect: choice === anime.correct_character,
      }))
    } else {
      const correctId =
        round.quote_author_participant_id ??
        players.find((p) => p.id === round.submitter_player_id)?.participant_id ??
        null
      if (correctId) {
        correctLabel = participants.find((p) => p.id === correctId)?.name ?? 'Unknown'
        correctCount = roundVotes.filter((v) => v.target_participant_id === correctId).length
      }
      distribution = participants
        .map((p) => ({
          key: p.id,
          name: p.name,
          count: roundVotes.filter((v) => v.target_participant_id === p.id).length,
          isCorrect: p.id === correctId,
        }))
        .filter((row) => row.count > 0 || row.isCorrect)
        .sort((a, b) => b.count - a.count)
    }
    return (
      <View style={styles.panel}>
        <Text style={styles.kicker}>Who Said This?</Text>
        {round.quote_text ? <Text style={styles.quote}>&ldquo;{round.quote_text}&rdquo;</Text> : null}
        {correctLabel ? (
          <>
            <Text style={styles.wstLabel}>Correct answer</Text>
            <Text style={styles.wstAnswer}>{correctLabel}</Text>
            <Text style={styles.meta}>
              {correctCount} guessed right of {roundVotes.length} vote{roundVotes.length === 1 ? '' : 's'}
            </Text>
            {distribution.length > 0 ? (
              <View style={styles.wstDistribution}>
                {distribution.map((row) => (
                  <View key={row.key} style={styles.row}>
                    <Text style={[styles.rowName, row.isCorrect && styles.rowNameCorrect]}>
                      {row.isCorrect ? '✓ ' : ''}
                      {row.name}
                    </Text>
                    <Text style={styles.rowScore}>
                      {row.count} guess{row.count === 1 ? '' : 'es'}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <Text style={styles.meta}>Answer not revealed</Text>
        )}
      </View>
    )
  }

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
  const styles = useThemedStyles(makeStyles)
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

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  panel: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  title: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  kicker: {
    color: theme.primaryMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
  },
  panPicker: { color: theme.text, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  panQuestionBox: {
    backgroundColor: theme.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
  },
  panQuestionLabel: {
    color: theme.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 6,
  },
  panQuestion: { color: theme.text, fontSize: 16, fontWeight: '600', textAlign: 'center', lineHeight: 22 },
  quote: { color: theme.text, fontSize: 16, fontStyle: 'italic', textAlign: 'center', lineHeight: 24 },
  wstLabel: {
    color: theme.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
  },
  wstAnswer: { color: theme.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  wstDistribution: { gap: 6, marginTop: 8 },
  rowNameCorrect: { color: '#86efac', fontWeight: '700' },
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
  rowName: { color: theme.text, fontSize: 15, fontWeight: '600', flex: 1 },
  rowScore: { color: theme.primaryMuted, fontWeight: '700' },
  meta: { color: theme.textMuted, fontSize: 13, textAlign: 'center' },
  winner: { color: theme.primaryMuted, fontWeight: '700', textAlign: 'center', marginTop: 4 },
  barWrap: { gap: 6 },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  barTrack: {
    height: 8,
    backgroundColor: theme.bg,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: theme.primary,
    borderRadius: 4,
  },
})
