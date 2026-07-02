// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Game, Player } from '@/types'

const db = vi.hoisted(() => ({
  game: { id: 'ABCD', status: 'waiting' } as { id: string; status: string } | null,
  players: [] as Array<{ id: string; name: string }>,
  error: null as { message: string } | null,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(table: string) {
      const result =
        table === 'games' ? { data: db.game, error: db.error } : { data: db.error ? null : db.players, error: db.error }
      // Chainable-and-awaitable builder, like supabase-js.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {}
      b.select = () => b
      b.eq = () => b
      b.order = () => b
      b.maybeSingle = () => Promise.resolve(result)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      b.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject)
      return b
    },
  },
}))

import { useGameRosterPoll } from './useGameRosterPoll'
import { POLL_INTERVALS } from './usePolling'

const TICK = POLL_INTERVALS.realtimeFallback

beforeEach(() => {
  db.game = { id: 'ABCD', status: 'waiting' }
  db.players = []
  db.error = null
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

function renderPoll(status: Game['status'] | undefined = 'waiting') {
  const setGame = vi.fn()
  const setPlayers = vi.fn()
  const reload = vi.fn()
  const view = renderHook(
    (props: { status: Game['status'] | undefined }) =>
      useGameRosterPoll('ABCD', props.status, { setGame, setPlayers, reload }),
    { initialProps: { status } }
  )
  return { setGame, setPlayers, reload, ...view }
}

describe('useGameRosterPoll', () => {
  it('refreshes the roster and game each tick without running the full reload', async () => {
    const { setPlayers, setGame, reload } = renderPoll('waiting')
    db.players = [
      { id: 'p1', name: 'Ada' },
      { id: 'p2', name: 'Grace' },
    ]

    await vi.advanceTimersByTimeAsync(TICK + 50)
    expect(setPlayers).toHaveBeenCalledWith(db.players as unknown as Player[])
    // Non-status game changes (e.g. max_players) must still land, so setGame runs
    // every tick — but reload stays gated on a status transition.
    expect(setGame).toHaveBeenCalledWith(db.game)
    expect(reload).not.toHaveBeenCalled()
  })

  it('runs the full reload when the game status transitions', async () => {
    const { setGame, reload } = renderPoll('waiting')
    db.game = { id: 'ABCD', status: 'active' }

    await vi.advanceTimersByTimeAsync(TICK + 50)
    expect(setGame).toHaveBeenCalledWith(db.game)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('compares against the latest status after a rerender', async () => {
    const { rerender, setGame, reload } = renderPoll('waiting')
    rerender({ status: 'active' })
    db.game = { id: 'ABCD', status: 'active' }

    await vi.advanceTimersByTimeAsync(TICK + 50)
    // setGame still runs each tick, but the status now matches the latest prop, so
    // no full reload fires.
    expect(setGame).toHaveBeenCalledWith(db.game)
    expect(reload).not.toHaveBeenCalled()
  })

  it('backs off (returns false) on retriable errors instead of updating state', async () => {
    const { setPlayers, reload } = renderPoll('waiting')
    db.error = { message: 'fetch failed' }

    await vi.advanceTimersByTimeAsync(TICK + 50)
    expect(setPlayers).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })
})
