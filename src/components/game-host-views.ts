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
import { UnoHostView } from '@/components/uno/UnoHostView'
import { LudoHostView } from '@/components/ludo/LudoHostView'
import { MahjongHostView } from '@/components/mahjong/MahjongHostView'
import { SnakeLadderHostView } from '@/components/snake-and-ladder/SnakeLadderHostView'
import { TicTacToeHostView } from '@/components/tic-tac-toe/TicTacToeHostView'
import { ChessHostView } from '@/components/chess/ChessHostView'
import { CheckersHostView } from '@/components/checkers/CheckersHostView'
import { Draughts10HostView } from '@/components/draughts10/Draughts10HostView'
import { AyoHostView } from '@/components/ayo/AyoHostView'
import { ScrabbleHostView } from '@/components/scrabble/ScrabbleHostView'
import { DescribeItHostView } from '@/components/describe-it/DescribeItHostView'
import { NpatHostView } from '@/components/npat/NpatHostView'
import { LandmineHostView } from '@/components/landmine/LandmineHostView'
import { SudokuHostView } from '@/components/sudoku/SudokuHostView'
import { WordHuntHostView } from '@/components/word-hunt/WordHuntHostView'
import { MafiaHostView } from '@/components/mafia/MafiaHostView'
import { MatchingPairsHostView } from '@/components/matching-pairs/MatchingPairsHostView'
import { QuiplashHostView } from '@/components/quiplash/QuiplashHostView'
import { QuickDrawHostView } from '@/components/quick-draw/QuickDrawHostView'
import { WordRushHostView } from '@/components/word-rush/WordRushHostView'
import { CrosswordHostView } from '@/components/crossword/CrosswordHostView'
import { WordSearchHostView } from '@/components/word-search/WordSearchHostView'
import { WordScrambleHostView } from '@/components/word-scramble/WordScrambleHostView'
import { WordGroupingHostView } from '@/components/word-grouping/WordGroupingHostView'
import { WordleRoomHostView } from '@/components/wordle-room/WordleRoomHostView'
import { TrollRunHostView } from '@/components/troll-run/TrollRunHostView'
import { GoFishHostView } from '@/components/gofish/GoFishHostView'

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
  landmine: LandmineHostView,
  monopoly: MonopolyHostView,
  yahtzee: YahtzeeHostView,
  whot: WhotHostView,
  crazy_eights: CrazyEightsHostView,
  uno: UnoHostView,
  ludo: LudoHostView,
  mahjong: MahjongHostView,
  snake_and_ladder: SnakeLadderHostView,
  tic_tac_toe: TicTacToeHostView,
  chess: ChessHostView,
  checkers: CheckersHostView,
  checkers_international: Draughts10HostView,
  checkers_nigeria: Draughts10HostView,
  ayo: AyoHostView,
  scrabble: ScrabbleHostView,
  describe_it: DescribeItHostView,
  sudoku: SudokuHostView,
  word_hunt: WordHuntHostView,
  matching_pairs: MatchingPairsHostView,
  anonymous_messages: AnonymousMessagesHostView,
  mafia: MafiaHostView,
  quiplash: QuiplashHostView,
  quick_draw: QuickDrawHostView,
  word_rush: WordRushHostView,
  crossword: CrosswordHostView,
  word_search: WordSearchHostView,
  word_scramble: WordScrambleHostView,
  word_grouping: WordGroupingHostView,
  wordle_room: WordleRoomHostView,
  troll_run: TrollRunHostView,
  gofish: GoFishHostView,
}
