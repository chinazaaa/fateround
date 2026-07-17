import { describe, it, expect } from 'vitest'
import type { GameType } from '@/types'
import { GAME_TYPE_CONFIG, isNameOnlyPlayerJoin, isLobbyGame } from './game-types'

// Canonical game list (the coverage test derives from the same source).
const ALL_GAME_TYPES = Object.keys(GAME_TYPE_CONFIG) as GameType[]

// The intended name-only-join set. Includes scrabble + snake_and_ladder — board games that
// self-join by name; when they were omitted their players were wrongly sent down the
// gender-required participant join path. Transcribed independently of the Record maps, so any
// drift from this intended behaviour fails here.
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
  'ayo',
  'describe_it',
  'word_rush',
  // Board games that self-join by name like every other board game.
  'scrabble',
  'snake_and_ladder',
  // matching_pairs self-joins by name; mafia does not.
  'matching_pairs',
  'quiplash',
  'quick_draw',
  'crossword',
  'word_search',
  'word_scramble',
  'landmine',
  'ping_pong',
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
  it('anchors the exact game-type count so a silent add/remove fails loudly', () => {
    // Exact count, not a floor: adding or removing a GameType must update this test + the
    // maps below in lockstep. (A swap is also caught per-game by the assertions below and by
    // the canonical-list guard in game-type-coverage.test.ts.)
    expect(ALL_GAME_TYPES.length).toBe(44)
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
