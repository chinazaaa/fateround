import { describe, it, expect } from 'vitest'
import type { GameType } from '@/types'
import { GAME_TYPE_CONFIG, isNameOnlyPlayerJoin, isLobbyGame } from './game-types'

// Canonical game list (the coverage test derives from the same source).
const ALL_GAME_TYPES = Object.keys(GAME_TYPE_CONFIG) as GameType[]

// The exact membership of the *original* hand-written OR-lists, transcribed independently
// of the new Record maps. If a map value drifts from the pre-refactor behaviour, these fail.
const NAME_ONLY_PLAYER_JOIN_EXPECTED = new Set<GameType>([
  'would_you_rather',
  'never_have_i_ever',
  'pick_a_number',
  'this_or_that',
  'most_likely_to',
  'trivia',
  'two_truths',
  'monopoly',
  'yahtzee',
  'whot',
  'crazy_eights',
  'ludo',
  'mahjong',
  'i_call_on',
  'sudoku',
  'tic_tac_toe',
  'word_hunt',
  'chess',
  'checkers',
  'describe_it',
])

const LOBBY_GAMES_EXPECTED = new Set<GameType>([
  'would_you_rather',
  'never_have_i_ever',
  'pick_a_number',
  'this_or_that',
  'anonymous_messages',
  'secret_message',
])

describe('game join-style flags (registry-backed, behaviour-preserving)', () => {
  it('covers every game type (>= 30)', () => {
    expect(ALL_GAME_TYPES.length).toBeGreaterThanOrEqual(30)
  })

  it('isNameOnlyPlayerJoin matches the original OR-list for every game', () => {
    for (const g of ALL_GAME_TYPES) {
      expect(isNameOnlyPlayerJoin(g)).toBe(NAME_ONLY_PLAYER_JOIN_EXPECTED.has(g))
    }
  })

  it('isLobbyGame matches the original OR-list for every game', () => {
    for (const g of ALL_GAME_TYPES) {
      expect(isLobbyGame(g)).toBe(LOBBY_GAMES_EXPECTED.has(g))
    }
  })

  it('normalizes aliases + unknown input the same way the predicates always did', () => {
    // parseGameType maps unknowns to the default type; both stay false there.
    expect(isNameOnlyPlayerJoin('totally-not-a-game')).toBe(false)
    expect(isLobbyGame(undefined)).toBe(false)
    // A known public alias still resolves (text-charades -> describe_it, which is name-only).
    expect(isNameOnlyPlayerJoin('text-charades')).toBe(true)
  })
})
