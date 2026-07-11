import type { Game, GameType, ParticipantGender, Player, PlayerGender } from '@fateround/shared'
import { isBinaryPeoplePollGame, isThreeChoiceGame, parseGameType } from '@fateround/shared/poll-games'

/**
 * Gender-voting helpers ported from web `src/lib/participants.ts` + `src/lib/gender-based.ts`.
 * Colocated with the poll views to avoid touching shared packages.
 */

/** Games where rounds are same-gender and players vote by opposite-gender rules. */
export function supportsGenderToggle(gameType: GameType | string | undefined): boolean {
  return isThreeChoiceGame(gameType) || isBinaryPeoplePollGame(gameType)
}

/** Whether this game runs gender-based rounds (vs names-only). */
export function isGameGenderBased(game: Pick<Game, 'game_type' | 'gender_based'>): boolean {
  if (!supportsGenderToggle(game.game_type)) return false
  if (game.gender_based !== undefined && game.gender_based !== null) return game.gender_based
  return true
}

/** Rounds and voting ignore gender (names-only mode). */
export function isGenderFreeVoting(game: Pick<Game, 'game_type' | 'gender_based'>): boolean {
  if (!supportsGenderToggle(game.game_type)) return true
  return !isGameGenderBased(game)
}

export function genderLabel(gender: ParticipantGender): string {
  return gender === 'male' ? 'Male' : 'Female'
}

/** Player's vote preference from the join controls. */
export function playerGenderFromJoin(identity: ParticipantGender, voteBoth: boolean): PlayerGender {
  return voteBoth ? 'both' : identity
}

export function joinGenderHint(identity: ParticipantGender, voteBoth: boolean): string {
  if (voteBoth) return "You'll vote on both men's and women's rounds"
  const opposite = identity === 'male' ? "women's" : "men's"
  return `${genderLabel(identity)} — you vote on the ${opposite} rounds`
}

/** The single gender of the round's participants, or null if mixed/empty. */
export function getRoundParticipantGender(
  participantIds: string[],
  participants: { id: string; gender: ParticipantGender | string }[]
): ParticipantGender | null {
  const genders = participantIds
    .map((id) => {
      const p = participants.find((item) => item.id === id)
      if (!p) return null
      return p.gender === 'male' || p.gender === 'female' ? (p.gender as ParticipantGender) : null
    })
    .filter((g): g is ParticipantGender => g !== null)
  const unique = [...new Set(genders)]
  if (unique.length !== 1) return null
  return unique[0]
}

/** Opposite gender votes; `both` votes on every round. */
export function canPlayerVoteInRound(playerGender: PlayerGender, roundGender: ParticipantGender): boolean {
  if (playerGender === 'both') return true
  return playerGender !== roundGender
}

export function roundVoterLabel(roundGender: ParticipantGender | null): string | null {
  if (roundGender === 'male') return "Men's list — women & both vote now"
  if (roundGender === 'female') return "Women's list — men & both vote now"
  return null
}

export function activeVoteBanner(playerGender: PlayerGender | null | undefined): string | null {
  if (!playerGender) return null
  if (playerGender === 'both') return 'You vote on both genders'
  return "You're voting this round"
}

export function spectatorMessage(
  roundGender: ParticipantGender | null,
  playerGender?: PlayerGender | null
): string {
  if (playerGender === 'both') return ''
  if (!roundGender || !playerGender) return "You're spectating this round."
  if (playerGender === roundGender) {
    const thisRound = roundGender === 'male' ? "men's" : "women's"
    return `This is the ${thisRound} round — as ${genderLabel(playerGender).toLowerCase()} you sit this one out.`
  }
  return ''
}

/** Resolve the player's effective voting gender, falling back to a claimed participant. */
export function effectivePlayerGender(
  me: Player | undefined,
  participants: { id: string; gender: ParticipantGender | string }[]
): PlayerGender {
  const g = me?.gender
  if (g === 'both' || g === 'male' || g === 'female') return g
  if (me?.participant_id) {
    const part = participants.find((p) => p.id === me.participant_id)
    if (part && (part.gender === 'male' || part.gender === 'female')) return part.gender as ParticipantGender
  }
  return 'both'
}

export function pollGameTypeIsGendered(gameType: GameType | string | undefined): boolean {
  return supportsGenderToggle(parseGameType(gameType))
}
