import type { ComponentType } from 'react'
import type { GameType } from '@/types'

import { AnonymousMessagesPlayerView } from '@/components/anonymous-messages/AnonymousMessagesPlayerView'
import { SecretMessageSenderView } from '@/components/secret-message/SecretMessageSenderView'
import { BingoPlayerView } from '@/components/bingo/BingoPlayerView'
import { TriviaPlayerView } from '@/components/trivia/TriviaPlayerView'
import { TwoTruthsPlayerView } from '@/components/two-truths/TwoTruthsPlayerView'
import { NpatPlayerView } from '@/components/npat/NpatPlayerView'
import { LandminePlayerView } from '@/components/landmine/LandminePlayerView'
import { CodewordsPlayerView } from '@/components/codewords/CodewordsPlayerView'
import { MonopolyPlayerView } from '@/components/monopoly/MonopolyPlayerView'
import { YahtzeePlayerView } from '@/components/yahtzee/YahtzeePlayerView'
import { WhotPlayerView } from '@/components/whot/WhotPlayerView'
import { RummyPlayerView } from '@/components/rummy/RummyPlayerView'
import { CrazyEightsPlayerView } from '@/components/crazy-eights/CrazyEightsPlayerView'
import { UnoPlayerView } from '@/components/uno/UnoPlayerView'
import { LudoPlayerView } from '@/components/ludo/LudoPlayerView'
import { MahjongPlayerView } from '@/components/mahjong/MahjongPlayerView'
import { SnakeLadderPlayerView } from '@/components/snake-and-ladder/SnakeLadderPlayerView'
import { TicTacToePlayerView } from '@/components/tic-tac-toe/TicTacToePlayerView'
import { ChessPlayerView } from '@/components/chess/ChessPlayerView'
import { CheckersPlayerView } from '@/components/checkers/CheckersPlayerView'
import { Draughts10PlayerView } from '@/components/draughts10/Draughts10PlayerView'
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
import { WordSearchPlayerView } from '@/components/word-search/WordSearchPlayerView'
import { WordScramblePlayerView } from '@/components/word-scramble/WordScramblePlayerView'
import { WordGroupingPlayerView } from '@/components/word-grouping/WordGroupingPlayerView'
import { WordleRoomPlayerView } from '@/components/wordle-room/WordleRoomPlayerView'
import { TrollRunPlayerView } from '@/components/troll-run/TrollRunPlayerView'
import { GoFishPlayerView } from '@/components/gofish/GoFishPlayerView'

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
  landmine: LandminePlayerView,
  monopoly: MonopolyPlayerView,
  yahtzee: YahtzeePlayerView,
  whot: WhotPlayerView,
  rummy: RummyPlayerView,
  crazy_eights: CrazyEightsPlayerView,
  uno: UnoPlayerView,
  ludo: LudoPlayerView,
  mahjong: MahjongPlayerView,
  snake_and_ladder: SnakeLadderPlayerView,
  tic_tac_toe: TicTacToePlayerView,
  chess: ChessPlayerView,
  checkers: CheckersPlayerView,
  checkers_international: Draughts10PlayerView,
  checkers_nigeria: Draughts10PlayerView,
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
  word_search: WordSearchPlayerView,
  word_scramble: WordScramblePlayerView,
  word_grouping: WordGroupingPlayerView,
  wordle_room: WordleRoomPlayerView,
  troll_run: TrollRunPlayerView,
  gofish: GoFishPlayerView,
}
