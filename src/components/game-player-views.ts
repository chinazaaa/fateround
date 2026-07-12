import type { ComponentType } from 'react'
import type { GameType } from '@/types'

import { AnonymousMessagesPlayerView } from '@/components/anonymous-messages/AnonymousMessagesPlayerView'
import { SecretMessageSenderView } from '@/components/secret-message/SecretMessageSenderView'
import { BingoPlayerView } from '@/components/bingo/BingoPlayerView'
import { TriviaPlayerView } from '@/components/trivia/TriviaPlayerView'
import { TwoTruthsPlayerView } from '@/components/two-truths/TwoTruthsPlayerView'
import { NpatPlayerView } from '@/components/npat/NpatPlayerView'
import { CodewordsPlayerView } from '@/components/codewords/CodewordsPlayerView'
import { MonopolyPlayerView } from '@/components/monopoly/MonopolyPlayerView'
import { YahtzeePlayerView } from '@/components/yahtzee/YahtzeePlayerView'
import { WhotPlayerView } from '@/components/whot/WhotPlayerView'
import { CrazyEightsPlayerView } from '@/components/crazy-eights/CrazyEightsPlayerView'
import { LudoPlayerView } from '@/components/ludo/LudoPlayerView'
import { MahjongPlayerView } from '@/components/mahjong/MahjongPlayerView'
import { SnakeLadderPlayerView } from '@/components/snake-and-ladder/SnakeLadderPlayerView'
import { TicTacToePlayerView } from '@/components/tic-tac-toe/TicTacToePlayerView'
import { ChessPlayerView } from '@/components/chess/ChessPlayerView'
import { CheckersPlayerView } from '@/components/checkers/CheckersPlayerView'
import { AyoPlayerView } from '@/components/ayo/AyoPlayerView'
import { ScrabblePlayerView } from '@/components/scrabble/ScrabblePlayerView'
import { DescribeItPlayerView } from '@/components/describe-it/DescribeItPlayerView'
import { SudokuPlayerView } from '@/components/sudoku/SudokuPlayerView'
import { WordHuntPlayerView } from '@/components/word-hunt/WordHuntPlayerView'
import { MafiaPlayerView } from '@/components/mafia/MafiaPlayerView'
import { MatchingPairsPlayerView } from '@/components/matching-pairs/MatchingPairsPlayerView'
import { QuiplashPlayerView } from '@/components/quiplash/QuiplashPlayerView'
import { QuickDrawPlayerView } from '@/components/quick-draw/QuickDrawPlayerView'
import { WordRushPlayerView } from '@/components/word-rush/WordRushPlayerView'
import { CrosswordPlayerView } from '@/components/crossword/CrosswordPlayerView'

export type GamePlayerView = ComponentType<{ gameCode: string }>

/**
 * Games with a dedicated player view, keyed by canonical `GameType`.
 *
 * The poll-family games (smash_marry_kill, would_you_rather, …) are intentionally
 * absent: they fall through to the shared render in `PollGamePlayerExperience`.
 * To add a game's player view, add one entry here — no dispatch edits needed.
 */
export const PLAYER_VIEW_REGISTRY: Partial<Record<GameType, GamePlayerView>> = {
  secret_message: SecretMessageSenderView,
  bingo: BingoPlayerView,
  codewords: CodewordsPlayerView,
  trivia: TriviaPlayerView,
  two_truths: TwoTruthsPlayerView,
  i_call_on: NpatPlayerView,
  monopoly: MonopolyPlayerView,
  yahtzee: YahtzeePlayerView,
  whot: WhotPlayerView,
  crazy_eights: CrazyEightsPlayerView,
  ludo: LudoPlayerView,
  mahjong: MahjongPlayerView,
  snake_and_ladder: SnakeLadderPlayerView,
  tic_tac_toe: TicTacToePlayerView,
  chess: ChessPlayerView,
  checkers: CheckersPlayerView,
  ayo: AyoPlayerView,
  scrabble: ScrabblePlayerView,
  describe_it: DescribeItPlayerView,
  sudoku: SudokuPlayerView,
  word_hunt: WordHuntPlayerView,
  matching_pairs: MatchingPairsPlayerView,
  anonymous_messages: AnonymousMessagesPlayerView,
  mafia: MafiaPlayerView,
  quiplash: QuiplashPlayerView,
  quick_draw: QuickDrawPlayerView,
  word_rush: WordRushPlayerView,
  crossword: CrosswordPlayerView,
}
