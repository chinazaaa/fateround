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
  'word_grouping',
]

const BATCH_4_GAMES: GameType[] = ['crazy_eights', 'whot', 'two_truths', 'describe_it']

const BATCH_5_GAMES: GameType[] = ['quiplash', 'word_rush', 'word_hunt', 'i_call_on']

const BATCH_6_GAMES: GameType[] = ['chess', 'scrabble']

const BATCH_7_GAMES: GameType[] = ['mafia', 'codewords']

const BATCH_8_GAMES: GameType[] = ['monopoly', 'mahjong', 'quick_draw']

const BATCH_9_GAMES: GameType[] = ['secret_message', 'hot_seat', 'custom', 'anonymous_messages']

const BATCH_10_GAMES: GameType[] = ['uno']

const BATCH_11_GAMES: GameType[] = ['word_scramble', 'landmine', 'checkers_international', 'checkers_nigeria']

const BATCH_12_GAMES: GameType[] = ['wordle_room']

/**
 * Server-driven mobile feature flags. Flip `mobileSupportedGames` when a native
 * screen is ready — no app store review required.
 *
 * WHY THIS LIST IS DUPLICATED. The Expo app builds its own `MOBILE_SUPPORTED_GAMES` in
 * `apps/mobile/components/games/GameRouter.tsx` from the shared `batch-*-games` modules.
 * This route cannot import it (GameRouter pulls in React Native) and the web app
 * deliberately does not depend on `@fateround/shared` — see the note in
 * `src/lib/public-hints.ts`. So the two lists are maintained separately and
 * `mobile-config.test.ts` is the link: it fails when they diverge in either direction, and
 * when this route enables a game the app has no player view for.
 *
 * The BATCH_n groupings below are ROLLOUT batches — the order native screens shipped in —
 * and do not have to match how the app groups the same games into modules (word_scramble
 * lives in the app's BATCH_3 but shipped here in BATCH_11). Only the union matters.
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
      ...BATCH_10_GAMES,
      ...BATCH_11_GAMES,
      ...BATCH_12_GAMES,
    ],
    maintenanceMessage: null,
    forceWebFallbackFor: [] as GameType[],
  })
}
