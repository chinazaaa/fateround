import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ result: {} as { error?: string; skipped?: boolean } }))
const processor = vi.hoisted(() => async () => state.result)
vi.mock('@/lib/uno', () => ({
  processUnoPlay: processor,
  processUnoPlayMulti: processor,
  processUnoJumpIn: processor,
  processUnoDraw: processor,
  processUnoPass: processor,
  processUnoChoose: processor,
  processUnoChallenge: processor,
  processUnoSwap: processor,
  processUnoCall: processor,
  processUnoTeamLeaveDecision: processor,
  processUnoExpireTurn: processor,
}))
vi.mock('@/lib/push', () => ({ scheduleTurnNotification: () => {} }))
vi.mock('@/lib/game-admin', () => ({ assertPlayer: async () => ({ player: { id: 'A' } }) }))
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { status: 'active', game_type: 'uno' } }) }),
      }),
    }),
  }),
}))

import { INTERNAL_ERROR_MESSAGE } from '@/lib/api-errors'
import { POST as play } from './play/route'
import { POST as playMulti } from './play-multi/route'
import { POST as jumpIn } from './jump-in/route'
import { POST as draw } from './draw/route'
import { POST as pass } from './pass/route'
import { POST as choose } from './choose/route'
import { POST as challenge } from './challenge/route'
import { POST as swap } from './swap/route'
import { POST as callUno } from './call-uno/route'
import { POST as teamLeave } from './team-leave/route'
import { POST as expireTurn } from './expire-turn/route'

const base = { gameId: 'abcd', resumeToken: 'ABCD1234' }
const routes: [string, (r: NextRequest) => Promise<Response>, Record<string, unknown>][] = [
  ['play', play, { cardId: 'A1' }],
  ['play-multi', playMulti, { cardIds: ['A1', 'A2'] }],
  ['jump-in', jumpIn, { cardId: 'A1' }],
  ['draw', draw, {}],
  ['pass', pass, {}],
  ['choose', choose, { color: 'red' }],
  ['challenge', challenge, { challenge: true }],
  ['swap', swap, { targetId: 'B' }],
  ['call-uno', callUno, {}],
  ['team-leave', teamLeave, { decision: 'continue' }],
  ['expire-turn', expireTurn, {}],
]

const post = (name: string, route: (r: NextRequest) => Promise<Response>, extra: Record<string, unknown>) =>
  route(
    new NextRequest(`https://x.test/api/uno/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...base, ...extra }),
    })
  )

describe('uno action routes — error status follows the cause', () => {
  it.each(routes)('%s: database failure is 500, validation error is 400', async (name, route, extra) => {
    state.result = { error: INTERNAL_ERROR_MESSAGE }
    expect((await post(name, route, extra)).status).toBe(500)
    state.result = { error: 'Not your turn' }
    expect((await post(name, route, extra)).status).toBe(400)
  })
})
