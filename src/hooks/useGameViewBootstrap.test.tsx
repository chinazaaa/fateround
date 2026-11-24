// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const h = vi.hoisted(() => ({
  gameRow: null as Record<string, unknown> | null,
  players: [] as unknown[],
  /** When true, reads never settle — models an iOS-suspended fetch. */
  hang: false,
  /** Reads of the players table made so far, and from which one on they report an error. */
  playerReads: 0,
  failPlayersFrom: Infinity,
  /** When set, the first players read waits for it. */
  gate: null as Promise<void> | null,
  /** Every `.eq(column, value)` value the queries were made with (to tell which room a read was for). */
  eqValues: [] as unknown[],
}))

vi.mock('@/lib/supabase', () => {
  const chain = (result: unknown) => {
    const o: Record<string, unknown> = {
      select: () => o,
      eq: (_column: string, value: unknown) => {
        h.eqValues.push(value)
        return o
      },
      maybeSingle: () => (h.hang ? new Promise(() => {}) : Promise.resolve(result)),
      order: () => {
        if (h.hang) return new Promise(() => {})
        const n = ++h.playerReads
        const res = n >= h.failPlayersFrom ? { data: null, error: { message: 'boom' } } : result
        return n === 1 && h.gate ? h.gate.then(() => res) : Promise.resolve(res)
      },
    }
    return o
  }
  return {
    supabase: {
      from: (t: string) => chain({ data: t === 'games' ? h.gameRow : t === 'players' ? h.players : null, error: null }),
    },
  }
})
vi.mock('@/lib/player-resume', () => ({ resolvePlayerSession: vi.fn(async () => null) }))
vi.mock('@/lib/utils', () => ({ setPlayerSession: vi.fn(), getPlayerSession: vi.fn(() => null) }))

import { useGameViewBootstrap } from './useGameViewBootstrap'

beforeEach(() => {
  h.gameRow = null
  h.players = []
  h.hang = false
  h.playerReads = 0
  h.failPlayersFrom = Infinity
  h.gate = null
  h.eqValues = []
})

function setup(extra: Record<string, unknown> = {}) {
  const loadGameState = vi.fn(async () => ({ state: 'STATE', ok: true }))
  const computeScreen = vi.fn((g: { status?: string }) => (g.status === 'waiting' ? 'waiting' : 'active'))
  const rendered = renderHook(() =>
    useGameViewBootstrap<string, string>({
      gameCode: 'ABCD',
      loadingScreen: 'loading',
      notFoundScreen: 'not_found',
      loadGameState,
      computeScreen,
      ...extra,
    })
  )
  return { ...rendered, loadGameState, computeScreen }
}

describe('useGameViewBootstrap', () => {
  it('starts on the loading screen', () => {
    const { result } = setup()
    expect(result.current.screen).toBe('loading')
  })

  it('loads game + players, runs loadGameState + computeScreen, then sets the screen', async () => {
    h.gameRow = { id: 'ABCD', status: 'waiting' }
    h.players = [{ id: 'p1' }]
    const { result, loadGameState, computeScreen } = setup()
    await waitFor(() => expect(result.current.screen).toBe('waiting'))
    expect(result.current.game).toEqual({ id: 'ABCD', status: 'waiting' })
    expect(result.current.players).toHaveLength(1)
    expect(loadGameState).toHaveBeenCalled()
    expect(computeScreen).toHaveBeenCalledWith({ id: 'ABCD', status: 'waiting' }, null, 'STATE')
  })

  it('shows the not-found screen when the game id is missing', async () => {
    h.gameRow = null
    const { result, loadGameState } = setup()
    await waitFor(() => expect(result.current.screen).toBe('not_found'))
    expect(loadGameState).not.toHaveBeenCalled() // short-circuits before the game-specific fetch
  })

  it('runs afterResolve after session resolution and enriches the state passed to computeScreen', async () => {
    h.gameRow = { id: 'ABCD', status: 'active' }
    h.players = [{ id: 'p1' }]
    const afterResolve = vi.fn(async () => 'ENRICHED')
    const { computeScreen } = setup({ afterResolve })
    await waitFor(() => expect(afterResolve).toHaveBeenCalled())
    // seam receives the resolved playerId (null via the mocked session) + the loadGameState state
    expect(afterResolve).toHaveBeenCalledWith(
      { id: 'ABCD', status: 'active' },
      null,
      'STATE',
      expect.any(Function),
      expect.any(Function)
    )
    // the enriched return value — not the original 'STATE' — is what computeScreen sees
    expect(computeScreen).toHaveBeenLastCalledWith({ id: 'ABCD', status: 'active' }, null, 'ENRICHED')
  })

  it('keeps the loadGameState state when afterResolve returns nothing', async () => {
    h.gameRow = { id: 'ABCD', status: 'active' }
    const afterResolve = vi.fn(() => {})
    const { computeScreen } = setup({ afterResolve })
    await waitFor(() => expect(computeScreen).toHaveBeenCalled())
    expect(computeScreen).toHaveBeenLastCalledWith({ id: 'ABCD', status: 'active' }, null, 'STATE')
  })

  it('calls onJoinSuccess with the raw API data after a successful join', async () => {
    h.gameRow = { id: 'ABCD', status: 'waiting' }
    const onJoinSuccess = vi.fn()
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ playerId: 'p9', playerName: 'Zed', resumeToken: 'RT', codewordsRole: 'spy' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = setup({ onJoinSuccess })
    await waitFor(() => expect(result.current.screen).toBe('waiting'))
    await act(async () => {
      await result.current.join({ name: 'Zed' })
    })
    expect(onJoinSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: 'p9', playerName: 'Zed', codewordsRole: 'spy' })
    )
    vi.unstubAllGlobals()
  })

  it('sets lobbyFull when a join is refused for a full lobby', async () => {
    h.gameRow = { id: 'ABCD', status: 'waiting' }
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: 'This game is full', full: true }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = setup()
    await waitFor(() => expect(result.current.screen).toBe('waiting'))
    expect(result.current.lobbyFull).toBe(false)
    await act(async () => {
      await result.current.join({ name: 'Zed' })
    })
    expect(result.current.lobbyFull).toBe(true)
    vi.unstubAllGlobals()
  })

  it('forwards an explicit joinAsViewer even on a waiting game (watch instead)', async () => {
    h.gameRow = { id: 'ABCD', status: 'waiting' }
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ playerId: 'p9', playerName: 'Zed' }) }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = setup()
    await waitFor(() => expect(result.current.screen).toBe('waiting'))
    await act(async () => {
      await result.current.join({ name: 'Zed', joinAsViewer: true })
    })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }]
    expect(JSON.parse(init.body).joinAsViewer).toBe(true)
    vi.unstubAllGlobals()
  })

  it('omits joinAsViewer on an ordinary waiting-game join', async () => {
    h.gameRow = { id: 'ABCD', status: 'waiting' }
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ playerId: 'p9', playerName: 'Zed' }) }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = setup()
    await waitFor(() => expect(result.current.screen).toBe('waiting'))
    await act(async () => {
      await result.current.join({ name: 'Zed' })
    })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }]
    expect('joinAsViewer' in JSON.parse(init.body)).toBe(false)
    vi.unstubAllGlobals()
  })

  it('sends the stored resume token on join so the server reclaims an existing seat', async () => {
    // A device that already holds a seat (reconnect / refresh) must reclaim it rather than
    // create a new row — on an active game a new row defaults to spectator, demoting a player.
    const utils = await import('@/lib/utils')
    // Persistent (not …Once): bootstrap may read getPlayerSession more than once during
    // resolve + join, so every call in this test should see the seated session.
    vi.mocked(utils.getPlayerSession).mockReturnValue({
      playerId: 'p9',
      playerName: 'Zed',
      playerGender: 'both',
      resumeToken: 'RT-EXISTING',
    })
    h.gameRow = { id: 'ABCD', status: 'active' }
    h.players = [{ id: 'p9' }]
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ playerId: 'p9', playerName: 'Zed' }) }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = setup()
    await waitFor(() => expect(result.current.screen).toBe('active'))
    await act(async () => {
      await result.current.join({ name: 'Zed' })
    })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }]
    const body = JSON.parse(init.body)
    expect(body.resumeToken).toBe('RT-EXISTING')
    // Restore the default so the persistent mock doesn't leak into other tests.
    vi.mocked(utils.getPlayerSession).mockReturnValue(null)
    vi.unstubAllGlobals()
  })

  it('recovers when the first load hangs and the tab comes back (no permanent loading screen)', async () => {
    // iOS Safari suspends in-flight fetches on backgrounding; some never settle. The
    // singleflight latch used to stay held by that zombie forever, so every later load()
    // short-circuited as "already loading" and the view sat on its spinner for good.
    h.hang = true
    const { result } = setup()
    await waitFor(() => expect(result.current.screen).toBe('loading'))

    // The stuck read is still pending. Push the clock past the abandonment deadline and
    // let the tab come back to the foreground with a healthy connection.
    const realNow = Date.now
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 60_000)
    try {
      h.hang = false
      h.gameRow = { id: 'ABCD', status: 'waiting' }
      h.players = [{ id: 'p1' }]
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await waitFor(() => expect(result.current.screen).toBe('waiting'))
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('refreshes on pageshow (bfcache restore fires no visibilitychange)', async () => {
    h.gameRow = { id: 'ABCD', status: 'waiting' }
    const { result, loadGameState } = setup()
    await waitFor(() => expect(result.current.screen).toBe('waiting'))
    const before = loadGameState.mock.calls.length

    h.gameRow = { id: 'ABCD', status: 'active' }
    act(() => {
      window.dispatchEvent(new Event('pageshow'))
    })
    await waitFor(() => expect(loadGameState.mock.calls.length).toBeGreaterThan(before))
    await waitFor(() => expect(result.current.screen).toBe('active'))
  })

  it('completes bootstrap even if afterResolve throws (falls back to loadGameState state)', async () => {
    h.gameRow = { id: 'ABCD', status: 'active' }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const afterResolve = vi.fn(async () => {
      throw new Error('boom')
    })
    const { result, computeScreen } = setup({ afterResolve })
    // screen is still computed (not stuck on 'loading') using the un-enriched state
    await waitFor(() => expect(result.current.screen).toBe('active'))
    expect(computeScreen).toHaveBeenLastCalledWith({ id: 'ABCD', status: 'active' }, null, 'STATE')
    errSpy.mockRestore()
  })

  it('reports a throwing afterResolve as a failed read (false) while still showing the fallback screen', async () => {
    h.gameRow = { id: 'ABCD', status: 'active' }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const afterResolve = vi.fn<() => Promise<void>>(async () => {
      throw new Error('boom')
    })
    const { result } = setup({ afterResolve })
    await waitFor(() => expect(result.current.screen).toBe('active'))
    await expect(result.current.loadSettled()).resolves.toBe(false)
    // A completed afterResolve keeps the original ok result.
    afterResolve.mockImplementation(async () => {})
    await expect(result.current.loadSettled()).resolves.toBe(true)
    errSpy.mockRestore()
  })

  it('a run that rejects still performs the trailing re-run queued while it ran', async () => {
    h.gameRow = { id: 'ABCD', status: 'waiting' }
    h.players = [{ id: 'p1' }]
    let release!: () => void
    h.gate = new Promise<void>((r) => (release = r))
    const { result, loadGameState } = setup()
    // The first (gated) run throws from loadGameState; a caller queues a re-run meanwhile.
    loadGameState.mockRejectedValueOnce(new Error('boom'))
    let settled: boolean | undefined
    await act(async () => {
      void result.current.loadSettled().then((v) => (settled = v))
    })
    await act(async () => {
      release()
    })
    await waitFor(() => expect(settled).toBeDefined())
    expect(loadGameState).toHaveBeenCalledTimes(2) // the queued re-run ran despite the rejection
    expect(settled).toBe(true) // and it, not the rejected run, is what the chain reports
    await waitFor(() => expect(result.current.screen).toBe('waiting'))
  })

  it("loadSettled joined to a run keeps waiting through that run's trailing re-run window", async () => {
    vi.useFakeTimers()
    try {
      h.gameRow = { id: 'ABCD', status: 'waiting' }
      h.players = [{ id: 'p1' }]
      let release!: () => void
      h.gate = new Promise<void>((r) => (release = r))
      const { result } = setup()
      let settled: boolean | undefined
      await act(async () => {
        void result.current.loadSettled().then((v) => (settled = v))
      })
      // First run finishes at 10s; the trailing re-run it queued starts then and has its own 12s window.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })
      h.hang = true // the trailing re-run's reads never answer
      await act(async () => {
        release()
        await vi.advanceTimersByTimeAsync(0)
      })
      // Past the first run's 12s mark: the waiter must not give up on the first run's clock.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000)
      })
      expect(settled).toBeUndefined()
      // The trailing run itself goes stale at 10s + 12s.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(7_000)
      })
      expect(settled).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a successful join successful when onJoinSuccess throws', async () => {
    h.gameRow = { id: 'ABCD', status: 'waiting' }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onJoinError = vi.fn()
    const onJoinSuccess = vi.fn(() => {
      throw new Error('callback boom')
    })
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ playerId: 'p9', playerName: 'Zed', resumeToken: 'RT' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { result, loadGameState } = setup({ onJoinSuccess, onJoinError })
    await waitFor(() => expect(result.current.screen).toBe('waiting'))
    expect(loadGameState).toHaveBeenCalledTimes(1) // initial mount load
    await act(async () => {
      await result.current.join({ name: 'Zed' })
    })
    expect(onJoinSuccess).toHaveBeenCalled()
    expect(onJoinError).not.toHaveBeenCalled() // the throw was isolated, not treated as a join failure
    expect(loadGameState).toHaveBeenCalledTimes(2) // the post-join load() still ran despite the throw
    errSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('loadSettled joined to a run in flight resolves with the queued re-run outcome, not an early true', async () => {
    h.gameRow = { id: 'ABCD', status: 'waiting' }
    h.players = [{ id: 'p1' }]
    let release!: () => void
    h.gate = new Promise<void>((r) => (release = r))
    h.failPlayersFrom = 2 // the first (gated) run succeeds, the queued re-run fails
    const { result } = setup()
    let settled: boolean | undefined
    let plain: boolean | undefined
    await act(async () => {
      void result.current.loadSettled().then((v) => (settled = v))
      void result.current.load().then((v) => (plain = v))
    })
    // plain load() acknowledges the queued run immediately; loadSettled waits for the real result
    expect(plain).toBe(true)
    expect(settled).toBeUndefined()
    await act(async () => {
      release()
    })
    await waitFor(() => expect(settled).toBe(false))
  })

  it('loadSettled joined to a read that never settles gives up with false once the run is stale', async () => {
    vi.useFakeTimers()
    try {
      h.gameRow = { id: 'ABCD', status: 'waiting' }
      h.hang = true // models an iOS-suspended fetch: the mount load never settles
      const { result } = setup()
      let settled: boolean | undefined
      await act(async () => {
        void result.current.loadSettled().then((v) => (settled = v))
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(11_999)
      })
      expect(settled).toBeUndefined()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
      expect(settled).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a load that supersedes a stuck one settles the abandoned chain with false instead of leaving it pending', async () => {
    vi.useFakeTimers()
    try {
      h.gameRow = { id: 'ABCD', status: 'waiting' }
      const { result } = setup()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      // This load starts the chain and its read never settles.
      h.hang = true
      let stuck: boolean | undefined
      await act(async () => {
        void result.current.load().then((v) => (stuck = v))
      })
      expect(stuck).toBeUndefined()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(12_000)
      })
      expect(stuck).toBeUndefined() // nothing superseded it yet
      // Past the stale bound a new load() starts a new generation; the old chain must be settled.
      h.hang = false
      let fresh: boolean | undefined
      await act(async () => {
        void result.current.load().then((v) => (fresh = v))
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(stuck).toBe(false)
      expect(fresh).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('loadSettled with nothing in flight behaves like load', async () => {
    h.gameRow = { id: 'ABCD', status: 'waiting' }
    const { result } = setup()
    await waitFor(() => expect(result.current.screen).toBe('waiting'))
    await expect(result.current.loadSettled()).resolves.toBe(true)
  })

  it('loadSettled that starts the load itself gives up with false when the games query never settles', async () => {
    vi.useFakeTimers()
    try {
      h.gameRow = { id: 'ABCD', status: 'waiting' }
      const { result } = setup()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      h.hang = true
      let settled: boolean | undefined
      await act(async () => {
        void result.current.loadSettled().then((v) => (settled = v))
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(11_999)
      })
      expect(settled).toBeUndefined()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
      expect(settled).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('hands loadGameState/afterResolve an isCurrent that turns false once a fresher load supersedes the run', async () => {
    vi.useFakeTimers()
    try {
      h.gameRow = { id: 'ABCD', status: 'waiting' }
      let release!: () => void
      const stall = new Promise<void>((r) => (release = r))
      const seen: Array<() => boolean> = []
      let calls = 0
      const loadGameState = vi.fn(async (_g: unknown, _p: unknown, isCurrent: () => boolean) => {
        seen.push(isCurrent)
        if (++calls === 1) await stall
        return { state: 'STATE', ok: true }
      })
      const { result } = setup({ loadGameState })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(seen).toHaveLength(1)
      expect(seen[0]!()).toBe(true)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(12_000)
      })
      await act(async () => {
        void result.current.load()
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(seen[0]!()).toBe(false) // the stalled round-1 callback must stop publishing
      expect(seen[1]!()).toBe(true)
      await act(async () => {
        release()
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('a stalled afterResolve of an older load does not switch the screen back after a newer load finished', async () => {
    vi.useFakeTimers()
    try {
      h.gameRow = { id: 'ABCD', status: 'active' }
      let release!: () => void
      const stall = new Promise<void>((r) => (release = r))
      let calls = 0
      const afterResolve = vi.fn(async () => {
        if (++calls === 1) await stall
      })
      const computeScreen = vi.fn((g: { status?: string }) => (g.status === 'finished' ? 'results' : 'playing'))
      const { result } = setup({ afterResolve, computeScreen })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(12_000)
      })
      h.gameRow = { id: 'ABCD', status: 'finished', session_started_at: 's1' }
      await act(async () => {
        void result.current.load()
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(result.current.screen).toBe('results')
      h.gameRow = { id: 'ABCD', status: 'active' }
      await act(async () => {
        release()
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(result.current.screen).toBe('results')
    } finally {
      vi.useRealTimers()
    }
  })

  it('unmounting settles a loadSettled waiter on the stalled run with false at once, not after the stale deadline', async () => {
    h.gameRow = { id: 'ABCD', status: 'waiting' }
    let release!: () => void
    const stall = new Promise<void>((r) => (release = r))
    let started = false
    const loadGameState = vi.fn(async () => {
      started = true
      await stall
      return { state: 'STATE', ok: true }
    })
    const { result, unmount } = setup({ loadGameState })
    await waitFor(() => expect(started).toBe(true))
    let settled: boolean | undefined
    void result.current.loadSettled().then((v) => (settled = v))
    unmount()
    // Real timers: the 12s stale deadline cannot be what resolved it.
    await waitFor(() => expect(settled).toBe(false))
    release()
  })

  it('after unmount: load resolves false without reading, and an in-flight run reads as superseded', async () => {
    h.gameRow = { id: 'ABCD', status: 'waiting' }
    let release!: () => void
    const stall = new Promise<void>((r) => (release = r))
    let current: (() => boolean) | undefined
    const loadGameState = vi.fn(async (_g: unknown, _p: unknown, isCurrent: () => boolean) => {
      current = isCurrent
      await stall
      return { state: 'STATE', ok: true }
    })
    const { result, unmount, computeScreen } = setup({ loadGameState })
    await waitFor(() => expect(current).toBeDefined())
    const settle = result.current.loadSettled
    unmount()
    expect(current!()).toBe(false)
    await expect(settle()).resolves.toBe(false)
    release()
    await act(async () => {
      await Promise.resolve()
    })
    expect(computeScreen).not.toHaveBeenCalled()
  })
  it('a read the afterResolve step marked failed reports false from the settled load, screen still selected', async () => {
    h.gameRow = { id: 'ABCD', status: 'active' }
    const afterResolve = vi.fn(async (_g, _p, _s, _c, markFailed: () => void) => {
      markFailed()
    })
    const { result } = setup({ afterResolve })
    await waitFor(() => expect(result.current.screen).toBe('active'))
    await expect(result.current.loadSettled()).resolves.toBe(false)
    afterResolve.mockImplementation(async () => {})
    await expect(result.current.loadSettled()).resolves.toBe(true)
  })

  it('a room change supersedes the old room run and reads the NEW room instead of only flagging a re-run', async () => {
    h.gameRow = { id: 'AAAA', status: 'waiting' }
    let release!: () => void
    const stall = new Promise<void>((r) => (release = r))
    const isCurrents: Array<() => boolean> = []
    const loadGameState = vi.fn(async (_g: unknown, _p: unknown, isCurrent: () => boolean) => {
      isCurrents.push(isCurrent)
      if (isCurrents.length === 1) await stall // the old room's load never finishes in time
      return { state: 'STATE', ok: true }
    })
    const computeScreen = vi.fn(() => 'waiting')
    const { rerender } = renderHook(
      ({ code }: { code: string }) =>
        useGameViewBootstrap<string, string>({
          gameCode: code,
          loadingScreen: 'loading',
          notFoundScreen: 'not_found',
          loadGameState,
          computeScreen,
        }),
      { initialProps: { code: 'AAAA' } }
    )
    await waitFor(() => expect(isCurrents).toHaveLength(1))
    rerender({ code: 'BBBB' })
    await waitFor(() => expect(isCurrents).toHaveLength(2)) // the new room was read
    expect(isCurrents[0]!()).toBe(false) // and the old room's run no longer counts as current
    expect(isCurrents[1]!()).toBe(true)
    expect(h.eqValues).toContain('BBBB')
    release()
  })

  it("a room change resets the previous room's finished latch", async () => {
    h.gameRow = { id: 'AAAA', status: 'finished', session_started_at: 's1' }
    const { result, rerender } = renderHook(
      ({ code }: { code: string }) =>
        useGameViewBootstrap<string, string>({
          gameCode: code,
          loadingScreen: 'loading',
          notFoundScreen: 'not_found',
          loadGameState: async () => ({ state: 'STATE', ok: true }),
          computeScreen: (g: { status?: string }) => g.status ?? '',
        }),
      { initialProps: { code: 'AAAA' } }
    )
    await waitFor(() => expect(result.current.screen).toBe('finished'))
    h.gameRow = { id: 'BBBB', status: 'active', session_started_at: 's1' } // same session id string, other room
    rerender({ code: 'BBBB' })
    await waitFor(() => expect(result.current.screen).toBe('active'))
  })

  it('keeps a finished session retryable until the finished screen is selected (stalled afterResolve)', async () => {
    vi.useFakeTimers()
    try {
      h.gameRow = { id: 'ABCD', status: 'finished', session_started_at: 's1' }
      let release!: () => void
      const stall = new Promise<void>((r) => (release = r))
      const afterResolve = vi.fn(async () => {
        await stall
      })
      const { result } = setup({ afterResolve })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(afterResolve).toHaveBeenCalledTimes(1) // the finished load is stuck before it selected the screen
      await act(async () => {
        await vi.advanceTimersByTimeAsync(12_001)
      })
      // A lagging replica now reports the SAME session as active: the replacement load must report failure (so the
      // caller retries) rather than success, because the finished screen was never selected.
      h.gameRow = { id: 'ABCD', status: 'active', session_started_at: 's1' }
      let outcome: boolean | undefined
      await act(async () => {
        void result.current.loadSettled().then((v) => (outcome = v))
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(outcome).toBe(false)
      expect(result.current.screen).not.toBe('active') // and the stale board was not published
      release()
    } finally {
      vi.useRealTimers()
    }
  })

  it('once the finished screen is selected, the same stale active read counts as success', async () => {
    h.gameRow = { id: 'ABCD', status: 'finished', session_started_at: 's1' }
    const { result } = setup()
    await waitFor(() => expect(result.current.screen).toBe('active')) // computeScreen maps non-waiting to 'active'
    h.gameRow = { id: 'ABCD', status: 'active', session_started_at: 's1' }
    await expect(result.current.loadSettled()).resolves.toBe(true)
  })
})
