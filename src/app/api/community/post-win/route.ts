import { NextRequest, NextResponse } from 'next/server'
import { getGameByType, getSetting, postWinFromGame, WHATSAPP_INVITE_URL_KEY } from '@/lib/community-data'
import { postCodeIsSet, verifyPostCode } from '@/lib/community-post-code'
import { DEFAULT_WHATSAPP_INVITE_URL } from '@/lib/community-constants'
import { watToday } from '@/lib/community-dates'
import { checkPostWinRateLimit, clearPostWinAttempts, clientIp, recordFailedPostWin } from '@/lib/community-rate-limit'
import { getSupabaseAdmin, hasServiceRoleKey } from '@/lib/supabase-admin'

// Same throttle as the manager login: a fixed delay on every failed code so the
// public endpoint can't be brute-forced quickly.
const FAILED_ATTEMPT_DELAY_MS = 600
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// GET: can the winner of this game type post right now? Drives whether the
// "Post to community leaderboard" button renders at all.
export async function GET(req: NextRequest) {
  if (!hasServiceRoleKey()) return NextResponse.json({ eligible: false, codeConfigured: false })

  const gameType = req.nextUrl.searchParams.get('gameType') ?? ''
  if (!gameType) return NextResponse.json({ eligible: false, codeConfigured: false })

  try {
    const [game, codeConfigured, whatsapp] = await Promise.all([
      getGameByType(gameType, { activeOnly: true }),
      postCodeIsSet(),
      getSetting(WHATSAPP_INVITE_URL_KEY),
    ])
    return NextResponse.json({
      eligible: Boolean(game),
      codeConfigured,
      gameName: game?.name ?? null,
      whatsappInviteUrl: whatsapp || DEFAULT_WHATSAPP_INVITE_URL,
    })
  } catch {
    // Public route: never leak internals, just fail closed (no button).
    return NextResponse.json({ eligible: false, codeConfigured: false })
  }
}

// POST: record the winner's own win for today, gated by the weekly post code.
export async function POST(req: NextRequest) {
  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: 'Leaderboard is not configured.' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({}))
  const playerName = typeof body.playerName === 'string' ? body.playerName.trim() : ''
  const code = typeof body.code === 'string' ? body.code : ''
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

  if (!playerName) return NextResponse.json({ error: 'Enter your name' }, { status: 400 })
  if (!gameId) return NextResponse.json({ error: 'Missing game reference' }, { status: 400 })

  // Dedup key: per round when we have a round token, else per game.
  const ledgerKey = roundKey ? `${gameId}::${roundKey}` : gameId
  const ip = clientIp(req)

  try {
    if (!(await postCodeIsSet())) {
      return NextResponse.json(
        { error: 'No weekly code is set yet. Ask the admin for this week’s code.' },
        { status: 503 }
      )
    }

    // Cap wrong-code guesses per IP so the short weekly code can't be brute-forced.
    const rate = await checkPostWinRateLimit(ip)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } }
      )
    }

    if (!(await verifyPostCode(code))) {
      await Promise.all([recordFailedPostWin(ip), delay(FAILED_ATTEMPT_DELAY_MS)])
      return NextResponse.json({ error: 'Wrong code. Check this week’s code in the group.' }, { status: 401 })
    }

    // Derive the game type from the real game row, not the client, so a win can
    // only ever land on the leaderboard row for the game that was actually played.
    const supabase = getSupabaseAdmin()
    const { data: game } = await supabase.from('games').select('game_type').eq('id', gameId).maybeSingle()
    if (!game?.game_type) {
      return NextResponse.json({ error: 'Game not found.' }, { status: 404 })
    }

    const outcome = await postWinFromGame({
      gameType: game.game_type as string,
      playerName,
      sourceGameId: ledgerKey,
      dateStr: watToday(),
    })

    if (outcome === 'not_on_leaderboard') {
      return NextResponse.json({ error: 'This game isn’t on the community leaderboard.' }, { status: 404 })
    }
    if (outcome === 'already_posted') {
      return NextResponse.json({ error: 'This win has already been posted.' }, { status: 409 })
    }

    // Correct code accepted — reset this IP's failure counter.
    await clearPostWinAttempts(ip)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[community/post-win] failed', err)
    return NextResponse.json({ error: 'Could not post your win. Try again.' }, { status: 500 })
  }
}
