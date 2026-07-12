import type { SupabaseClient } from '@supabase/supabase-js'
import type { Game } from '@fateround/shared'
import {
  isBingoGame,
  isCodewordsGame,
  isCrazyEightsGame,
  isCrosswordGame,
  isMonopolyGame,
  isQuiplashGame,
  isSudokuGame,
  isTriviaGame,
  isWhotGame,
  isWordHuntGame,
  isWordRushGame,
  isYahtzeeGame,
  parseGameType,
} from '@fateround/shared/game-type-checks'
import {
  isBinaryChoiceGame,
  isMostLikelyTo,
  isNeverHaveIEver,
  isThisOrThat,
  isWouldYouRather,
} from '@fateround/shared/poll-games'

export type LateJoinContext = {
  statusLine: string
  playerDetail: string
  viewerDetail: string
}

type GameFields = Pick<
  Game,
  'game_type' | 'status' | 'current_round_number' | 'rounds_count' | 'session_started_at' | 'timer_seconds'
>

export async function fetchLateJoinContext(
  supabase: SupabaseClient,
  gameCode: string,
  game: GameFields
): Promise<LateJoinContext | null> {
  if (game.status !== 'active') return null

  const type = parseGameType(game.game_type)
  const current = game.current_round_number ?? 1
  const total = game.rounds_count ?? 0
  const roundLabel = (n: number) => (total > 0 ? `${n} of ${total}` : String(n))

  if (isTriviaGame(type)) {
    return {
      statusLine: `Question ${roundLabel(current)}`,
      playerDetail: "You'll answer from the current question onward. Earlier questions and points can't be made up.",
      viewerDetail: "Watch the current question and leaderboard live — you can't answer.",
    }
  }

  if (isThisOrThat(type)) {
    return {
      statusLine: `Round ${roundLabel(current)}`,
      playerDetail: "You'll vote on the current round only. Past rounds can't be voted on.",
      viewerDetail: "Watch the current round and results live — you can't vote.",
    }
  }

  if (isWouldYouRather(type)) {
    return {
      statusLine: `Question ${roundLabel(current)}`,
      playerDetail: "You'll vote on the current question only. Past questions can't be voted on.",
      viewerDetail: "Watch the current question and results live — you can't vote.",
    }
  }

  if (isNeverHaveIEver(type)) {
    return {
      statusLine: `Round ${roundLabel(current)}`,
      playerDetail: "You'll vote on the current prompt only. Past rounds can't be voted on.",
      viewerDetail: "Watch the current round and results live — you can't vote.",
    }
  }

  if (isMostLikelyTo(type)) {
    return {
      statusLine: `Round ${roundLabel(current)}`,
      playerDetail: "You'll vote on the current prompt only. Past rounds can't be voted on.",
      viewerDetail: "Watch the current round and results live — you can't vote.",
    }
  }

  if (isSudokuGame(type)) {
    return {
      statusLine: 'Puzzle in progress',
      playerDetail: 'Jump into the same puzzle and race to claim the cells still open.',
      viewerDetail: "Watch the board fill in and live scores — you can't claim cells.",
    }
  }

  if (isCrosswordGame(type)) {
    return {
      statusLine: 'Puzzle in progress',
      playerDetail: 'Jump into the same crossword and race to solve the Across and Down clues still open.',
      viewerDetail: "Watch the grid fill in and live scores — you can't fill cells.",
    }
  }

  if (isBinaryChoiceGame(type)) {
    return {
      statusLine: `Round ${roundLabel(current)}`,
      playerDetail: "You'll participate from the current round only. Earlier rounds are skipped.",
      viewerDetail: "Watch live — you can't vote until the next lobby opens.",
    }
  }

  if (isWordHuntGame(type)) {
    const timerSec = game.timer_seconds ?? 180
    let statusLine = 'Hunt in progress'
    if (game.session_started_at) {
      const elapsed = Math.floor((Date.now() - new Date(game.session_started_at).getTime()) / 1000)
      const left = Math.max(0, timerSec - elapsed)
      if (left <= 0) {
        statusLine = 'Time is up — finalizing scores'
      } else {
        const m = Math.floor(left / 60)
        const s = left % 60
        statusLine = m > 0 ? `${m}m ${s}s left` : `${s}s left`
      }
    }
    return {
      statusLine,
      playerDetail: 'Same letter grid as everyone else — find words before time runs out.',
      viewerDetail: "Watch the grid and live scores — you can't submit words.",
    }
  }

  if (isBingoGame(type)) {
    const { count } = await supabase
      .from('bingo_called_numbers')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', gameCode.toUpperCase())
    const called = count ?? 0
    return {
      statusLine:
        called === 0 ? 'Game started — no numbers called yet' : `${called} number${called === 1 ? '' : 's'} called`,
      playerDetail:
        called === 0
          ? "You'll get a fresh card and play from the first call."
          : `You'll get a fresh card. The ${called} number${called === 1 ? '' : 's'} already called will show on your card — play from here.`,
      viewerDetail: "Watch called numbers and the board live — you won't get a card.",
    }
  }

  if (isCodewordsGame(type)) {
    return {
      statusLine: 'Round in progress',
      playerDetail: "You'll be randomly assigned to a team as an operative and jump into the current round.",
      viewerDetail: "Watch the board and teams live — you can't play.",
    }
  }

  if (isWordRushGame(type)) {
    return {
      statusLine: 'Round in progress',
      playerDetail:
        "You'll join the team with the fewest players and jump into the current round. Pick viewer mode if you only want to watch.",
      viewerDetail: "Watch scores and the live round — you can't submit answers.",
    }
  }

  if (isQuiplashGame(type)) {
    const { data: session } = await supabase
      .from('quiplash_sessions')
      .select('phase')
      .eq('game_id', gameCode.toUpperCase())
      .maybeSingle()
    const phaseLabel =
      session?.phase === 'writing'
        ? 'Writing answers'
        : session?.phase === 'voting'
          ? 'Voting on battles'
          : session?.phase === 'reveal'
            ? 'Battle results'
            : 'Round in progress'
    return {
      statusLine: `Round ${roundLabel(current)} · ${phaseLabel}`,
      playerDetail: "You'll answer and vote from the current round onward. Earlier rounds can't be made up.",
      viewerDetail: "Watch prompts, answers, and battles live — you can't submit or vote.",
    }
  }

  if (isMonopolyGame(type)) {
    return {
      statusLine: 'Game in progress',
      playerDetail: 'Monopoly does not allow late players — watch only.',
      viewerDetail: "Watch the board, trades, and standings live — you can't play.",
    }
  }

  if (isYahtzeeGame(type)) {
    return {
      statusLine: 'Game in progress',
      playerDetail: 'Yahtzee does not allow late players — watch only.',
      viewerDetail: "Watch scores and dice rolls live — you can't play.",
    }
  }

  if (isWhotGame(type)) {
    return {
      statusLine: 'Game in progress',
      playerDetail: 'Whot does not allow late players — watch only.',
      viewerDetail: "Watch the table and hands live — you can't play.",
    }
  }

  if (isCrazyEightsGame(type)) {
    return {
      statusLine: 'Game in progress',
      playerDetail: 'Crazy Eights does not allow late players — watch only.',
      viewerDetail: "Watch the table and hands live — you can't play.",
    }
  }

  return {
    statusLine: 'Game in progress',
    playerDetail: "You'll join at the current point in the game — nothing before that carries over.",
    viewerDetail: "Watch live — you can't participate until the next lobby opens.",
  }
}
