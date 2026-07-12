import type { GameType } from '@fateround/shared'
import { BATCH_3_GAMES } from '@fateround/shared/batch-3-games'
import { BATCH_4_GAMES } from '@fateround/shared/batch-4-games'
import { BATCH_5_GAMES } from '@fateround/shared/batch-5-games'
import { BATCH_6_GAMES } from '@fateround/shared/batch-6-games'
import { BATCH_7_GAMES } from '@fateround/shared/batch-7-games'
import { BATCH_8_GAMES } from '@fateround/shared/batch-8-games'
import { BATCH_9_GAMES } from '@fateround/shared/batch-9-games'
import { BATCH_2_POLL_GAMES } from '@fateround/shared/poll-games'
import { PlayerPreJoinGate } from '@/components/lifecycle/PlayerPreJoinGate'
import { AnonymousMessagesPlayerView } from '@/components/games/AnonymousMessagesPlayerView'
import { AyoPlayerView } from '@/components/games/AyoPlayerView'
import { CustomPlayerView } from '@/components/games/CustomPlayerView'
import { HotSeatPlayerView } from '@/components/games/HotSeatPlayerView'
import { BingoPlayerView } from '@/components/games/BingoPlayerView'
import { CheckersPlayerView } from '@/components/games/CheckersPlayerView'
import { ChessPlayerView } from '@/components/games/ChessPlayerView'
import { CodewordsPlayerView } from '@/components/games/CodewordsPlayerView'
import { CrazyEightsPlayerView } from '@/components/games/CrazyEightsPlayerView'
import { CrosswordPlayerView } from '@/components/games/CrosswordPlayerView'
import { DescribeItPlayerView } from '@/components/games/DescribeItPlayerView'
import { ICallOnPlayerView } from '@/components/games/ICallOnPlayerView'
import { LudoPlayerView } from '@/components/games/LudoPlayerView'
import { MafiaPlayerView } from '@/components/games/MafiaPlayerView'
import { MahjongPlayerView } from '@/components/games/MahjongPlayerView'
import { MonopolyPlayerView } from '@/components/games/MonopolyPlayerView'
import { MatchingPairsPlayerView } from '@/components/games/MatchingPairsPlayerView'
import { PollPlayerView } from '@/components/games/PollPlayerView'
import { QuickDrawPlayerView } from '@/components/games/QuickDrawPlayerView'
import { QuiplashPlayerView } from '@/components/games/QuiplashPlayerView'
import { SecretMessagePlayerView } from '@/components/games/SecretMessagePlayerView'
import { ScrabblePlayerView } from '@/components/games/ScrabblePlayerView'
import { SnakeLadderPlayerView } from '@/components/games/SnakeLadderPlayerView'
import { SudokuPlayerView } from '@/components/games/SudokuPlayerView'
import { TicTacToePlayerView } from '@/components/games/TicTacToePlayerView'
import { TriviaPlayerView } from '@/components/games/TriviaPlayerView'
import { TwoTruthsPlayerView } from '@/components/games/TwoTruthsPlayerView'
import { WhotPlayerView } from '@/components/games/WhotPlayerView'
import { WordHuntPlayerView } from '@/components/games/WordHuntPlayerView'
import { WordRushPlayerView } from '@/components/games/WordRushPlayerView'
import { WordSearchPlayerView } from '@/components/games/WordSearchPlayerView'
import { WordScramblePlayerView } from '@/components/games/WordScramblePlayerView'
import { YahtzeePlayerView } from '@/components/games/YahtzeePlayerView'

const POLL_VIEWS = Object.fromEntries(BATCH_2_POLL_GAMES.map((gameType) => [gameType, PollPlayerView])) as Partial<
  Record<GameType, React.ComponentType<{ gameCode: string }>>
>

const BATCH_3_VIEWS = {
  matching_pairs: MatchingPairsPlayerView,
  sudoku: SudokuPlayerView,
  yahtzee: YahtzeePlayerView,
  snake_and_ladder: SnakeLadderPlayerView,
  ludo: LudoPlayerView,
  crossword: CrosswordPlayerView,
  word_search: WordSearchPlayerView,
  word_scramble: WordScramblePlayerView,
} as const satisfies Partial<Record<GameType, React.ComponentType<{ gameCode: string }>>>

const BATCH_4_VIEWS = {
  crazy_eights: CrazyEightsPlayerView,
  whot: WhotPlayerView,
  two_truths: TwoTruthsPlayerView,
  describe_it: DescribeItPlayerView,
} as const satisfies Partial<Record<GameType, React.ComponentType<{ gameCode: string }>>>

const BATCH_5_VIEWS = {
  quiplash: QuiplashPlayerView,
  word_rush: WordRushPlayerView,
  word_hunt: WordHuntPlayerView,
  i_call_on: ICallOnPlayerView,
} as const satisfies Partial<Record<GameType, React.ComponentType<{ gameCode: string }>>>

const BATCH_6_VIEWS = {
  chess: ChessPlayerView,
  scrabble: ScrabblePlayerView,
} as const satisfies Partial<Record<GameType, React.ComponentType<{ gameCode: string }>>>

const BATCH_7_VIEWS = {
  mafia: MafiaPlayerView,
  codewords: CodewordsPlayerView,
} as const satisfies Partial<Record<GameType, React.ComponentType<{ gameCode: string }>>>

const BATCH_8_VIEWS = {
  monopoly: MonopolyPlayerView,
  mahjong: MahjongPlayerView,
  quick_draw: QuickDrawPlayerView,
} as const satisfies Partial<Record<GameType, React.ComponentType<{ gameCode: string }>>>

const BATCH_9_VIEWS = {
  secret_message: SecretMessagePlayerView,
  hot_seat: HotSeatPlayerView,
  custom: CustomPlayerView,
  anonymous_messages: AnonymousMessagesPlayerView,
} as const satisfies Partial<Record<GameType, React.ComponentType<{ gameCode: string }>>>

const MOBILE_PLAYER_VIEWS: Partial<Record<GameType, React.ComponentType<{ gameCode: string }>>> = {
  ayo: AyoPlayerView,
  tic_tac_toe: TicTacToePlayerView,
  checkers: CheckersPlayerView,
  bingo: BingoPlayerView,
  trivia: TriviaPlayerView,
  ...POLL_VIEWS,
  ...BATCH_3_VIEWS,
  ...BATCH_4_VIEWS,
  ...BATCH_5_VIEWS,
  ...BATCH_6_VIEWS,
  ...BATCH_7_VIEWS,
  ...BATCH_8_VIEWS,
  ...BATCH_9_VIEWS,
}

export function hasMobilePlayerView(gameType: GameType): boolean {
  return resolveMobilePlayerView(gameType) != null
}

export function resolveMobilePlayerView(gameType: GameType) {
  return MOBILE_PLAYER_VIEWS[gameType] ?? null
}

export function GameRouter({ gameCode, gameType }: { gameCode: string; gameType: GameType }) {
  const View = resolveMobilePlayerView(gameType)
  if (!View) return null
  return (
    <PlayerPreJoinGate gameCode={gameCode}>
      <View gameCode={gameCode} />
    </PlayerPreJoinGate>
  )
}

export const BATCH_1_GAMES: GameType[] = ['ayo', 'tic_tac_toe', 'checkers', 'bingo', 'trivia']

export const BATCH_2_GAMES: GameType[] = BATCH_2_POLL_GAMES

export { BATCH_3_GAMES, BATCH_4_GAMES, BATCH_5_GAMES, BATCH_6_GAMES, BATCH_7_GAMES, BATCH_8_GAMES, BATCH_9_GAMES }

export const MOBILE_SUPPORTED_GAMES: GameType[] = [
  ...BATCH_1_GAMES,
  ...BATCH_2_GAMES,
  ...BATCH_3_GAMES,
  ...BATCH_4_GAMES,
  ...BATCH_5_GAMES,
  ...BATCH_6_GAMES,
  ...BATCH_7_GAMES,
  ...BATCH_8_GAMES,
  ...BATCH_9_GAMES,
]
