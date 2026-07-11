import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import type { Game, GameType, Participant, Round, Vote } from '@fateround/shared'
import {
  isBinaryChoiceGame,
  isMostLikelyTo,
  isNeverHaveIEver,
  isPickANumber,
  isThreeChoiceGame,
  isWhoSaidThis,
  mltVoteTargets,
} from '@fateround/shared/poll-games'
import { hotSeatPlayerDisplayName } from '@fateround/shared/hot-seat'
import { flagForParticipant, tallyMltVotes, tallyRoundVotes, tallyWyrVotes } from '@fateround/shared/vote-stats'
import { ParticipantAvatar } from '@/components/ui/ParticipantAvatar'
import { pollCategoryMeta } from '@/components/games/poll/vote-meta'
import { genderLabel } from '@/components/games/poll/gender'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  game: Game
  gameType: GameType
  round: Round
  participants: Participant[]
  votes: Vote[]
  players: import('@fateround/shared').Player[]
  /** When set, the viewer's own pick is highlighted in the distribution ("your pick"). */
  myPlayerId?: string | null
}

export function PollRoundResults({ game, gameType, round, participants, votes, players, myPlayerId = null }: Props) {
  const styles = useThemedStyles(makeStyles)
  const roundVotes = votes.filter((v) => v.round_id === round.id)
  const myVote = myPlayerId ? roundVotes.find((v) => v.player_id === myPlayerId) : undefined
  const roundPeople = round.participant_ids
    ? round.participant_ids
        .map((id) => participants.find((p) => p.id === id))
        .filter((p): p is Participant => !!p)
    : []

  // A single shared fade/slide reveal so the tally animates in without per-row cost.
  const reveal = useRef(new Animated.Value(0)).current
  useEffect(() => {
    reveal.setValue(0)
    Animated.timing(reveal, { toValue: 1, duration: 320, useNativeDriver: true }).start()
  }, [reveal, round.id])
  const revealStyle = {
    opacity: reveal,
    transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  }

  if (isPickANumber(gameType)) {
    const pickerName = hotSeatPlayerDisplayName(round.submitter_player_id ?? null, players, participants)
    const pickerVote = roundVotes.find((v) => v.player_id === round.submitter_player_id)
    const pickedNumber = pickerVote?.picked_number ?? null
    const question = round.mlt_question?.trim()
    if (!question) {
      return (
        <Animated.View style={[styles.panel, revealStyle]}>
          <Text style={styles.title}>Pick a Number</Text>
          <Text style={styles.meta}>No number picked this round</Text>
        </Animated.View>
      )
    }
    return (
      <Animated.View style={[styles.panel, revealStyle]}>
        <Text style={styles.kicker}>Pick a Number</Text>
        <Text style={styles.panPicker}>
          {pickerName}
          {pickedNumber ? ` picked #${pickedNumber}` : ' revealed a question'}
        </Text>
        <View style={styles.panQuestionBox}>
          <Text style={styles.panQuestionLabel}>Revealed question</Text>
          <Text style={styles.panQuestion}>{question}</Text>
        </View>
      </Animated.View>
    )
  }

  if (isWhoSaidThis(gameType)) {
    const anime = round.anime_metadata
    let correctLabel: string | null = null
    let correctCount = 0
    let myPickName: string | null = null
    let distribution: { key: string; name: string; count: number; isCorrect: boolean; isMine: boolean }[] = []
    if (anime) {
      correctLabel = anime.correct_character
      correctCount = roundVotes.filter((v) => v.anime_choice === anime.correct_character).length
      myPickName = myVote?.anime_choice ?? null
      distribution = anime.choices.map((choice) => ({
        key: choice,
        name: choice,
        count: roundVotes.filter((v) => v.anime_choice === choice).length,
        isCorrect: choice === anime.correct_character,
        isMine: myPickName === choice,
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
      const myTargetId = myVote?.target_participant_id ?? null
      myPickName = myTargetId ? participants.find((p) => p.id === myTargetId)?.name ?? null : null
      distribution = participants
        .map((p) => ({
          key: p.id,
          name: p.name,
          count: roundVotes.filter((v) => v.target_participant_id === p.id).length,
          isCorrect: p.id === correctId,
          isMine: p.id === myTargetId,
        }))
        .filter((row) => row.count > 0 || row.isCorrect || row.isMine)
        .sort((a, b) => b.count - a.count)
    }
    const maxCount = distribution.reduce((m, r) => Math.max(m, r.count), 0)
    const barMax = Math.max(maxCount, 1)
    const topGuesses = distribution.filter((r) => r.count === maxCount && maxCount > 0).map((r) => r.name)
    const totalVotes = anime
      ? roundVotes.filter((v) => v.anime_choice).length
      : roundVotes.filter((v) => v.target_participant_id).length
    return (
      <Animated.View style={[styles.panel, revealStyle]}>
        <Text style={styles.kicker}>Who Said This?</Text>
        {round.quote_text ? <Text style={styles.quote}>&ldquo;{round.quote_text}&rdquo;</Text> : null}
        {correctLabel ? (
          <>
            <Text style={styles.wstLabel}>{anime ? 'Said by' : 'Actually said by'}</Text>
            <Text style={styles.wstAnswer}>{correctLabel}</Text>
            <Text style={styles.meta}>
              {correctCount} of {totalVotes} guessed right
            </Text>
            {topGuesses.length > 0 ? (
              <Text style={styles.topGuess}>
                Top guess{topGuesses.length > 1 ? 'es' : ''}: {topGuesses.join(', ')} ({maxCount} vote
                {maxCount === 1 ? '' : 's'})
              </Text>
            ) : null}
            {distribution.length > 0 ? (
              <View style={styles.wstDistribution}>
                {distribution.map((row) => {
                  const pct = Math.min((row.count / barMax) * 100, 100)
                  return (
                    <View
                      key={row.key}
                      style={[
                        styles.wstRow,
                        row.isCorrect && styles.wstRowCorrect,
                        !row.isCorrect && row.isMine && styles.wstRowMine,
                      ]}
                    >
                      <View style={styles.row}>
                        <Text style={[styles.rowName, row.isCorrect && styles.rowNameCorrect]} numberOfLines={1}>
                          {row.isCorrect ? '✓ ' : ''}
                          {row.name}
                          {row.isMine ? '  · you' : ''}
                        </Text>
                        <Text style={styles.rowScore}>{row.count}</Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            { width: `${pct}%` },
                            row.isCorrect ? styles.barFillCorrect : styles.barFillNeutral,
                          ]}
                        />
                      </View>
                    </View>
                  )
                })}
              </View>
            ) : null}
            {myPickName ? <Text style={styles.youGuessed}>You guessed {myPickName}</Text> : null}
          </>
        ) : (
          <Text style={styles.meta}>Answer not revealed</Text>
        )}
      </Animated.View>
    )
  }

  if (isBinaryChoiceGame(gameType) || isNeverHaveIEver(gameType)) {
    const tally = tallyWyrVotes(roundVotes)
    const total = Math.max(tally.voterCount, 1)
    const pctA = Math.round((tally.countA / total) * 100)
    const pctB = Math.round((tally.countB / total) * 100)
    const nhie = isNeverHaveIEver(gameType)
    const labelA = nhie ? '✋ I have' : round.wyr_option_a ?? 'Option A'
    const labelB = nhie ? "🙅 I haven't" : round.wyr_option_b ?? 'Option B'
    const statement = round.mlt_question?.trim()
    const question =
      round.wyr_option_a && round.wyr_option_b ? `${round.wyr_option_a} or ${round.wyr_option_b}?` : null
    return (
      <Animated.View style={[styles.panel, revealStyle]}>
        <Text style={styles.title}>{nhie ? 'Results are in! 🙈' : 'Round results'}</Text>
        {nhie && statement ? (
          <Text style={styles.restated}>Never have I ever {statement}</Text>
        ) : !nhie && question ? (
          <Text style={styles.restated}>{question}</Text>
        ) : null}
        <ResultBar
          label={labelA}
          count={tally.countA}
          pct={pctA}
          mine={myVote?.wyr_choice === 'a'}
          winner={tally.countA > tally.countB}
        />
        <ResultBar
          label={labelB}
          count={tally.countB}
          pct={pctB}
          mine={myVote?.wyr_choice === 'b'}
          winner={tally.countB > tally.countA}
        />
        <Text style={styles.meta}>{tally.voterCount} vote{tally.voterCount === 1 ? '' : 's'}</Text>
      </Animated.View>
    )
  }

  if (isMostLikelyTo(gameType)) {
    const targets = mltVoteTargets(game, players, participants)
    const targetKind = targets[0]?.kind === 'participant' ? 'participant' : 'player'
    const tally = tallyMltVotes(roundVotes, targets, targetKind)
    const myTargetId = myVote?.target_participant_id ?? myVote?.target_player_id ?? null
    const myPickName = myTargetId ? targets.find((t) => t.id === myTargetId)?.name ?? null : null
    const totalVotes = roundVotes.filter((v) => v.target_participant_id || v.target_player_id).length
    const maxCount = tally.rows.reduce((m, r) => Math.max(m, r.count), 0)
    const barMax = Math.max(maxCount, 1)
    return (
      <Animated.View style={[styles.panel, revealStyle]}>
        <Text style={styles.title}>
          Round results · {totalVotes} vote{totalVotes === 1 ? '' : 's'}
        </Text>
        {tally.winnerNames.length > 0 && maxCount > 0 ? (
          <View style={styles.winnerCard}>
            <Text style={styles.winnerCardLabel}>Most likely</Text>
            <Text style={styles.winnerCardName}>{tally.winnerNames.join(', ')}</Text>
            <Text style={styles.winnerCardCount}>
              {maxCount} vote{maxCount === 1 ? '' : 's'}
            </Text>
          </View>
        ) : null}
        {tally.rows.slice(0, 5).map((row) => {
          const isMine = row.playerId === myTargetId
          const isWinner = row.count === maxCount && maxCount > 0
          const pct = Math.min((row.count / barMax) * 100, 100)
          return (
            <View key={row.playerId} style={[styles.barWrap, isMine && styles.barWrapMine]}>
              <View style={styles.barHeader}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {row.name}
                  {isMine ? '  · you' : ''}
                </Text>
                <Text style={styles.rowScore}>
                  {row.count} vote{row.count === 1 ? '' : 's'}
                </Text>
              </View>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${pct}%` },
                    isWinner ? styles.barFillWinner : styles.barFillNeutral,
                  ]}
                />
              </View>
            </View>
          )
        })}
        {myPickName ? <Text style={styles.youGuessed}>You picked {myPickName}</Text> : null}
      </Animated.View>
    )
  }

  if (isThreeChoiceGame(gameType)) {
    const tallies = tallyRoundVotes(round.participant_ids ?? [], roundVotes)
    const kissMeta = pollCategoryMeta(gameType, 'kiss')
    const marryMeta = pollCategoryMeta(gameType, 'marry')
    const killMeta = pollCategoryMeta(gameType, 'smash')
    const nameById = new Map(roundPeople.map((p) => [p.id, p.name]))
    const photoById = new Map(roundPeople.map((p) => [p.id, p.photo_url]))
    const sorted = [...tallies].sort(
      (a, b) => b.kiss + b.marry + b.smash - (a.kiss + a.marry + a.smash)
    )
    return (
      <Animated.View style={[styles.panel, revealStyle]}>
        <Text style={styles.title}>Round results</Text>
        {sorted.slice(0, 5).map((row) => (
          <View key={row.id} style={styles.personRow}>
            <ParticipantAvatar name={nameById.get(row.id) ?? '?'} photoUrl={photoById.get(row.id)} size={36} />
            <View style={styles.personStats}>
              <Text style={styles.rowName}>{nameById.get(row.id) ?? 'Unknown'}</Text>
              <Text style={styles.meta}>
                {kissMeta.emoji} {kissMeta.label} {row.kiss} · {marryMeta.emoji} {marryMeta.label} {row.marry} ·{' '}
                {killMeta.emoji} {killMeta.label} {row.smash}
              </Text>
            </View>
          </View>
        ))}
      </Animated.View>
    )
  }

  // Binary people polls (Smash or Pass, Red/Green Flag, Parent Approval) — a rich
  // per-person card: avatar, gender, your pick, and a stat tile per flag with a
  // colored vote bar and a "Winner" badge on whichever flag won.
  const posMeta = pollCategoryMeta(gameType, 'kiss')
  const negMeta = pollCategoryMeta(gameType, 'smash')
  const pairTallies = tallyRoundVotes(round.participant_ids ?? [], roundVotes)
  const nameById = new Map(roundPeople.map((p) => [p.id, p.name]))
  const genderById = new Map(roundPeople.map((p) => [p.id, p.gender]))
  const photoById = new Map(roundPeople.map((p) => [p.id, p.photo_url]))
  const sortedPairs = [...pairTallies].sort((a, b) => b.kiss + b.smash - (a.kiss + a.smash))
  return (
    <Animated.View style={[styles.panel, revealStyle]}>
      <Text style={styles.title}>Round results</Text>
      {sortedPairs.map((row) => {
        const myFlag = myVote ? flagForParticipant(myVote, row.id) : null
        const posWins = row.kiss > row.smash
        const negWins = row.smash > row.kiss
        const total = Math.max(row.kiss + row.smash, 1)
        const gender = genderById.get(row.id)
        return (
          <View
            key={row.id}
            style={[
              styles.pairCard,
              myFlag === 'kiss' && { borderColor: posMeta.color },
              myFlag === 'kill' && { borderColor: negMeta.color },
            ]}
          >
            <View style={styles.pairHeader}>
              <ParticipantAvatar name={nameById.get(row.id) ?? '?'} photoUrl={photoById.get(row.id)} size={36} />
              <View style={styles.pairHeaderText}>
                <Text style={styles.rowName}>{nameById.get(row.id) ?? 'Unknown'}</Text>
                {gender ? <Text style={styles.pairGender}>{genderLabel(gender)}</Text> : null}
              </View>
              {myFlag ? (
                <Text style={styles.pairYou}>
                  You: {myFlag === 'kiss' ? posMeta.emoji : negMeta.emoji}
                </Text>
              ) : null}
            </View>
            <View style={styles.pairStats}>
              <PairStat
                meta={posMeta}
                count={row.kiss}
                pct={Math.round((row.kiss / total) * 100)}
                winner={posWins}
              />
              <PairStat
                meta={negMeta}
                count={row.smash}
                pct={Math.round((row.smash / total) * 100)}
                winner={negWins}
              />
            </View>
          </View>
        )
      })}
    </Animated.View>
  )
}

function PairStat({
  meta,
  count,
  pct,
  winner,
}: {
  meta: { emoji: string; label: string; color: string }
  count: number
  pct: number
  winner: boolean
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.pairStat}>
      <View style={styles.pairStatHeader}>
        <Text style={[styles.pairStatLabel, { color: meta.color }]} numberOfLines={1}>
          {meta.emoji} {meta.label}
        </Text>
        {winner ? <Text style={styles.pairWinnerBadge}>Winner</Text> : null}
      </View>
      <Text style={styles.pairStatCount}>
        {count} ({pct}%)
      </Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: meta.color }]} />
      </View>
    </View>
  )
}

function ResultBar({
  label,
  count,
  pct,
  mine,
  winner,
}: {
  label: string
  count: number
  pct: number
  mine?: boolean
  winner?: boolean
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={[styles.barWrap, mine && styles.barWrapMine]}>
      <View style={styles.barHeader}>
        <Text style={[styles.rowName, winner && styles.rowNameWinner]} numberOfLines={2}>
          {label}
          {mine ? '  · your pick' : ''}
        </Text>
        <View style={styles.barHeaderRight}>
          {winner ? <Text style={styles.pairWinnerBadge}>Winner</Text> : null}
          <Text style={styles.rowScore}>
            {count} ({pct}%)
          </Text>
        </View>
      </View>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { width: `${pct}%` },
            winner ? styles.barFillWinner : mine ? styles.barFillMine : styles.barFillNeutral,
          ]}
        />
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
  restated: { color: theme.textMuted, fontSize: 15, fontWeight: '600', textAlign: 'center', lineHeight: 22 },
  quote: { color: theme.text, fontSize: 16, fontStyle: 'italic', textAlign: 'center', lineHeight: 24 },
  winnerCard: {
    backgroundColor: theme.primarySoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.primary,
    padding: 12,
    alignItems: 'center',
    gap: 2,
  },
  winnerCardLabel: {
    color: theme.primaryMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  winnerCardName: { color: theme.text, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  winnerCardCount: { color: theme.textMuted, fontSize: 13 },
  pairCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.bg,
    padding: 12,
    gap: 10,
  },
  pairHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pairHeaderText: { flex: 1, gap: 2 },
  pairGender: { color: theme.textFaint, fontSize: 12 },
  pairYou: { color: theme.text, fontSize: 14, fontWeight: '700' },
  pairStats: { flexDirection: 'row', gap: 8 },
  pairStat: { flex: 1, gap: 4 },
  pairStatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  pairStatLabel: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  pairStatCount: { color: theme.textMuted, fontSize: 12 },
  pairWinnerBadge: {
    color: '#052e16',
    backgroundColor: '#4ade80',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  wstLabel: {
    color: theme.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
  },
  wstAnswer: { color: theme.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  topGuess: { color: theme.textFaint, fontSize: 12, textAlign: 'center' },
  wstDistribution: { gap: 8, marginTop: 8 },
  wstRow: {
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  wstRowCorrect: { borderColor: '#2dd4bf', backgroundColor: theme.primarySoft },
  wstRowMine: { borderColor: theme.primary },
  rowNameCorrect: { color: '#86efac', fontWeight: '700' },
  rowNameWinner: { color: theme.text, fontWeight: '800' },
  barHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  youGuessed: { color: theme.textFaint, fontSize: 12, textAlign: 'center', marginTop: 2 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  rowMine: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: theme.primarySoft,
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
  barWrapMine: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: theme.primarySoft,
  },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  barTrack: {
    height: 8,
    backgroundColor: theme.bg,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  barFillNeutral: { backgroundColor: '#64748b' },
  barFillCorrect: { backgroundColor: '#2dd4bf' },
  barFillMine: { backgroundColor: theme.primary },
  barFillWinner: { backgroundColor: '#f59e0b' },
})
