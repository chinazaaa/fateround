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
import { pollCategoryMeta, type PollVoteCategory } from '@/components/games/poll/vote-meta'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * Highlighted recap of exactly what the current player voted this round.
 * Mirrors web "Your vote" block on the round-results screen.
 */

type Props = {
  game: Game
  gameType: GameType
  round: Round
  myVote: Vote | undefined
  participants: Participant[]
  players: Player[]
}

type RecapItem = { key: string; label: string; color?: string }

export function PollMyVoteRecap({ game, gameType, round, myVote, participants, players }: Props) {
  const styles = useThemedStyles(makeStyles)
  if (!myVote) return null

  const nameById = new Map(participants.map((p) => [p.id, p.name]))
  const roundPeople = (round.participant_ids ?? [])
    .map((id) => participants.find((p) => p.id === id))
    .filter((p): p is Participant => !!p)

  const items: RecapItem[] = []

  if (isBinaryChoiceGame(gameType) || isNeverHaveIEver(gameType)) {
    if (myVote.wyr_choice === 'a') items.push({ key: 'a', label: round.wyr_option_a ?? 'Option A' })
    else if (myVote.wyr_choice === 'b') items.push({ key: 'b', label: round.wyr_option_b ?? 'Option B' })
  } else if (isPickANumber(gameType)) {
    if (myVote.picked_number != null) items.push({ key: 'pan', label: `#${myVote.picked_number}` })
  } else if (isMostLikelyTo(gameType)) {
    const targets = mltVoteTargets(game, players, participants)
    const targetId = myVote.target_participant_id ?? myVote.target_player_id
    const target = targets.find((t) => t.id === targetId)
    if (target) items.push({ key: 'mlt', label: target.name })
  } else if (isWhoSaidThis(gameType)) {
    if (myVote.anime_choice) items.push({ key: 'wst', label: myVote.anime_choice })
    else if (myVote.target_participant_id)
      items.push({ key: 'wst', label: nameById.get(myVote.target_participant_id) ?? 'Unknown' })
  } else if (isBinaryPeoplePollGame(gameType)) {
    for (const person of roundPeople) {
      const flag = flagForParticipant(myVote, person.id)
      if (!flag) continue
      // PairFlag 'kill' maps to the 'smash' category slot; 'kiss' stays 'kiss'.
      const category: PollVoteCategory = flag === 'kill' ? 'smash' : 'kiss'
      const meta = pollCategoryMeta(gameType, category)
      items.push({ key: person.id, label: `${meta.emoji} ${meta.label}: ${person.name}`, color: meta.color })
    }
  } else if (isThreeChoiceGame(gameType)) {
    for (const slot of ['kiss', 'marry', 'smash'] as PollVoteCategory[]) {
      const participantId =
        slot === 'kiss'
          ? myVote.kiss_participant_id
          : slot === 'marry'
            ? myVote.marry_participant_id
            : myVote.kill_participant_id
      if (!participantId) continue
      const meta = pollCategoryMeta(gameType, slot)
      items.push({
        key: slot,
        label: `${meta.emoji} ${meta.label}: ${nameById.get(participantId) ?? 'Unknown'}`,
        color: meta.color,
      })
    }
  }

  if (items.length === 0) return null

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>Your vote</Text>
      <View style={styles.items}>
        {items.map((item) => (
          <Text key={item.key} style={[styles.item, item.color ? { color: item.color } : null]}>
            {item.label}
          </Text>
        ))}
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.primarySoft,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.primary,
      padding: 14,
      gap: 8,
    },
    kicker: {
      color: theme.primaryMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    items: { gap: 4 },
    item: { color: theme.text, fontSize: 15, fontWeight: '600' },
  })
