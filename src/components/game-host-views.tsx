'use client'

import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'
import type { GameType } from '@/types'

export type GameHostView = ComponentType<{ gameCode: string; hostToken: string }>

/**
 * Lazy loaders for each game's dedicated host view, keyed by canonical `GameType`.
 *
 * These are `import()` calls, not top-level imports, and that is load-bearing: a static
 * import of all 39 views put every game in the same bundle, so opening ONE game downloaded and
 * parsed the code for all of them (~4.4MB of JS on /game/[code]). On iOS that inflates the
 * tab's memory enough that Safari evicts it within seconds of being backgrounded — switch to
 * WhatsApp, come back, and the tab reloads from scratch. It also got monotonically worse with
 * every game added. Code-split per game, a player pays only for the game they opened.
 *
 * Exported so tests can resolve every module (a static import used to catch a broken host
 * view at import time; with code-splitting the test has to ask for them explicitly).
 */
export const HOST_VIEW_LOADERS: Partial<Record<GameType, () => Promise<GameHostView>>> = {
  secret_message: () =>
    import('@/components/secret-message/SecretMessageHostView').then((m) => m.SecretMessageHostView),
  bingo: () => import('@/components/bingo/BingoHostView').then((m) => m.BingoHostView),
  codewords: () => import('@/components/codewords/CodewordsHostView').then((m) => m.CodewordsHostView),
  trivia: () => import('@/components/trivia/TriviaHostView').then((m) => m.TriviaHostView),
  two_truths: () => import('@/components/two-truths/TwoTruthsHostView').then((m) => m.TwoTruthsHostView),
  i_call_on: () => import('@/components/npat/NpatHostView').then((m) => m.NpatHostView),
  landmine: () => import('@/components/landmine/LandmineHostView').then((m) => m.LandmineHostView),
  monopoly: () => import('@/components/monopoly/MonopolyHostView').then((m) => m.MonopolyHostView),
  yahtzee: () => import('@/components/yahtzee/YahtzeeHostView').then((m) => m.YahtzeeHostView),
  whot: () => import('@/components/whot/WhotHostView').then((m) => m.WhotHostView),
  rummy: () => import('@/components/rummy/RummyHostView').then((m) => m.RummyHostView),
  crazy_eights: () => import('@/components/crazy-eights/CrazyEightsHostView').then((m) => m.CrazyEightsHostView),
  uno: () => import('@/components/uno/UnoHostView').then((m) => m.UnoHostView),
  ludo: () => import('@/components/ludo/LudoHostView').then((m) => m.LudoHostView),
  mahjong: () => import('@/components/mahjong/MahjongHostView').then((m) => m.MahjongHostView),
  snake_and_ladder: () =>
    import('@/components/snake-and-ladder/SnakeLadderHostView').then((m) => m.SnakeLadderHostView),
  tic_tac_toe: () => import('@/components/tic-tac-toe/TicTacToeHostView').then((m) => m.TicTacToeHostView),
  chess: () => import('@/components/chess/ChessHostView').then((m) => m.ChessHostView),
  checkers: () => import('@/components/checkers/CheckersHostView').then((m) => m.CheckersHostView),
  checkers_international: () => import('@/components/draughts10/Draughts10HostView').then((m) => m.Draughts10HostView),
  checkers_nigeria: () => import('@/components/draughts10/Draughts10HostView').then((m) => m.Draughts10HostView),
  ayo: () => import('@/components/ayo/AyoHostView').then((m) => m.AyoHostView),
  scrabble: () => import('@/components/scrabble/ScrabbleHostView').then((m) => m.ScrabbleHostView),
  describe_it: () => import('@/components/describe-it/DescribeItHostView').then((m) => m.DescribeItHostView),
  sudoku: () => import('@/components/sudoku/SudokuHostView').then((m) => m.SudokuHostView),
  word_hunt: () => import('@/components/word-hunt/WordHuntHostView').then((m) => m.WordHuntHostView),
  matching_pairs: () =>
    import('@/components/matching-pairs/MatchingPairsHostView').then((m) => m.MatchingPairsHostView),
  anonymous_messages: () =>
    import('@/components/anonymous-messages/AnonymousMessagesHostView').then((m) => m.AnonymousMessagesHostView),
  mafia: () => import('@/components/mafia/MafiaHostView').then((m) => m.MafiaHostView),
  quiplash: () => import('@/components/quiplash/QuiplashHostView').then((m) => m.QuiplashHostView),
  quick_draw: () => import('@/components/quick-draw/QuickDrawHostView').then((m) => m.QuickDrawHostView),
  word_rush: () => import('@/components/word-rush/WordRushHostView').then((m) => m.WordRushHostView),
  crossword: () => import('@/components/crossword/CrosswordHostView').then((m) => m.CrosswordHostView),
  word_search: () => import('@/components/word-search/WordSearchHostView').then((m) => m.WordSearchHostView),
  word_scramble: () => import('@/components/word-scramble/WordScrambleHostView').then((m) => m.WordScrambleHostView),
  word_grouping: () => import('@/components/word-grouping/WordGroupingHostView').then((m) => m.WordGroupingHostView),
  wordle_room: () => import('@/components/wordle-room/WordleRoomHostView').then((m) => m.WordleRoomHostView),
  troll_run: () => import('@/components/troll-run/TrollRunHostView').then((m) => m.TrollRunHostView),
  gofish: () => import('@/components/gofish/GoFishHostView').then((m) => m.GoFishHostView),
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
 * Games with a dedicated host view, keyed by canonical `GameType`.
 *
 * The poll-family games are intentionally absent: they fall through to the inline poll-host render in `host/[code]/page.tsx`.
 * To add a game's host view, add one entry to HOST_VIEW_LOADERS — no dispatch edits needed.
 */
export const HOST_VIEW_REGISTRY: Partial<Record<GameType, GameHostView>> = Object.fromEntries(
  Object.entries(HOST_VIEW_LOADERS).map(([type, load]) => [
    type,
    dynamic(load, { ssr: false, loading: GameViewLoading }),
  ])
) as Partial<Record<GameType, GameHostView>>
