import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isBingoGame,
  isCodewordsGame,
  isMostLikelyTo,
  isThisOrThat,
  isTriviaGame,
  isBinaryChoiceGame,
  isWouldYouRather,
  parseGameType,
} from '@/lib/game-types'
import type { Game } from '@/types'

export type LateJoinContext = {
  statusLine: string
  playerDetail: string
  viewerDetail: string
}

export async function fetchLateJoinContext(
  supabase: SupabaseClient,
  gameCode: string,
  game: Pick<Game, 'game_type' | 'status' | 'current_round_number' | 'rounds_count'>
): Promise<LateJoinContext | null> {
  if (game.status !== 'active') return null

  const type = parseGameType(game.game_type)
  const current = game.current_round_number ?? 1
  const total = game.rounds_count ?? 0
  const roundLabel = (n: number) => (total > 0 ? `${n} of ${total}` : String(n))

  if (isTriviaGame(type)) {
    return {
      statusLine: `Question ${roundLabel(current)}`,
      playerDetail:
        'You\'ll answer from the current question onward. Earlier questions and points can\'t be made up.',
      viewerDetail: 'Watch the current question and leaderboard live — you can\'t answer.',
    }
  }

  if (isThisOrThat(type)) {
    return {
      statusLine: `Round ${roundLabel(current)}`,
      playerDetail: 'You\'ll vote on the current round only. Past rounds can\'t be voted on.',
      viewerDetail: 'Watch the current round and results live — you can\'t vote.',
    }
  }

  if (isWouldYouRather(type)) {
    return {
      statusLine: `Question ${roundLabel(current)}`,
      playerDetail: 'You\'ll vote on the current question only. Past questions can\'t be voted on.',
      viewerDetail: 'Watch the current question and results live — you can\'t vote.',
    }
  }

  if (isMostLikelyTo(type)) {
    return {
      statusLine: `Round ${roundLabel(current)}`,
      playerDetail: 'You\'ll vote on the current prompt only. Past rounds can\'t be voted on.',
      viewerDetail: 'Watch the current round and results live — you can\'t vote.',
    }
  }

  if (isBinaryChoiceGame(type)) {
    return {
      statusLine: `Round ${roundLabel(current)}`,
      playerDetail: 'You\'ll participate from the current round only. Earlier rounds are skipped.',
      viewerDetail: 'Watch live — you can\'t vote until the next lobby opens.',
    }
  }

  if (isBingoGame(type)) {
    const { count } = await supabase
      .from('bingo_called_numbers')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameCode.toUpperCase())
    const called = count ?? 0
    return {
      statusLine:
        called === 0 ? 'Game started — no numbers called yet' : `${called} number${called === 1 ? '' : 's'} called`,
      playerDetail:
        called === 0
          ? 'You\'ll get a fresh card and play from the first call.'
          : `You'll get a fresh card. The ${called} number${called === 1 ? '' : 's'} already called will show on your card — play from here.`,
      viewerDetail: 'Watch called numbers and the board live — you won\'t get a card.',
    }
  }

  if (isCodewordsGame(type)) {
    return {
      statusLine: 'Round in progress',
      playerDetail:
        'You\'ll be randomly assigned to a team as an operative and jump into the current round.',
      viewerDetail: 'Watch the board and teams live — you can\'t play.',
    }
  }

  return {
    statusLine: 'Game in progress',
    playerDetail: 'You\'ll join at the current point in the game — nothing before that carries over.',
    viewerDetail: 'Watch live — you can\'t participate until the next lobby opens.',
  }
}
