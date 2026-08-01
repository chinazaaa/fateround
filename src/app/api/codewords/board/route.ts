import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { normalizeResumeToken } from '@/lib/utils'

/**
 * The Codewords board, with the key card attached only for callers entitled to see it.
 *
 * SECURITY (audit finding H2, Aug 2026): `codewords_boards` carried a
 * `for select using (true)` policy, so `key` — the secret assignment of every word to
 * red/blue/neutral/assassin — was readable by anyone with the publishable anon key. Confirmed
 * live: a real board's key was read straight out of REST. The clients fetched the whole row
 * and merely *rendered* it differently for operatives, which is not a control at all: any
 * player could read their own network response and win every game, and identify the assassin.
 *
 * Migration 20260803170000 revokes SELECT on that one column from the public roles, and this
 * route is the only way back to it. `key` is returned when, and only when:
 *
 *   - the caller holds the game's host_token (the host runs the board), or
 *   - the caller's resume_token resolves to a player whose role is `spymaster`, or
 *   - the game is finished — the post-game reveal on /history/[code] is the whole point of
 *     that page, and by then the key is not secret from anyone.
 *
 * Everyone else gets the same row with `key` omitted, which is exactly what an operative's UI
 * needs to render.
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const gameCode = params.get('gameCode')?.toUpperCase()
    if (!gameCode) return NextResponse.json({ error: 'gameCode is required' }, { status: 400 })

    const supabase = getSupabaseAdmin()

    const { data: board } = await supabase.from('codewords_boards').select('*').eq('game_id', gameCode).maybeSingle()
    if (!board) return NextResponse.json({ board: null })

    const { data: game } = await supabase.from('games').select('status, host_token').eq('id', gameCode).maybeSingle()

    let maySeeKey = false

    // 1. Finished games: the key is revealed to everyone in the post-game summary.
    if (game?.status === 'finished') maySeeKey = true

    // 2. The host.
    const hostToken = params.get('hostToken')
    if (!maySeeKey && hostToken && game?.host_token && game.host_token === hostToken) {
      maySeeKey = true
    }

    // 3. A spymaster, resolved from their secret resume token — never from a client-supplied
    //    playerId, which is public and forgeable (see src/lib/game-admin.ts).
    if (!maySeeKey) {
      const token = normalizeResumeToken(params.get('resumeToken') ?? '')
      if (token.length >= 4) {
        const { data: player } = await supabase
          .from('players')
          .select('id')
          .eq('game_id', gameCode)
          .eq('resume_token', token)
          .maybeSingle()
        if (player) {
          const { data: role } = await supabase
            .from('codewords_player_roles')
            .select('role')
            .eq('game_id', gameCode)
            .eq('player_id', player.id)
            .maybeSingle()
          if (role?.role === 'spymaster') maySeeKey = true
        }
      }
    }

    const fullKey = (board.key ?? []) as string[]
    // Non-secret: the red/blue/neutral/assassin split is fixed by the ruleset and already on
    // screen. Sent explicitly because it can't be derived from a masked key.
    const keyTotals = fullKey.reduce<Record<string, number>>((acc, cell) => {
      if (cell) acc[cell] = (acc[cell] ?? 0) + 1
      return acc
    }, {})

    if (maySeeKey) return NextResponse.json({ board: { ...board, key_totals: keyTotals } })

    // Mask rather than drop: revealed cells are public (everyone watched them turn over) and
    // the grid colours them from this array. Unrevealed cells become null — the actual secret.
    // Spread the row rather than re-selecting columns, so a column added later still reaches
    // operatives by default; `key` is the one we withhold, deliberately.
    const revealed = new Set((board.revealed_indices ?? []) as number[])
    const maskedKey = fullKey.map((cell, index) => (revealed.has(index) ? cell : null))
    return NextResponse.json({ board: { ...board, key: maskedKey, key_totals: keyTotals } })
  } catch (err) {
    const message = internalErrorMessage('codewords/board', err, 'Failed to load the board')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
