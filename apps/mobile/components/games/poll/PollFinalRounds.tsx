import { StyleSheet, Text, View } from 'react-native'
import type { Game, GameType, Participant, Player, Round, Vote } from '@fateround/shared'
import {
  isBinaryChoiceGame,
  isBinaryPeoplePollGame,
  isMostLikelyTo,
  isNeverHaveIEver,
  isPickANumber,
  isThreeChoiceGame,
  isWhoSaidThis,
  mltVoteTargets,
} from '@fateround/shared/poll-games'
import { flagForParticipant } from '@fateround/shared/vote-stats'
import { PollRoundResults } from '@/components/games/poll/PollRoundResults'
import { getRoundParticipantGender, genderLabel, isGenderFreeVoting } from '@/components/games/poll/gender'
import { pollCategoryMeta } from '@/components/games/poll/vote-meta'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  game: Game
  gameType: GameType
  rounds: Round[]
  participants: Participant[]
  votes: Vote[]
  players: Player[]
  myPlayerId: string | null
}

/** Replays every round's tally + the player's own pick. Mirrors web "All round results". */
export function PollFinalRounds({ game, gameType, rounds, participants, votes, players, myPlayerId }: Props) {
  const styles = useThemedStyles(makeStyles)
  if (rounds.length === 0) return null

  const nameById = new Map(participants.map((p) => [p.id, p.name]))

  const yourVoteChips = (round: Round): string[] => {
    const myVote = votes.find((v) => v.round_id === round.id && v.player_id === myPlayerId)
    if (!myVote) return []
    if (isPickANumber(gameType)) return []
    if (isBinaryChoiceGame(gameType) || isNeverHaveIEver(gameType)) {
      const nhie = isNeverHaveIEver(gameType)
      if (myVote.wyr_choice === 'a') return [nhie ? '✋ I have' : round.wyr_option_a ?? 'Option A']
      if (myVote.wyr_choice === 'b') return [nhie ? "🙅 I haven't" : round.wyr_option_b ?? 'Option B']
      return []
    }
    if (isMostLikelyTo(gameType)) {
      const targets = mltVoteTargets(game, players, participants)
      const id = myVote.target_participant_id ?? myVote.target_player_id
      const name = targets.find((t) => t.id === id)?.name
      return name ? [name] : []
    }
    if (isWhoSaidThis(gameType)) {
      if (myVote.anime_choice) return [myVote.anime_choice]
      const name = myVote.target_participant_id ? nameById.get(myVote.target_participant_id) : undefined
      return name ? [name] : []
    }
    if (isBinaryPeoplePollGame(gameType)) {
      const chips: string[] = []
      for (const id of round.participant_ids ?? []) {
        const flag = flagForParticipant(myVote, id)
        if (!flag) continue
        const meta = pollCategoryMeta(gameType, flag === 'kiss' ? 'kiss' : 'smash')
        chips.push(`${nameById.get(id) ?? '?'}: ${meta.emoji}`)
      }
      return chips
    }
    if (isThreeChoiceGame(gameType)) {
      const chips: string[] = []
      const slots: [PollSlot, string | null | undefined][] = [
        ['kiss', myVote.kiss_participant_id],
        ['marry', myVote.marry_participant_id],
        ['smash', myVote.kill_participant_id],
      ]
      for (const [slot, id] of slots) {
        if (!id) continue
        const meta = pollCategoryMeta(gameType, slot)
        chips.push(`${meta.emoji} ${nameById.get(id) ?? '?'}`)
      }
      return chips
    }
    return []
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>All round results</Text>
      {rounds.map((round) => {
        const roundGender =
          isGenderFreeVoting(game) ? null : getRoundParticipantGender(round.participant_ids ?? [], participants)
        const chips = yourVoteChips(round)
        return (
          <View key={round.id} style={styles.roundBlock}>
            <Text style={styles.roundLabel}>
              Round {round.round_number}
              {roundGender ? ` · ${genderLabel(roundGender)}` : ''}
            </Text>
            {chips.length > 0 ? (
              <View style={styles.yourVote}>
                <Text style={styles.yourVoteLabel}>Your vote</Text>
                <View style={styles.chipRow}>
                  {chips.map((chip, i) => (
                    <Text key={i} style={styles.chip}>
                      {chip}
                    </Text>
                  ))}
                </View>
              </View>
            ) : null}
            <PollRoundResults
              game={game}
              gameType={gameType}
              round={round}
              participants={participants}
              votes={votes}
              players={players}
            />
          </View>
        )
      })}
    </View>
  )
}

type PollSlot = 'kiss' | 'marry' | 'smash'

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: 14 },
    heading: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    roundBlock: { gap: 8 },
    roundLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    yourVote: {
      backgroundColor: theme.primarySoft,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 10,
      gap: 6,
    },
    yourVoteLabel: {
      color: theme.textMuted,
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { color: theme.text, fontSize: 14, fontWeight: '600' },
  })
