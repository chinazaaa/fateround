import type { SupabaseClient } from '@supabase/supabase-js'
import type { GameType } from '@/types'
import { ayoFacts } from './ayo'
import { checkersFacts } from './checkers'
import { chessFacts } from './chess'
import { crazyEightsFacts } from './crazy-eights'
import { describeItFacts } from './describe-it'
import { mafiaFacts } from './mafia'
import { mahjongFacts } from './mahjong'
import { scrabbleFacts } from './scrabble'
import { codewordsFacts } from './codewords'
import { ludoFacts } from './ludo'
import { monopolyFacts } from './monopoly'
import { triviaFacts } from './trivia'
import { unoFacts } from './uno'
import { whotFacts } from './whot'
import { yahtzeeFacts } from './yahtzee'
import { bingoFacts } from './bingo'
import { crosswordFacts } from './crossword'
import { iCallOnFacts } from './i-call-on'
import { landmineFacts } from './landmine'
import { matchingPairsFacts } from './matching-pairs'
import { quiplashFacts } from './quiplash'
import { quickDrawFacts } from './quick-draw'
import { trollRunFacts } from './troll-run'
import { sudokuFacts } from './sudoku'
import { ticTacToeFacts } from './tic-tac-toe'
import { twoTruthsFacts } from './two-truths'
import { wordHuntFacts } from './word-hunt'
import { wordRushFacts } from './word-rush'
import { wordScrambleFacts } from './word-scramble'
import { wordSearchFacts } from './word-search'
import { wordGroupingFacts } from './word-grouping'
import { snakeAndLadderFacts } from './snake-and-ladder'
import { wordleRoomFacts } from './wordle-room'

/**
 * Per-game facts for the award pass.
 *
 * The award pass used to emit only two things every game type shared (`big_room_games`,
 * `late_night_games`). Anything a trophy wanted to know ABOUT a game — how many questions you
 * got right, whether you led from the first round — had nowhere to come from. This is that
 * hook: one function per game type, returning the integer facts for every player in one
 * finished round, folded into `player_stats.counters` alongside the shared ones.
 *
 * WHY A BUILDER RUNS ONCE PER ROUND, NOT ONCE PER PLAYER. Facts are derived from the round's own
 * rows — every answer, every guess, the whole move list. Called per player, each builder re-read
 * the same rows and threw away all but one player's share: a 40-player Trivia game meant reading
 * 400 answer rows forty times over. One call per round reads them once.
 *
 * RULES FOR A FACTS BUILDER:
 *  - It must be TOTAL. A finished round is being recorded; a builder that throws would lose the
 *    players' `games_played` too. Every builder is wrapped below and falls back to empty.
 *  - It must return LIFETIME-SUMMABLE integers. Counters accumulate, so per-game achievements
 *    are 0/1 flags counted once ("did it in a round"), never in-round values like a best streak.
 *  - It reads only PERSISTED state. It runs after the round is over; nothing is live any more.
 *  - It returns entries only for players it has something to say about. A missing entry is not
 *    an error.
 *
 * Games absent from the map contribute no facts, which is correct for one that hasn't been built
 * yet — no error, no invented data.
 */

export type FactsContext = {
  timerSeconds: number | null
  questionSource: string | null
  /** The game's cosmetic theme (e.g. 'naija'). Some games treat it as an edition. Null if unset. */
  theme: string | null
  /** Seated player ids (spectators excluded). Its length is the room size for size-gated facts. */
  seated: string[]
  /**
   * Player ids who won. Empty for a draw AND for a game whose winner the server cannot
   * determine — a builder must therefore never read "not in winners" as "lost".
   */
  winners: string[]
}

type FactsBuilder = (
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
) => Promise<Map<string, Record<string, number>>>

const BUILDERS: Partial<Record<GameType, FactsBuilder>> = {
  ayo: ayoFacts,
  checkers: checkersFacts,
  checkers_international: checkersFacts,
  checkers_nigeria: checkersFacts,
  chess: chessFacts,
  codewords: codewordsFacts,
  crazy_eights: crazyEightsFacts,
  describe_it: describeItFacts,
  ludo: ludoFacts,
  mafia: mafiaFacts,
  mahjong: mahjongFacts,
  monopoly: monopolyFacts,
  scrabble: scrabbleFacts,
  trivia: triviaFacts,
  uno: unoFacts,
  whot: whotFacts,
  yahtzee: yahtzeeFacts,
  bingo: bingoFacts,
  crossword: crosswordFacts,
  i_call_on: iCallOnFacts,
  landmine: landmineFacts,
  matching_pairs: matchingPairsFacts,
  quiplash: quiplashFacts,
  quick_draw: quickDrawFacts,
  troll_run: trollRunFacts,
  sudoku: sudokuFacts,
  tic_tac_toe: ticTacToeFacts,
  two_truths: twoTruthsFacts,
  word_hunt: wordHuntFacts,
  word_rush: wordRushFacts,
  word_scramble: wordScrambleFacts,
  word_search: wordSearchFacts,
  word_grouping: wordGroupingFacts,
  snake_and_ladder: snakeAndLadderFacts,
  wordle_room: wordleRoomFacts,
}

/** True when this game type emits per-game facts, for the admin UI's benefit. */
export function hasGameFacts(gameType: GameType): boolean {
  return Boolean(BUILDERS[gameType])
}

/**
 * Facts for every player in one finished round.
 *
 * Never throws and never rejects: a fact we couldn't derive is a missing trophy, but a throw
 * here would cost every player in the room their finished game. Losing the extras is always the
 * better failure.
 */
export async function buildGameFacts(
  supabase: SupabaseClient,
  gameType: GameType,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const builder = BUILDERS[gameType]
  if (!builder) return new Map()
  try {
    return await builder(supabase, gameId, ctx)
  } catch {
    return new Map()
  }
}
