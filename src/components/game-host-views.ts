import type { ComponentType } from 'react'
import type { GameType } from '@/types'

import { AnonymousMessagesHostView } from '@/components/anonymous-messages/AnonymousMessagesHostView'
import { SecretMessageHostView } from '@/components/secret-message/SecretMessageHostView'
import { BingoHostView } from '@/components/bingo/BingoHostView'
import { TriviaHostView } from '@/components/trivia/TriviaHostView'
import { TwoTruthsHostView } from '@/components/two-truths/TwoTruthsHostView'
import { CodewordsHostView } from '@/components/codewords/CodewordsHostView'
import { MonopolyHostView } from '@/components/monopoly/MonopolyHostView'
import { YahtzeeHostView } from '@/components/yahtzee/YahtzeeHostView'
import { WhotHostView } from '@/components/whot/WhotHostView'
import { CrazyEightsHostView } from '@/components/crazy-eights/CrazyEightsHostView'
import { LudoHostView } from '@/components/ludo/LudoHostView'
import { SnakeLadderHostView } from '@/components/snake-and-ladder/SnakeLadderHostView'
import { TicTacToeHostView } from '@/components/tic-tac-toe/TicTacToeHostView'
import { ChessHostView } from '@/components/chess/ChessHostView'
import { ScrabbleHostView } from '@/components/scrabble/ScrabbleHostView'
import { DescribeItHostView } from '@/components/describe-it/DescribeItHostView'
import { NpatHostView } from '@/components/npat/NpatHostView'
import { SudokuHostView } from '@/components/sudoku/SudokuHostView'
import { WordHuntHostView } from '@/components/word-hunt/WordHuntHostView'

export type GameHostView = ComponentType<{ gameCode: string; hostToken: string }>

/**
 * Games with a dedicated host view, keyed by canonical `GameType`.
 *
 * The poll-family games are intentionally absent: they fall through to the
 * inline poll-host render in `host/[code]/page.tsx`. To add a game's host view,
 * add one entry here — no dispatch edits needed.
 */
export const HOST_VIEW_REGISTRY: Partial<Record<GameType, GameHostView>> = {
  secret_message: SecretMessageHostView,
  bingo: BingoHostView,
  codewords: CodewordsHostView,
  trivia: TriviaHostView,
  two_truths: TwoTruthsHostView,
  i_call_on: NpatHostView,
  monopoly: MonopolyHostView,
  yahtzee: YahtzeeHostView,
  whot: WhotHostView,
  crazy_eights: CrazyEightsHostView,
  ludo: LudoHostView,
  snake_and_ladder: SnakeLadderHostView,
  tic_tac_toe: TicTacToeHostView,
  chess: ChessHostView,
  scrabble: ScrabbleHostView,
  describe_it: DescribeItHostView,
  sudoku: SudokuHostView,
  word_hunt: WordHuntHostView,
  anonymous_messages: AnonymousMessagesHostView,
}
