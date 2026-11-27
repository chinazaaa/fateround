import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
const recover = vi.hoisted(() => vi.fn())
vi.mock('@/lib/game-finish', () => ({ recoverFinishBookkeeping: recover }))

import { INTERNAL_ERROR_MESSAGE } from '@/lib/api-errors'
import { callFinishRpc } from './finish-session'

const call = (rpcResult: { data?: unknown; error?: unknown }) =>
  callFinishRpc(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { rpc: async () => rpcResult } as any,
    'finish_uno_session',
    {},
    'uno',
    'G'
  )

describe('callFinishRpc', () => {
  beforeEach(() => {
    recover.mockReset()
    recover.mockResolvedValue({ state: 'none' })
  })

  it('finished: won, and the bookkeeping owed by that flip runs', async () => {
    expect(await call({ data: { status: 'finished', games_flipped: true } })).toEqual({ won: true })
    expect(recover).toHaveBeenCalledTimes(1)
  })

  it('finished without a flip (game already ended otherwise): no bookkeeping run', async () => {
    expect(await call({ data: { status: 'finished', games_flipped: false } })).toEqual({ won: true })
    expect(recover).not.toHaveBeenCalled()
  })

  it('already_finished: not won, flagged already, bookkeeping only when this call completed the flip', async () => {
    expect(await call({ data: { status: 'already_finished', games_flipped: true } })).toEqual({
      won: false,
      already: true,
    })
    expect(recover).toHaveBeenCalledTimes(1)
    recover.mockClear()
    expect(await call({ data: { status: 'already_finished', games_flipped: false } })).toEqual({
      won: false,
      already: true,
    })
    expect(recover).not.toHaveBeenCalled()
  })

  it('lost: not won, no bookkeeping, no error', async () => {
    expect(await call({ data: { status: 'lost', games_flipped: false } })).toEqual({ won: false })
    expect(recover).not.toHaveBeenCalled()
  })

  it('invalid and rpc errors are internal errors', async () => {
    expect(await call({ data: { status: 'invalid', reason: 'x' } })).toEqual({
      won: false,
      error: INTERNAL_ERROR_MESSAGE,
    })
    expect(await call({ error: { message: 'boom' } })).toEqual({ won: false, error: INTERNAL_ERROR_MESSAGE })
    expect(await call({ data: null })).toEqual({ won: false, error: INTERNAL_ERROR_MESSAGE })
    expect(recover).not.toHaveBeenCalled()
  })

  it('a bookkeeping failure does not turn a landed finish into a failure', async () => {
    recover.mockResolvedValue({ state: 'error', error: 'x' })
    expect(await call({ data: { status: 'finished', games_flipped: true } })).toEqual({ won: true })
  })
})
