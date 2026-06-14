import { customPairVoteModeOptions, getCustomSlots, isCustomTwoSlotGame } from '@/lib/custom-game'
import { isGameGenderBased, supportsGenderToggle } from '@/lib/gender-based'
import {
  isCustomGame,
  isHotSeat,
  isPairGame,
  isWhoSaidThis,
  isWouldYouRather,
  isThisOrThat,
  isAnonymousMessagesGame,
  parseGameType,
  parsePairVoteMode,
  pairVoteModeOptions,
} from '@/lib/game-types'
import { isImportClaimMode, isJoinersPollMode, isVoterOnlyMode } from '@/lib/participant-mode'
import { anonymousRoomMaxPlayers } from '@/lib/anonymous-messages'
import type { Game } from '@/types'

export type LobbySummaryChip = {
  key: string
  label: string
  emoji?: string
}

/** Short player-facing label for how people join / who is in the poll. */
export function participantModeLobbyLabel(game: Pick<Game, 'participant_mode' | 'game_type'>): string | null {
  const type = parseGameType(game.game_type)
  if (isAnonymousMessagesGame(type)) return 'Auto-assigned lobby names — shown on messages'
  if (isWouldYouRather(type) || isThisOrThat(type)) return null
  if (isWhoSaidThis(type) || isHotSeat(type)) return 'Claim your name from the list'
  if (isJoinersPollMode(game)) return 'Join & play — you’re in the poll'
  if (isVoterOnlyMode(game)) return 'Vote on the imported list'
  if (isImportClaimMode(game)) return 'Claim your name from the list'
  return null
}

function pairVoteChip(game: Game): LobbySummaryChip | null {
  const type = parseGameType(game.game_type)
  const mode = parsePairVoteMode(game.pair_vote_mode)

  if (isCustomTwoSlotGame(game)) {
    const slots = getCustomSlots(game)
    const opt = customPairVoteModeOptions(slots).find((o) => o.value === mode)
    return { key: 'pair-vote', label: opt?.label ?? (mode === 'one_each' ? 'One each' : 'Any combo') }
  }

  if (isPairGame(type)) {
    const opt = pairVoteModeOptions(type).find((o) => o.value === mode)
    return { key: 'pair-vote', label: opt?.label ?? (mode === 'one_each' ? 'One each' : 'Any combo') }
  }

  return null
}

/** Chips for the player waiting / join lobby — slots, mode, rules. */
export function gameLobbySummaryChips(game: Game): LobbySummaryChip[] {
  const chips: LobbySummaryChip[] = []
  const type = parseGameType(game.game_type)

  if (isAnonymousMessagesGame(type)) {
    chips.push({
      key: 'room-capacity',
      label: `Up to ${anonymousRoomMaxPlayers(game)} players`,
      emoji: '👥',
    })
  }

  if (isCustomGame(type)) {
    for (const slot of getCustomSlots(game)) {
      if (!slot.label.trim()) continue
      chips.push({ key: `slot-${slot.key}`, label: slot.label.trim(), emoji: slot.emoji || undefined })
    }
  }

  const modeLabel = participantModeLobbyLabel(game)
  if (modeLabel) {
    chips.push({ key: 'participant-mode', label: modeLabel })
  }

  if (supportsGenderToggle(type)) {
    chips.push({
      key: 'rounds-style',
      label: isGameGenderBased(game) ? 'Gender-based rounds' : 'Names only',
    })
  }

  const pairChip = pairVoteChip(game)
  if (pairChip) chips.push(pairChip)

  return chips
}

/** Custom game display title when the host set one. */
export function customGameDisplayTitle(game: Game): string | null {
  if (!isCustomGame(game.game_type)) return null
  const title = game.custom_slots?.title?.trim()
  if (!title || title.toLowerCase() === 'custom game') return null
  return title
}
