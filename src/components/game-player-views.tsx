'use client'

import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'
import type { GameType } from '@/types'

export type GamePlayerView = ComponentType<{ gameCode: string }>

/**
 * Lazy loaders for each game's dedicated player view, keyed by canonical `GameType`.
 *
 * These are `import()` calls, not top-level imports, and that is load-bearing: a static
 * import of all 39 views put every game in the same bundle, so opening ONE game downloaded and
 * parsed the code for all of them (~4.4MB of JS on /game/[code]). On iOS that inflates the
 * tab's memory enough that Safari evicts it within seconds of being backgrounded — switch to
 * WhatsApp, come back, and the tab reloads from scratch. It also got monotonically worse with
 * every game added. Code-split per game, a player pays only for the game they opened.
 *
 * Exported so tests can resolve every module (a static import used to catch a broken player
 * view at import time; with code-splitting the test has to ask for them explicitly).
 */
export const PLAYER_VIEW_LOADERS: Partial<Record<GameType, () => Promise<GamePlayerView>>> = {
  secret_message: () =>
    import('@/components/secret-message/SecretMessageSenderView').then((m) => m.SecretMessageSenderView),
  bingo: () => import('@/components/bingo/BingoPlayerView').then((m) => m.BingoPlayerView),
  codewords: () => import('@/components/codewords/CodewordsPlayerView').then((m) => m.CodewordsPlayerView),
  trivia: () => import('@/components/trivia/TriviaPlayerView').then((m) => m.TriviaPlayerView),
  two_truths: () => import('@/components/two-truths/TwoTruthsPlayerView').then((m) => m.TwoTruthsPlayerView),
  i_call_on: () => import('@/components/npat/NpatPlayerView').then((m) => m.NpatPlayerView),
  landmine: () => import('@/components/landmine/LandminePlayerView').then((m) => m.LandminePlayerView),
  monopoly: () => import('@/components/monopoly/MonopolyPlayerView').then((m) => m.MonopolyPlayerView),
  yahtzee: () => import('@/components/yahtzee/YahtzeePlayerView').then((m) => m.YahtzeePlayerView),
  whot: () => import('@/components/whot/WhotPlayerView').then((m) => m.WhotPlayerView),
  rummy: () => import('@/components/rummy/RummyPlayerView').then((m) => m.RummyPlayerView),
  crazy_eights: () => import('@/components/crazy-eights/CrazyEightsPlayerView').then((m) => m.CrazyEightsPlayerView),
  uno: () => import('@/components/uno/UnoPlayerView').then((m) => m.UnoPlayerView),
  ludo: () => import('@/components/ludo/LudoPlayerView').then((m) => m.LudoPlayerView),
  mahjong: () => import('@/components/mahjong/MahjongPlayerView').then((m) => m.MahjongPlayerView),
  snake_and_ladder: () =>
    import('@/components/snake-and-ladder/SnakeLadderPlayerView').then((m) => m.SnakeLadderPlayerView),
  tic_tac_toe: () => import('@/components/tic-tac-toe/TicTacToePlayerView').then((m) => m.TicTacToePlayerView),
  chess: () => import('@/components/chess/ChessPlayerView').then((m) => m.ChessPlayerView),
  checkers: () => import('@/components/checkers/CheckersPlayerView').then((m) => m.CheckersPlayerView),
  checkers_international: () =>
    import('@/components/draughts10/Draughts10PlayerView').then((m) => m.Draughts10PlayerView),
  checkers_nigeria: () => import('@/components/draughts10/Draughts10PlayerView').then((m) => m.Draughts10PlayerView),
  ayo: () => import('@/components/ayo/AyoPlayerView').then((m) => m.AyoPlayerView),
  scrabble: () => import('@/components/scrabble/ScrabblePlayerView').then((m) => m.ScrabblePlayerView),
  describe_it: () => import('@/components/describe-it/DescribeItPlayerView').then((m) => m.DescribeItPlayerView),
  sudoku: () => import('@/components/sudoku/SudokuPlayerView').then((m) => m.SudokuPlayerView),
  word_hunt: () => import('@/components/word-hunt/WordHuntPlayerView').then((m) => m.WordHuntPlayerView),
  matching_pairs: () =>
    import('@/components/matching-pairs/MatchingPairsPlayerView').then((m) => m.MatchingPairsPlayerView),
  anonymous_messages: () =>
    import('@/components/anonymous-messages/AnonymousMessagesPlayerView').then((m) => m.AnonymousMessagesPlayerView),
  mafia: () => import('@/components/mafia/MafiaPlayerView').then((m) => m.MafiaPlayerView),
  quiplash: () => import('@/components/quiplash/QuiplashPlayerView').then((m) => m.QuiplashPlayerView),
  quick_draw: () => import('@/components/quick-draw/QuickDrawPlayerView').then((m) => m.QuickDrawPlayerView),
  word_rush: () => import('@/components/word-rush/WordRushPlayerView').then((m) => m.WordRushPlayerView),
  crossword: () => import('@/components/crossword/CrosswordPlayerView').then((m) => m.CrosswordPlayerView),
  word_search: () => import('@/components/word-search/WordSearchPlayerView').then((m) => m.WordSearchPlayerView),
  word_scramble: () =>
    import('@/components/word-scramble/WordScramblePlayerView').then((m) => m.WordScramblePlayerView),
  word_grouping: () =>
    import('@/components/word-grouping/WordGroupingPlayerView').then((m) => m.WordGroupingPlayerView),
  wordle_room: () => import('@/components/wordle-room/WordleRoomPlayerView').then((m) => m.WordleRoomPlayerView),
  troll_run: () => import('@/components/troll-run/TrollRunPlayerView').then((m) => m.TrollRunPlayerView),
  gofish: () => import('@/components/gofish/GoFishPlayerView').then((m) => m.GoFishPlayerView),
}

/** Shown while a game view's chunk loads — the same spinner the views render on their own
 *  loading screen, so the hand-off is invisible. */
function GameViewLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-11 h-11 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

/**
 * Games with a dedicated player view, keyed by canonical `GameType`.
 *
 * The poll-family games are intentionally absent: they fall through to the shared render in `PollGamePlayerExperience`.
 * To add a game's player view, add one entry to PLAYER_VIEW_LOADERS — no dispatch edits needed.
 */
export const PLAYER_VIEW_REGISTRY: Partial<Record<GameType, GamePlayerView>> = Object.fromEntries(
  Object.entries(PLAYER_VIEW_LOADERS).map(([type, load]) => [
    type,
    dynamic(load, { ssr: false, loading: GameViewLoading }),
  ])
) as Partial<Record<GameType, GamePlayerView>>
