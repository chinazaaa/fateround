import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseGameType, isDescribeItGame } from '@/lib/game-types'
import { describeItSettingsSchema } from '@/lib/validation'
import { clampDescribeItRounds, clampDescribeItTeams, clampDescribeItTurnSeconds } from '@/lib/describe-it'
import { parseDescribeItWords } from '@/lib/describe-it-words'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest) {
  const parsed = describeItSettingsSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const { gameId, hostToken, numTeams, turnSeconds, rounds, words } = parsed.data
  const code = gameId.toUpperCase()

  const { data: game } = await supabase
    .from('games')
    .select('host_token, game_type, status')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isDescribeItGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Describe It game' }, { status: 400 })
  }
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (game.status !== 'waiting')
    return NextResponse.json({ error: 'Settings are locked once the game starts' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (numTeams != null) update.describe_it_num_teams = clampDescribeItTeams(numTeams)
  if (turnSeconds != null) update.timer_seconds = clampDescribeItTurnSeconds(turnSeconds)
  if (rounds != null) update.rounds_count = clampDescribeItRounds(rounds)
  if (words !== undefined) {
    const parsedWords = parseDescribeItWords(words)
    update.question_source = parsedWords.length > 0 ? 'custom' : 'platform'
    update.custom_questions = parsedWords.length > 0 ? parsedWords : null
  }

  if (Object.keys(update).length > 0) {
    const { error } = await supabase.from('games').update(update).eq('id', code)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // If the team count shrank, drop assignments for teams that no longer exist
  // so those players can re-pick (host can auto-balance afterwards).
  if (numTeams != null) {
    await supabase.from('describe_it_players').delete().eq('game_id', code).gt('team', clampDescribeItTeams(numTeams))
  }

  return NextResponse.json({ success: true })
}
