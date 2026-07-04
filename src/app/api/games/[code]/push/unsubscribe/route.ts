import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { internalErrorMessage } from '@/lib/api-errors'

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { data, error: bodyError } = await parseJsonBody(req, unsubscribeSchema)
  if (bodyError) return bodyError

  const gameId = code.toUpperCase()

  // The endpoint is an unguessable capability URL the push service issued to this
  // device, so it authorizes the delete on its own — no resume_token needed. Scope to
  // the game as well so a stray endpoint can't wipe another game's row. Idempotent:
  // deleting an already-gone row is still success.
  const { error } = await getSupabaseAdmin()
    .from('push_subscriptions')
    .delete()
    .eq('game_id', gameId)
    .eq('endpoint', data.endpoint)

  if (error) {
    return NextResponse.json({ error: internalErrorMessage('games/code/push/unsubscribe', error) }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
