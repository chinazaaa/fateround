import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { notifyTournamentEvent } from '@/lib/tournament-push'

/**
 * Tournament follow-up — direct host transfer for a scheduled tournament.
 *
 * Unlike the post-start transfer-host route (which nominates and waits for
 * the target to claim), this endpoint mints a fresh host_token immediately
 * and returns it. Only usable before the tournament starts. Fires TWO
 * targeted pushes (see notifyTournamentEvent's per-player filter):
 *   1. transfer_new_host → the new host only  ("You're now hosting")
 *   2. transfer_notice   → everyone else      ("[old] handed the game")
 *
 * Targeting reads role_key on tournament_push_subscriptions (populated as
 * `player:<id>` when a player subscribes with their resume token).
 */

const schema = z.object({
  hostToken: z.string().min(1),
  newHostPlayerId: z.string().uuid(),
  oldHostName: z.string().max(60).optional(),
  newHostName: z.string().max(60).optional(),
})

function generateHostToken(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: tournament } = await admin
    .from('tournaments')
    .select('id, title, host_token, status')
    .eq('id', tournamentId)
    .maybeSingle()
  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  if (tournament.host_token !== parsed.data.hostToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  if (tournament.status === 'finished' || tournament.status === 'active') {
    return NextResponse.json({ error: 'Transfer is only available before the tournament starts.' }, { status: 400 })
  }

  // Target must be a real, non-eliminated tournament player.
  const { data: player } = await admin
    .from('tournament_players')
    .select('id, name, is_eliminated')
    .eq('tournament_id', tournamentId)
    .eq('id', parsed.data.newHostPlayerId)
    .maybeSingle()
  if (!player) {
    return NextResponse.json({ error: 'Player not registered in this tournament.' }, { status: 404 })
  }
  if (player.is_eliminated) {
    return NextResponse.json({ error: 'Cannot transfer host to an eliminated player.' }, { status: 400 })
  }

  const newHostToken = generateHostToken()
  const { error } = await admin
    .from('tournaments')
    .update({
      host_token: newHostToken,
      // Clear any pending nomination — the direct transfer bypasses the
      // claim flow entirely.
      pending_host_player_id: null,
    })
    .eq('id', tournamentId)
  if (error) return NextResponse.json({ error: internalErrorMessage('tournaments/transfer', error) }, { status: 500 })

  const oldName = parsed.data.oldHostName ?? 'The host'
  const newName = parsed.data.newHostName ?? String(player.name ?? 'the new host')
  const title = tournament.title ? String(tournament.title) : 'your tournament'
  // Two targeted fan-outs. The new host gets the "you're now hosting" copy
  // only; everyone else gets the informational "handed off" copy. Filtered
  // via role_key on tournament_push_subscriptions.
  void notifyTournamentEvent(
    tournamentId,
    'transfer_new_host',
    {
      title: '🏆 You’re now hosting',
      body: `You inherited ${title}. Tap to open it.`,
    },
    { onlyPlayerIds: [parsed.data.newHostPlayerId] }
  ).catch(() => {})
  void notifyTournamentEvent(
    tournamentId,
    'transfer_notice',
    {
      title: '📆 Tournament has a new host',
      body: `${oldName} handed ${title} to ${newName}.`,
    },
    { excludePlayerIds: [parsed.data.newHostPlayerId] }
  ).catch(() => {})

  return NextResponse.json({ ok: true, hostToken: newHostToken })
}
