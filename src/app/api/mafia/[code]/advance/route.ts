import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { runMafiaAdvance } from '@/lib/mafia-advance'
import type { MafiaPhase } from '@/types'

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameId = code.toUpperCase()
  const admin = getSupabaseAdmin()

  let body: { hostToken?: unknown; nextPhase?: unknown; isAuto?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { hostToken, nextPhase, isAuto } = body

  const [{ data: game }, { data: mafiaSession }] = await Promise.all([
    admin.from('games').select('host_token').eq('id', gameId).maybeSingle(),
    admin.from('mafia_sessions').select('phase_deadline').eq('game_id', gameId).maybeSingle(),
  ])

  if (!game || !mafiaSession) {
    return NextResponse.json({ error: 'Game or session not initialized' }, { status: 404 })
  }

  let authorized = false
  if (typeof hostToken === 'string' && game.host_token === hostToken) {
    authorized = true
  } else if (isAuto === true && mafiaSession.phase_deadline) {
    const deadlineTime = new Date(mafiaSession.phase_deadline).getTime()
    if (Date.now() + 1000 >= deadlineTime) {
      authorized = true
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized or phase not expired yet' }, { status: 403 })
  }

  const result = await runMafiaAdvance(gameId, {
    nextPhase: typeof nextPhase === 'string' ? (nextPhase as MafiaPhase) : undefined,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ success: true })
}
