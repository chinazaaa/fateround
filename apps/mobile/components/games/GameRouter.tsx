import { lazy, Suspense } from 'react'
import { ActivityIndicator, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { BATCH_3_GAMES } from '@fateround/shared/batch-3-games'
import { BATCH_4_GAMES } from '@fateround/shared/batch-4-games'
import { BATCH_5_GAMES } from '@fateround/shared/batch-5-games'
import { BATCH_6_GAMES } from '@fateround/shared/batch-6-games'
import { BATCH_7_GAMES } from '@fateround/shared/batch-7-games'
import { BATCH_8_GAMES } from '@fateround/shared/batch-8-games'
import { BATCH_9_GAMES } from '@fateround/shared/batch-9-games'
import { BATCH_2_POLL_GAMES } from '@fateround/shared/poll-games'
import { useTheme } from '@/constants/theme-context'
import { PlayerPreJoinGate } from '@/components/lifecycle/PlayerPreJoinGate'

// Each game view is code-split via React.lazy so opening one game only loads
// that game's bundle instead of eagerly parsing/evaluating all ~40 views on
// first render (M5). The views are named exports, so each factory maps the
// named export onto the `default` shape React.lazy expects.
type PlayerView = React.ComponentType<{ gameCode: string }>

const lazyView = (loader: () => Promise<Record<string, PlayerView>>, name: string): PlayerView =>
  lazy(async () => ({ default: (await loader())[name]! }))

const POLL_VIEW = lazyView(() => import('@/components/games/PollPlayerView'), 'PollPlayerView')
const POLL_VIEWS = Object.fromEntries(BATCH_2_POLL_GAMES.map((gameType) => [gameType, POLL_VIEW])) as Partial<
  Record<GameType, PlayerView>
>

const BATCH_3_VIEWS = {
  matching_pairs: lazyView(() => import('@/components/games/MatchingPairsPlayerView'), 'MatchingPairsPlayerView'),
  sudoku: lazyView(() => import('@/components/games/SudokuPlayerView'), 'SudokuPlayerView'),
  yahtzee: lazyView(() => import('@/components/games/YahtzeePlayerView'), 'YahtzeePlayerView'),
  snake_and_ladder: lazyView(() => import('@/components/games/SnakeLadderPlayerView'), 'SnakeLadderPlayerView'),
  ludo: lazyView(() => import('@/components/games/LudoPlayerView'), 'LudoPlayerView'),
  crossword: lazyView(() => import('@/components/games/CrosswordPlayerView'), 'CrosswordPlayerView'),
  word_search: lazyView(() => import('@/components/games/WordSearchPlayerView'), 'WordSearchPlayerView'),
  word_scramble: lazyView(() => import('@/components/games/WordScramblePlayerView'), 'WordScramblePlayerView'),
} as const satisfies Partial<Record<GameType, PlayerView>>

const BATCH_4_VIEWS = {
  crazy_eights: lazyView(() => import('@/components/games/CrazyEightsPlayerView'), 'CrazyEightsPlayerView'),
  whot: lazyView(() => import('@/components/games/WhotPlayerView'), 'WhotPlayerView'),
  two_truths: lazyView(() => import('@/components/games/TwoTruthsPlayerView'), 'TwoTruthsPlayerView'),
  describe_it: lazyView(() => import('@/components/games/DescribeItPlayerView'), 'DescribeItPlayerView'),
} as const satisfies Partial<Record<GameType, PlayerView>>

const BATCH_5_VIEWS = {
  quiplash: lazyView(() => import('@/components/games/QuiplashPlayerView'), 'QuiplashPlayerView'),
  word_rush: lazyView(() => import('@/components/games/WordRushPlayerView'), 'WordRushPlayerView'),
  word_hunt: lazyView(() => import('@/components/games/WordHuntPlayerView'), 'WordHuntPlayerView'),
  i_call_on: lazyView(() => import('@/components/games/ICallOnPlayerView'), 'ICallOnPlayerView'),
} as const satisfies Partial<Record<GameType, PlayerView>>

const BATCH_6_VIEWS = {
  chess: lazyView(() => import('@/components/games/ChessPlayerView'), 'ChessPlayerView'),
  scrabble: lazyView(() => import('@/components/games/ScrabblePlayerView'), 'ScrabblePlayerView'),
} as const satisfies Partial<Record<GameType, PlayerView>>

const BATCH_7_VIEWS = {
  mafia: lazyView(() => import('@/components/games/MafiaPlayerView'), 'MafiaPlayerView'),
  codewords: lazyView(() => import('@/components/games/CodewordsPlayerView'), 'CodewordsPlayerView'),
} as const satisfies Partial<Record<GameType, PlayerView>>

const BATCH_8_VIEWS = {
  monopoly: lazyView(() => import('@/components/games/MonopolyPlayerView'), 'MonopolyPlayerView'),
  mahjong: lazyView(() => import('@/components/games/MahjongPlayerView'), 'MahjongPlayerView'),
  quick_draw: lazyView(() => import('@/components/games/QuickDrawPlayerView'), 'QuickDrawPlayerView'),
} as const satisfies Partial<Record<GameType, PlayerView>>

const BATCH_9_VIEWS = {
  secret_message: lazyView(() => import('@/components/games/SecretMessagePlayerView'), 'SecretMessagePlayerView'),
  hot_seat: lazyView(() => import('@/components/games/HotSeatPlayerView'), 'HotSeatPlayerView'),
  custom: lazyView(() => import('@/components/games/CustomPlayerView'), 'CustomPlayerView'),
  anonymous_messages: lazyView(
    () => import('@/components/games/AnonymousMessagesPlayerView'),
    'AnonymousMessagesPlayerView'
  ),
  landmine: lazyView(() => import('@/components/games/LandminePlayerView'), 'LandminePlayerView'),
} as const satisfies Partial<Record<GameType, PlayerView>>

const MOBILE_PLAYER_VIEWS: Partial<Record<GameType, PlayerView>> = {
  ayo: lazyView(() => import('@/components/games/AyoPlayerView'), 'AyoPlayerView'),
  tic_tac_toe: lazyView(() => import('@/components/games/TicTacToePlayerView'), 'TicTacToePlayerView'),
  checkers: lazyView(() => import('@/components/games/CheckersPlayerView'), 'CheckersPlayerView'),
  bingo: lazyView(() => import('@/components/games/BingoPlayerView'), 'BingoPlayerView'),
  trivia: lazyView(() => import('@/components/games/TriviaPlayerView'), 'TriviaPlayerView'),
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

function GameRouterFallback() {
  const theme = useTheme()
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={theme.primary} size="large" />
    </View>
  )
}

export function GameRouter({ gameCode, gameType }: { gameCode: string; gameType: GameType }) {
  const PlayerView = resolveMobilePlayerView(gameType)
  if (!PlayerView) return null
  return (
    <PlayerPreJoinGate gameCode={gameCode}>
      <Suspense fallback={<GameRouterFallback />}>
        <PlayerView gameCode={gameCode} />
      </Suspense>
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
