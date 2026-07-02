import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAnon } from '@/lib/supabase-anon'
import { createAppFeedbackSchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'

const supabase = getSupabaseAnon()

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, createAppFeedbackSchema)
  if (bodyError) return bodyError

  const { gameType, category, message, pageUrl } = body

  const { error } = await supabase.from('app_feedback').insert({
    game_type: gameType,
    category,
    message,
    page_url: pageUrl,
  })

  if (error) return NextResponse.json({ error: internalErrorMessage('feedback', error) }, { status: 500 })

  return NextResponse.json({ success: true })
}
