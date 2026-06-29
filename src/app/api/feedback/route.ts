import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createAppFeedbackSchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
