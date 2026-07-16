import { describe, expect, it } from 'vitest'
import {
  AYO_SESSION_NOT_NULL_KEYS,
  AYO_SESSION_SELECT,
  CHECKERS_SESSION_NOT_NULL_KEYS,
  CHECKERS_SESSION_SELECT,
  CHESS_SESSION_NOT_NULL_KEYS,
  CHESS_SESSION_SELECT,
  CRAZY8_HANDS_NOT_NULL_KEYS,
  CRAZY8_PLAYER_HANDS_SELECT,
  CRAZY8_SESSION_NOT_NULL_KEYS,
  CRAZY8_SESSION_SELECT,
  LUDO_PLAYER_STATE_NOT_NULL_KEYS,
  LUDO_PLAYER_STATE_SELECT,
  LUDO_SESSION_NOT_NULL_KEYS,
  LUDO_SESSION_SELECT,
  MONOPOLY_BOARD_NOT_NULL_KEYS,
  MONOPOLY_BOARD_SELECT,
  SCRABBLE_PLAYER_STATE_NOT_NULL_KEYS,
  SCRABBLE_PLAYER_STATE_SELECT,
  SCRABBLE_SESSION_NOT_NULL_KEYS,
  SCRABBLE_SESSION_SELECT,
  SNAKE_LADDER_SESSION_NOT_NULL_KEYS,
  SNAKE_LADDER_SESSION_SELECT,
  TIC_TAC_TOE_SESSION_NOT_NULL_KEYS,
  TIC_TAC_TOE_SESSION_SELECT,
  WHOT_HANDS_NOT_NULL_KEYS,
  WHOT_PLAYER_HANDS_SELECT,
  WHOT_SESSION_NOT_NULL_KEYS,
  WHOT_SESSION_SELECT,
  YAHTZEE_PLAYER_SCORES_SELECT,
  YAHTZEE_SCORES_NOT_NULL_KEYS,
  YAHTZEE_SESSION_NOT_NULL_KEYS,
  YAHTZEE_SESSION_SELECT,
} from './supabase-selects'

/**
 * The realtime delta fast-path uses these NOT-NULL key lists (via `useGameTableSync`'s
 * `requireKeys`) to detect TOAST-truncated partial payloads. If a key is ever misspelled or the
 * SELECT drops the column, the guard silently stops working. This test locks each list to its
 * SELECT so drift fails loudly.
 */
const PAIRS: [readonly string[], string, string][] = [
  [MONOPOLY_BOARD_NOT_NULL_KEYS, MONOPOLY_BOARD_SELECT, 'monopoly_boards'],
  [YAHTZEE_SESSION_NOT_NULL_KEYS, YAHTZEE_SESSION_SELECT, 'yahtzee_sessions'],
  [YAHTZEE_SCORES_NOT_NULL_KEYS, YAHTZEE_PLAYER_SCORES_SELECT, 'yahtzee_player_scores'],
  [WHOT_SESSION_NOT_NULL_KEYS, WHOT_SESSION_SELECT, 'whot_sessions'],
  [WHOT_HANDS_NOT_NULL_KEYS, WHOT_PLAYER_HANDS_SELECT, 'whot_player_hands'],
  [CRAZY8_SESSION_NOT_NULL_KEYS, CRAZY8_SESSION_SELECT, 'crazy_eights_sessions'],
  [CRAZY8_HANDS_NOT_NULL_KEYS, CRAZY8_PLAYER_HANDS_SELECT, 'crazy_eights_player_hands'],
  [LUDO_SESSION_NOT_NULL_KEYS, LUDO_SESSION_SELECT, 'ludo_sessions'],
  [LUDO_PLAYER_STATE_NOT_NULL_KEYS, LUDO_PLAYER_STATE_SELECT, 'ludo_player_state'],
  [SNAKE_LADDER_SESSION_NOT_NULL_KEYS, SNAKE_LADDER_SESSION_SELECT, 'snake_ladder_sessions'],
  [AYO_SESSION_NOT_NULL_KEYS, AYO_SESSION_SELECT, 'ayo_sessions'],
  [CHESS_SESSION_NOT_NULL_KEYS, CHESS_SESSION_SELECT, 'chess_sessions'],
  [CHECKERS_SESSION_NOT_NULL_KEYS, CHECKERS_SESSION_SELECT, 'checkers_sessions'],
  [TIC_TAC_TOE_SESSION_NOT_NULL_KEYS, TIC_TAC_TOE_SESSION_SELECT, 'tic_tac_toe_sessions'],
  [SCRABBLE_SESSION_NOT_NULL_KEYS, SCRABBLE_SESSION_SELECT, 'scrabble_sessions'],
  [SCRABBLE_PLAYER_STATE_NOT_NULL_KEYS, SCRABBLE_PLAYER_STATE_SELECT, 'scrabble_player_state'],
]

describe('realtime delta-path NOT-NULL key lists', () => {
  it.each(PAIRS)('%s keys are all present in the table SELECT', (keys, select, table) => {
    const cols = new Set(select.split(','))
    for (const key of keys) {
      expect(cols, `${table}: "${key}" missing from SELECT`).toContain(key)
    }
    expect(keys.length, `${table}: key list should not be empty`).toBeGreaterThan(0)
  })
})
