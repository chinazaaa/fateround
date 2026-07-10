import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isWordRushGame } from '@/lib/game-types'
import {
  clampWordRushMaxPlayers,
  clampWordRushDifficulty,
  clampWordRushMode,
  clampWordRushPromptMode,
  clampWordRushRounds,
  clampWordRushTeams,
  clampWordRushTurnSeconds,
} from '@/lib/word-rush'
import { wordRushSettingsSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data, error: bodyError } = await parseJsonBody(req, wordRushSettingsSchema)
  if (bodyError) return bodyError
  const { gameId, hostToken, mode, promptMode, difficulty, numTeams, turnSeconds, rounds, maxPlayers } = data
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('status, game_type, host_token')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Invalid host token' }, { status: 403 })
  if (game.status !== 'waiting') return NextResponse.json({ error: 'Lobby is closed' }, { status: 400 })
  if (!isWordRushGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Word Rush game' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (mode !== undefined) update.word_rush_mode = clampWordRushMode(mode)
  if (promptMode !== undefined) update.word_rush_prompt_mode = clampWordRushPromptMode(promptMode)
  if (difficulty !== undefined) update.word_rush_difficulty = clampWordRushDifficulty(difficulty)
  if (numTeams !== undefined) update.word_rush_num_teams = clampWordRushTeams(numTeams)
  if (turnSeconds !== undefined) update.timer_seconds = clampWordRushTurnSeconds(turnSeconds)
  if (rounds !== undefined) update.rounds_count = clampWordRushRounds(rounds)
  if (maxPlayers !== undefined) update.max_players = clampWordRushMaxPlayers(maxPlayers)

  if (Object.keys(update).length === 0) return NextResponse.json({ success: true })

  const { error } = await supabase.from('games').update(update).eq('id', code)
  if (error) return NextResponse.json({ error: 'Could not save settings' }, { status: 500 })
  return NextResponse.json({ success: true })
}
