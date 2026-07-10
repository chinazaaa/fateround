import type { GameType } from '@fateround/shared'
import { BATCH_2_POLL_GAMES } from '@fateround/shared/poll-games'
import { BATCH_3_GAMES } from '@fateround/shared/batch-3-games'
import { BATCH_4_GAMES } from '@fateround/shared/batch-4-games'
import { BATCH_5_GAMES } from '@fateround/shared/batch-5-games'
import { BATCH_6_GAMES } from '@fateround/shared/batch-6-games'
import { BATCH_7_GAMES } from '@fateround/shared/batch-7-games'
import { BATCH_8_GAMES } from '@fateround/shared/batch-8-games'

/** Game types with a native player screen in this app (no React view imports). */
export const NATIVE_GAME_TYPES: GameType[] = [
  'ayo',
  'tic_tac_toe',
  'checkers',
  'bingo',
  'trivia',
  ...BATCH_2_POLL_GAMES,
  ...BATCH_3_GAMES,
  ...BATCH_4_GAMES,
  ...BATCH_5_GAMES,
  ...BATCH_6_GAMES,
  ...BATCH_7_GAMES,
  ...BATCH_8_GAMES,
]
