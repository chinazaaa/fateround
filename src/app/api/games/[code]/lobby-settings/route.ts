import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { boardGameLobbySettingsSchema } from '@/lib/validation'
import {
  isLudoGame,
  isMonopolyGame,
  isSnakeAndLadderGame,
  isWhotGame,
  isYahtzeeGame,
  isWordHuntGame,
  parseGameType,
} from '@/lib/game-types'
import { clampBoardGameTurnTimer, type BoardGameLobbyType } from '@/lib/board-game-lobby-settings'
import { clampMonopolyGameDuration } from '@/lib/monopoly'
import { clampWhotGameDuration } from '@/lib/whot'
import { clampWordHuntTimer } from '@/lib/word-hunt'
import { clampLobbyMaxPlayers, fetchGamePlayerLimits, type LobbyLimitGameType } from '@/lib/game-limits'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

function boardGameLobbyType(gameType: string): BoardGameLobbyType | null {
  const parsed = parseGameType(gameType)
  if (isMonopolyGame(parsed)) return 'monopoly'
  if (isYahtzeeGame(parsed)) return 'yahtzee'
  if (isWhotGame(parsed)) return 'whot'
  if (isLudoGame(parsed)) return 'ludo'
  if (isSnakeAndLadderGame(parsed)) return 'snake_and_ladder'
  return null
}

function timedLobbyLimitType(gameType: string): LobbyLimitGameType | null {
  const parsed = parseGameType(gameType)
  if (isWordHuntGame(parsed)) return 'word_hunt'
  return null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const raw = await req.json()
  const parsed = boardGameLobbySettingsSchema.safeParse({ ...raw, gameId: raw.gameId ?? code })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const {
    hostToken,
    max_players,
    timer_seconds,
    game_duration_seconds,
    whot_pick3_enabled,
    whot_cards_enabled,
    whot_number_calls_enabled,
    whot_pick2_stacking,
  } = parsed.data
  const gameCode = parsed.data.gameId.toUpperCase()

  if (
    max_players === undefined &&
    timer_seconds === undefined &&
    game_duration_seconds === undefined &&
    whot_pick3_enabled === undefined &&
    whot_cards_enabled === undefined &&
    whot_number_calls_enabled === undefined &&
    whot_pick2_stacking === undefined
  ) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data: game } = await supabase.from('games').select('*').eq('id', gameCode).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (game.status !== 'waiting') {
    return NextResponse.json(
      { error: 'Settings can only be changed in the lobby before the game starts' },
      { status: 400 }
    )
  }

  const boardLobbyType = boardGameLobbyType(game.game_type)
  const timedLobbyType = timedLobbyLimitType(game.game_type)
  if (!boardLobbyType && !timedLobbyType) {
    return NextResponse.json({ error: 'This game type does not support lobby settings here' }, { status: 400 })
  }

  const lobbyLimits = await fetchGamePlayerLimits(supabase)
  const limitKey = (timedLobbyType ?? boardLobbyType) as LobbyLimitGameType
  const gameUpdate: Record<string, unknown> = {}

  if (max_players !== undefined) {
    const nextMax = clampLobbyMaxPlayers(limitKey, max_players, lobbyLimits)
    const { count: playerCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameCode)
    if ((playerCount ?? 0) > nextMax) {
      return NextResponse.json(
        { error: `Already have ${playerCount} players — remove someone or pick at least ${playerCount}` },
        { status: 400 }
      )
    }
    gameUpdate.max_players = nextMax
  }

  if (timer_seconds !== undefined) {
    if (timedLobbyType === 'word_hunt') {
      gameUpdate.timer_seconds = clampWordHuntTimer(timer_seconds)
    } else if (boardLobbyType) {
      gameUpdate.timer_seconds = clampBoardGameTurnTimer(timer_seconds, boardLobbyType)
    }
  }

  if (game_duration_seconds !== undefined) {
    if (!boardLobbyType) {
      return NextResponse.json({ error: 'This game type does not support game length settings' }, { status: 400 })
    }
    if (boardLobbyType === 'monopoly') {
      gameUpdate.game_duration_seconds = clampMonopolyGameDuration(game_duration_seconds)
    } else if (boardLobbyType === 'whot') {
      gameUpdate.game_duration_seconds = clampWhotGameDuration(game_duration_seconds)
    } else {
      return NextResponse.json({ error: 'This game type does not support game length settings' }, { status: 400 })
    }
  }

  if (boardLobbyType === 'whot') {
    if (whot_pick3_enabled !== undefined) gameUpdate.whot_pick3_enabled = whot_pick3_enabled
    if (whot_cards_enabled !== undefined) gameUpdate.whot_cards_enabled = whot_cards_enabled
    if (whot_number_calls_enabled !== undefined) {
      gameUpdate.whot_number_calls_enabled = whot_number_calls_enabled
    }
    if (whot_pick2_stacking !== undefined) gameUpdate.whot_pick2_stacking = whot_pick2_stacking
  } else if (
    whot_pick3_enabled !== undefined ||
    whot_cards_enabled !== undefined ||
    whot_number_calls_enabled !== undefined ||
    whot_pick2_stacking !== undefined
  ) {
    return NextResponse.json({ error: 'House rules only apply to Whot games' }, { status: 400 })
  }

  const { data: updated, error } = await supabase.from('games').update(gameUpdate).eq('id', gameCode).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, game: updated })
}
