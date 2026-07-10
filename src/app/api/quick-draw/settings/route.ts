import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isQuickDrawGame } from '@/lib/game-types'
import { internalErrorMessage } from '@/lib/api-errors'
import { quickDrawSettingsSchema } from '@/lib/validation'
import { parseDescribeItWords } from '@/lib/describe-it-words'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data, error: bodyError } = await parseJsonBody(req, quickDrawSettingsSchema)
  if (bodyError) return bodyError
  const { gameId, hostToken, words } = data
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('host_token, game_type, status')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isQuickDrawGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Quick Draw game' }, { status: 400 })
  }
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (game.status !== 'waiting') {
    return NextResponse.json({ error: 'Settings are locked once the game starts' }, { status: 400 })
  }

  if (words === undefined) return NextResponse.json({ success: true })

  const parsedWords = parseDescribeItWords(words)
  const { error } = await supabase
    .from('games')
    .update({
      question_source: parsedWords.length > 0 ? 'custom' : 'platform',
      custom_questions: parsedWords.length > 0 ? parsedWords : null,
    })
    .eq('id', code)
  if (error) return NextResponse.json({ error: internalErrorMessage('quick-draw:settings', error) }, { status: 500 })

  return NextResponse.json({
    success: true,
    question_source: parsedWords.length > 0 ? 'custom' : 'platform',
    custom_questions: parsedWords.length > 0 ? parsedWords : null,
  })
}
