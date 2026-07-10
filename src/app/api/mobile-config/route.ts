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
]

/**
 * Server-driven mobile feature flags. Flip `mobileSupportedGames` when a native
 * screen is ready — no app store review required.
 */
export async function GET() {
  return NextResponse.json({
    minAppVersion: '0.1.0',
    mobileSupportedGames: [...BATCH_1_GAMES, ...BATCH_2_GAMES, ...BATCH_3_GAMES],
    maintenanceMessage: null,
    forceWebFallbackFor: [] as GameType[],
  })
}
