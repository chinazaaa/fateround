import { NextRequest, NextResponse } from 'next/server'
import { getGameByType, postWinFromGame } from '@/lib/community-data'
import { isValidLeaderboardType } from '@/lib/community-achievements'
import { watToday } from '@/lib/community-dates'
import { clearPostWinAttempts, clientIp, reservePostWinSlot } from '@/lib/community-rate-limit'
import { getSupabaseAdmin, hasServiceRoleKey } from '@/lib/supabase-admin'

// GET: is this game type on the community leaderboard? Drives whether the winner's
// end screen tries to auto-post their win at all.
export async function GET(req: NextRequest) {
  if (!hasServiceRoleKey()) return NextResponse.json({ eligible: false })

  const gameType = req.nextUrl.searchParams.get('gameType') ?? ''
  if (!gameType) return NextResponse.json({ eligible: false })

  try {
    const game = await getGameByType(gameType, { activeOnly: true })
    return NextResponse.json({
      eligible: Boolean(game),
      gameName: game?.name ?? null,
    })
  } catch {
    // Public route: never leak internals, just fail closed (no auto-post).
    return NextResponse.json({ eligible: false })
  }
}

// POST: automatically record the winner's own win for today. No code required —
// the winner of a tracked game lands on the leaderboard as soon as they reach the
// end screen. Deduped per round so a single match can't be posted twice.
export async function POST(req: NextRequest) {
  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: 'Leaderboard is not configured.' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({}))
  const playerName = typeof body.playerName === 'string' ? body.playerName.trim() : ''
  // gameId identifies the in-app game (used to resolve the game type). roundKey
  // is a per-round token (the session row id) so replaying the same game lets the
  // winner post again while a single round can't be posted twice. Older callers
  // may still send sourceGameId — accept it as the game id.
  const gameId =
    typeof body.gameId === 'string'
      ? body.gameId.trim()
      : typeof body.sourceGameId === 'string'
        ? body.sourceGameId.trim()
        : ''
  const roundKey = typeof body.roundKey === 'string' ? body.roundKey.trim() : ''
  // Which leaderboard entry to post to: the real game type for normal games, or an
  // achievement key (e.g. 'codewords_spymaster') for role-based awards. Validated
  // below against the game actually played. Older callers omit it — fall back to
  // the real game type so they behave exactly as before.
  const leaderboardType = typeof body.leaderboardType === 'string' ? body.leaderboardType.trim() : ''

  if (!playerName) return NextResponse.json({ error: 'Enter your name' }, { status: 400 })
  if (!gameId) return NextResponse.json({ error: 'Missing game reference' }, { status: 400 })

  // Dedup key: per round when we have a round token, else per game.
  const ledgerKey = roundKey ? `${gameId}::${roundKey}` : gameId
  const ip = clientIp(req)

  try {
    // Light per-IP spam guard so a single client can't flood the leaderboard with
    // crafted requests. Legit winners post at most once per round, so this never
    // gets in their way; the slot is refunded on a successful (or duplicate) post.
    const rate = await reservePostWinSlot(ip)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } }
      )
    }

    // Derive the game type from the real game row, not the client, so a win can
    // only ever land on the leaderboard row for the game that was actually played.
    const supabase = getSupabaseAdmin()
    const { data: game } = await supabase.from('games').select('game_type').eq('id', gameId).maybeSingle()
    if (!game?.game_type) {
      return NextResponse.json({ error: 'Game not found.' }, { status: 404 })
    }
    const realGameType = game.game_type as string

    // The target board is the real game type by default, or a requested achievement
    // that belongs to it. Reject anything else so a crafted request can't post a win
    // onto an unrelated leaderboard row.
    const targetType = leaderboardType || realGameType
    if (!isValidLeaderboardType(realGameType, targetType)) {
      return NextResponse.json({ error: 'This win does not belong to that leaderboard.' }, { status: 400 })
    }

    const outcome = await postWinFromGame({
      gameType: targetType,
      playerName,
      sourceGameId: ledgerKey,
      dateStr: watToday(),
    })

    if (outcome === 'not_on_leaderboard') {
      // Every winner now posts directly (the client no longer pre-checks), so an
      // untracked game is the normal "not added" case — not spam. Refund the slot.
      await clearPostWinAttempts(ip)
      return NextResponse.json({ error: 'This game isn’t on the community leaderboard.' }, { status: 404 })
    }
    if (outcome === 'already_posted') {
      // Not spam — the winner (or another device) already posted this round.
      await clearPostWinAttempts(ip)
      return NextResponse.json({ error: 'This win has already been posted.' }, { status: 409 })
    }

    // Recorded — refund this IP's spam counter so real winners never accumulate.
    await clearPostWinAttempts(ip)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[community/post-win] failed', err)
    return NextResponse.json({ error: 'Could not post your win. Try again.' }, { status: 500 })
  }
}
