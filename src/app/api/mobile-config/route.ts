import { NextResponse } from 'next/server'
import type { GameType } from '@/types'

const BATCH_1_GAMES: GameType[] = ['ayo', 'tic_tac_toe', 'checkers', 'bingo', 'trivia']

const BATCH_2_GAMES: GameType[] = [
  'would_you_rather',
  'this_or_that',
  'never_have_i_ever',
  'most_likely_to',
  'who_said_this',
  'smash_marry_kill',
  'smash_or_pass',
  'red_flag_green_flag',
  'pick_a_number',
  'parent_approval',
]

const BATCH_3_GAMES: GameType[] = [
  'matching_pairs',
  'sudoku',
  'yahtzee',
  'snake_and_ladder',
  'ludo',
  'crossword',
  'word_search',
]

const BATCH_4_GAMES: GameType[] = ['crazy_eights', 'whot', 'two_truths', 'describe_it']

const BATCH_5_GAMES: GameType[] = ['quiplash', 'word_rush', 'word_hunt', 'i_call_on']

const BATCH_6_GAMES: GameType[] = ['chess', 'scrabble']

const BATCH_7_GAMES: GameType[] = ['mafia', 'codewords']

const BATCH_8_GAMES: GameType[] = ['monopoly', 'mahjong', 'quick_draw']

const BATCH_9_GAMES: GameType[] = ['secret_message', 'hot_seat', 'custom', 'anonymous_messages']

/**
 * Server-driven mobile feature flags. Flip `mobileSupportedGames` when a native
 * screen is ready — no app store review required.
 */
export async function GET() {
  return NextResponse.json({
    minAppVersion: '0.1.0',
    mobileSupportedGames: [
      ...BATCH_1_GAMES,
      ...BATCH_2_GAMES,
      ...BATCH_3_GAMES,
      ...BATCH_4_GAMES,
      ...BATCH_5_GAMES,
      ...BATCH_6_GAMES,
      ...BATCH_7_GAMES,
      ...BATCH_8_GAMES,
      ...BATCH_9_GAMES,
    ],
    maintenanceMessage: null,
    forceWebFallbackFor: [] as GameType[],
  })
}
