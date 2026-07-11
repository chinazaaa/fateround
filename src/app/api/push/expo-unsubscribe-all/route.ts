import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { internalErrorMessage } from '@/lib/api-errors'

const schema = z.object({
  expoPushToken: z.string().min(1),
})

/**
 * Device-wide push opt-out: removes every subscription for this Expo push token
 * across all games (the mobile Settings › Notifications master switch). The
 * `mobile_push_tokens` table is keyed by `expo_push_token`, so a token has at
 * most one row — but we delete by token (no game filter) so it always clears.
 */
export async function POST(req: NextRequest) {
  const { data, error: bodyError } = await parseJsonBody(req, schema)
  if (bodyError) return bodyError

  const { error } = await getSupabaseAdmin()
    .from('mobile_push_tokens')
    .delete()
    .eq('expo_push_token', data.expoPushToken)

  if (error) {
    return NextResponse.json(
      { error: internalErrorMessage('push/expo-unsubscribe-all', error) },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
