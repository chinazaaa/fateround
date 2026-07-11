import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { internalErrorMessage } from '@/lib/api-errors'

const unsubscribeSchema = z.object({
  expoPushToken: z.string().min(1),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { data, error: bodyError } = await parseJsonBody(req, unsubscribeSchema)
  if (bodyError) return bodyError

  const gameId = code.toUpperCase()

  const { error } = await getSupabaseAdmin()
    .from('mobile_push_tokens')
    .delete()
    .eq('game_id', gameId)
    .eq('expo_push_token', data.expoPushToken)

  if (error) {
    return NextResponse.json(
      { error: internalErrorMessage('games/code/push/expo-unsubscribe', error) },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
