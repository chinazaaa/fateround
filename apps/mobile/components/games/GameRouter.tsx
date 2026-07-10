import type { GameType } from '@fateround/shared'
import { BATCH_3_GAMES } from '@fateround/shared/batch-3-games'
import { BATCH_4_GAMES } from '@fateround/shared/batch-4-games'
import { BATCH_5_GAMES } from '@fateround/shared/batch-5-games'
import { BATCH_2_POLL_GAMES } from '@fateround/shared/poll-games'
import { AyoPlayerView } from '@/components/games/AyoPlayerView'
import { BingoPlayerView } from '@/components/games/BingoPlayerView'
import { CheckersPlayerView } from '@/components/games/CheckersPlayerView'
import { CrazyEightsPlayerView } from '@/components/games/CrazyEightsPlayerView'
import { DescribeItPlayerView } from '@/components/games/DescribeItPlayerView'
import { ICallOnPlayerView } from '@/components/games/ICallOnPlayerView'
import { LudoPlayerView } from '@/components/games/LudoPlayerView'
import { MatchingPairsPlayerView } from '@/components/games/MatchingPairsPlayerView'
import { PollPlayerView } from '@/components/games/PollPlayerView'
import { QuiplashPlayerView } from '@/components/games/QuiplashPlayerView'
import { SnakeLadderPlayerView } from '@/components/games/SnakeLadderPlayerView'
import { SudokuPlayerView } from '@/components/games/SudokuPlayerView'
import { TicTacToePlayerView } from '@/components/games/TicTacToePlayerView'
import { TriviaPlayerView } from '@/components/games/TriviaPlayerView'
import { TwoTruthsPlayerView } from '@/components/games/TwoTruthsPlayerView'
import { WhotPlayerView } from '@/components/games/WhotPlayerView'
import { WordHuntPlayerView } from '@/components/games/WordHuntPlayerView'
import { WordRushPlayerView } from '@/components/games/WordRushPlayerView'
import { YahtzeePlayerView } from '@/components/games/YahtzeePlayerView'

const POLL_VIEWS = Object.fromEntries(
  BATCH_2_POLL_GAMES.map((gameType) => [gameType, PollPlayerView])
) as Partial<Record<GameType, React.ComponentType<{ gameCode: string }>>>

const BATCH_3_VIEWS = {
  matching_pairs: MatchingPairsPlayerView,
  sudoku: SudokuPlayerView,
  yahtzee: YahtzeePlayerView,
  snake_and_ladder: SnakeLadderPlayerView,
  ludo: LudoPlayerView,
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
}

export function hasMobilePlayerView(gameType: GameType): boolean {
  return gameType in MOBILE_PLAYER_VIEWS
}

export function GameRouter({ gameCode, gameType }: { gameCode: string; gameType: GameType }) {
  const View = MOBILE_PLAYER_VIEWS[gameType]
  if (!View) return null
  return <View gameCode={gameCode} />
}

export const BATCH_1_GAMES: GameType[] = [
  'ayo',
  'tic_tac_toe',
  'checkers',
  'bingo',
  'trivia',
]

export const BATCH_2_GAMES: GameType[] = BATCH_2_POLL_GAMES

export { BATCH_3_GAMES, BATCH_4_GAMES, BATCH_5_GAMES }

export const MOBILE_SUPPORTED_GAMES: GameType[] = [
  ...BATCH_1_GAMES,
  ...BATCH_2_GAMES,
  ...BATCH_3_GAMES,
  ...BATCH_4_GAMES,
  ...BATCH_5_GAMES,
]
