import { NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'

/**
 * A failed seat insert. The players BEFORE INSERT trigger refuses a seat in a game its host just ended (`game_finished`,
 * raised under the games row lock): that is the same answer as the closed-session check the handler makes before inserting
 * (an explicit conflict), not an internal error. Anything else stays an internal 500.
 */
export function playerInsertFailure(error: { message?: string; code?: string } | null | undefined) {
  if (error?.message?.startsWith('game_finished')) {
    return NextResponse.json({ error: 'This session has ended' }, { status: 409 })
  }
  return NextResponse.json({ error: internalErrorMessage('players', error) }, { status: 500 })
}
