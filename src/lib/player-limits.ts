/**
 * Per-game lobby player limits — MIN / MAX / DEFAULT, as plain data.
 *
 * This module exists to break an import cycle, and its one rule is that it must stay a LEAF:
 * it imports nothing from `@/lib` except other leaves, and nothing at all that reaches
 * `@/lib/game-finish`. Adding such an import re-creates the cycle below.
 *
 * The cycle these constants used to close:
 *
 *   game-finish -> trophies/round-facts -> trophies/game-facts -> lib/troll-run
 *     -> lib/viewers -> lib/game-limits -> lib/ludo -> game-finish
 *
 * `game-limits` imported 109 constants from 37 game modules, and 20 of those modules import
 * `game-finish` for `markGameFinished`. So evaluating `game-finish` re-entered `game-limits`
 * before its imports had initialised, and reading LUDO_MIN_PLAYERS threw
 * "Cannot access 'LUDO_MIN_PLAYERS' before initialization" — taking out /api/games entirely.
 *
 * The constants were never the problem; where they lived was. They are pure data, so moving them
 * to a leaf removes the edge without changing a single value. Each game module now re-exports its
 * own from here, so every existing `import { X } from '@/lib/<game>'` still resolves.
 */

// anonymous-messages
export const ANONYMOUS_ROOM_DEFAULT_MAX_PLAYERS = 20
export const ANONYMOUS_ROOM_MAX_PLAYERS = 20
export const ANONYMOUS_ROOM_MIN_PLAYERS = 2

// bingo
export const BINGO_DEFAULT_MAX_PLAYERS = 20
export const BINGO_MAX_PLAYERS = 30
export const BINGO_MIN_PLAYERS = 2

// codewords
export const CODEWORDS_DEFAULT_MAX_PLAYERS = 8
export const CODEWORDS_MAX_PLAYERS = 20
export const CODEWORDS_MIN_PLAYERS = 4

// trivia
export const TRIVIA_DEFAULT_MAX_PLAYERS = 30
export const TRIVIA_MAX_PLAYERS = 40
export const TRIVIA_MIN_PLAYERS = 2

// two-truths
export const TTL_DEFAULT_MAX_PLAYERS = 20
export const TTL_MAX_PLAYERS = 40
export const TTL_MIN_PLAYERS = 3

// monopoly
export const MONOPOLY_DEFAULT_MAX_PLAYERS = 6
export const MONOPOLY_MAX_PLAYERS = 9
export const MONOPOLY_MIN_PLAYERS = 2

// yahtzee
export const YAHTZEE_DEFAULT_MAX_PLAYERS = 6
export const YAHTZEE_MAX_PLAYERS = 6
export const YAHTZEE_MIN_PLAYERS = 1

// whot
export const WHOT_DEFAULT_MAX_PLAYERS = 6
export const WHOT_MAX_PLAYERS = 6
export const WHOT_MIN_PLAYERS = 2

// rummy
export const RUMMY_DEFAULT_MAX_PLAYERS = 4
export const RUMMY_MAX_PLAYERS = 6
export const RUMMY_MIN_PLAYERS = 2

// crazy-eights
export const CRAZY8_DEFAULT_MAX_PLAYERS = 6
export const CRAZY8_MAX_PLAYERS = 6
export const CRAZY8_MIN_PLAYERS = 2

// uno
export const UNO_DEFAULT_MAX_PLAYERS = 6
export const UNO_MAX_PLAYERS = 10
export const UNO_MIN_PLAYERS = 2

// ludo
export const LUDO_DEFAULT_MAX_PLAYERS = 4
export const LUDO_MAX_PLAYERS = 4
export const LUDO_MIN_PLAYERS = 2

// npat
export const NPAT_DEFAULT_MAX_PLAYERS = 20
export const NPAT_MAX_PLAYERS = 20
export const NPAT_MIN_PLAYERS = 3

// tic-tac-toe
export const TIC_TAC_TOE_DEFAULT_MAX_PLAYERS = 2
export const TIC_TAC_TOE_MAX_PLAYERS = 2
export const TIC_TAC_TOE_MIN_PLAYERS = 2

// word-hunt
export const WORD_HUNT_DEFAULT_MAX_PLAYERS = 20
export const WORD_HUNT_MAX_PLAYERS = 20
export const WORD_HUNT_MIN_PLAYERS = 2

// chess
export const CHESS_DEFAULT_MAX_PLAYERS = 2
export const CHESS_MAX_PLAYERS = 2
export const CHESS_MIN_PLAYERS = 2

// checkers
export const CHECKERS_DEFAULT_MAX_PLAYERS = 2
export const CHECKERS_MAX_PLAYERS = 2
export const CHECKERS_MIN_PLAYERS = 2

// draughts10
export const DRAUGHTS10_DEFAULT_MAX_PLAYERS = 2
export const DRAUGHTS10_MAX_PLAYERS = 2
export const DRAUGHTS10_MIN_PLAYERS = 2

// ayo
export const AYO_DEFAULT_MAX_PLAYERS = 2
export const AYO_MAX_PLAYERS = 2
export const AYO_MIN_PLAYERS = 2

// scrabble
export const SCRABBLE_MAX_PLAYERS = 4
export const SCRABBLE_MIN_PLAYERS = 2

// sudoku
export const SUDOKU_MAX_PLAYERS = 20
export const SUDOKU_MIN_PLAYERS = 1

// describe-it
export const DESCRIBE_IT_DEFAULT_MAX_PLAYERS = 12
export const DESCRIBE_IT_MAX_PLAYERS = 20
export const DESCRIBE_IT_MIN_PLAYERS_INDIVIDUAL = 2

// snake-and-ladder
export const SNAKE_LADDER_DEFAULT_MAX_PLAYERS = 4
export const SNAKE_LADDER_MAX_PLAYERS = 6
export const SNAKE_LADDER_MIN_PLAYERS = 2

// mafia
export const MAFIA_MIN_PLAYERS = 5
export const MAFIA_MAX_PLAYERS = 16
export const MAFIA_DEFAULT_MAX_PLAYERS = 16

// memory-match
export const MATCHING_PAIRS_MIN_PLAYERS = 1
export const MATCHING_PAIRS_MAX_PLAYERS = 20
export const MATCHING_PAIRS_DEFAULT_MAX_PLAYERS = 20

// quiplash
export const QUIPLASH_MIN_PLAYERS = 3
export const QUIPLASH_MAX_PLAYERS = 6
export const QUIPLASH_DEFAULT_MAX_PLAYERS = 6

// quick-draw
export const QUICK_DRAW_MIN_PLAYERS = 3
export const QUICK_DRAW_MAX_PLAYERS = 10
export const QUICK_DRAW_DEFAULT_MAX_PLAYERS = 10

// word-rush
export const WORD_RUSH_MIN_PLAYERS = 4
export const WORD_RUSH_MAX_PLAYERS = 20
export const WORD_RUSH_DEFAULT_MAX_PLAYERS = 12

// crossword
export const CROSSWORD_MIN_PLAYERS = 1
export const CROSSWORD_MAX_PLAYERS = 20
export const CROSSWORD_DEFAULT_MAX_PLAYERS = 20

// word-search
export const WORD_SEARCH_MIN_PLAYERS = 1
export const WORD_SEARCH_MAX_PLAYERS = 20
export const WORD_SEARCH_DEFAULT_MAX_PLAYERS = 20

// word-scramble
export const WORD_SCRAMBLE_MIN_PLAYERS = 1
export const WORD_SCRAMBLE_MAX_PLAYERS = 20
export const WORD_SCRAMBLE_DEFAULT_MAX_PLAYERS = 20

// landmine
export const LANDMINE_MIN_PLAYERS = 3
export const LANDMINE_MAX_PLAYERS = 20
export const LANDMINE_DEFAULT_MAX_PLAYERS = 20

// wordle-room
export const WORDLE_ROOM_MIN_PLAYERS = 1
export const WORDLE_ROOM_MAX_PLAYERS = 20
export const WORDLE_ROOM_DEFAULT_MAX_PLAYERS = 20

// gofish
export const GOFISH_MIN_PLAYERS = 2
export const GOFISH_MAX_PLAYERS = 6
export const GOFISH_DEFAULT_MAX_PLAYERS = 4

// Re-exported from their true homes: these already live in leaf modules (the shared package, or
// mahjong-core), so pointing at them here adds no edge.
export { MAHJONG_DEFAULT_MAX_PLAYERS, MAHJONG_MAX_PLAYERS, MAHJONG_MIN_PLAYERS } from '@/lib/mahjong-core'
export {
  WORD_GROUPING_MIN_PLAYERS,
  WORD_GROUPING_MAX_PLAYERS,
  WORD_GROUPING_DEFAULT_MAX_PLAYERS,
} from '../../packages/shared/src/word-grouping'
export {
  TROLL_RUN_MIN_PLAYERS,
  TROLL_RUN_MAX_PLAYERS,
  TROLL_RUN_DEFAULT_MAX_PLAYERS,
} from '../../packages/shared/src/troll-run-types'
