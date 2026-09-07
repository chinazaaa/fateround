import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  pokeTargetFor,
  HANDLED_GAME_TYPES,
  tickActiveGames,
  DEFAULT_GAME_TICK_ACTIVITY_WINDOW_MS,
  DEFAULT_GAME_TICK_DISCOVERY_LIMIT,
  resolveActivityWindowMs,
  resolveDiscoveryLimit,
  resetDiscoveryCursor,
} from '@/lib/game-tick'

const activeGames = vi.fn()
const gtSpy = vi.fn()
const orSpy = vi.fn()
const orderSpy = vi.fn()
const limitSpy = vi.fn()
const selectSpy = vi.fn()

// Chainable PostgREST builder stub: every filter/order returns `this`, and `limit()`
// resolves. `or()` is optional (only issued once discovery is paging past a cursor).
function makeQueryBuilder() {
  const builder: Record<string, (...args: unknown[]) => unknown> = {
    select: (...args) => (selectSpy(...args), builder),
    eq: () => builder,
    in: () => builder,
    gt: (...args) => (gtSpy(...args), builder),
    or: (...args) => (orSpy(...args), builder),
    order: (...args) => (orderSpy(...args), builder),
    limit: (...args) => {
      limitSpy(...args)
      return activeGames()
    },
  }
  return builder
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({ from: () => makeQueryBuilder() }),
}))

describe('pokeTargetFor', () => {
  it('maps round-based games to their /advance endpoint with { gameId }', () => {
    expect(pokeTargetFor('trivia', 'ABCD')).toEqual({ path: '/api/trivia/advance', body: { gameId: 'ABCD' } })
    expect(pokeTargetFor('two_truths', 'ABCD')).toEqual({
      path: '/api/two-truths/advance',
      body: { gameId: 'ABCD' },
    })
    expect(pokeTargetFor('quick_draw', 'ABCD')).toEqual({
      path: '/api/quick-draw/advance',
      body: { gameId: 'ABCD' },
    })
    expect(pokeTargetFor('describe_it', 'ABCD')).toEqual({
      path: '/api/describe-it/advance',
      body: { gameId: 'ABCD' },
    })
    expect(pokeTargetFor('word_rush', 'ABCD')).toEqual({
      path: '/api/word-rush/advance',
      body: { gameId: 'ABCD' },
    })
  })

  it('maps i_call_on to the npat route (game_type != url slug)', () => {
    expect(pokeTargetFor('i_call_on', 'ABCD')).toEqual({ path: '/api/npat/advance', body: { gameId: 'ABCD' } })
  })

  it('maps turn-based games to their /expire-turn endpoint with { gameId }', () => {
    expect(pokeTargetFor('whot', 'ABCD')).toEqual({ path: '/api/whot/expire-turn', body: { gameId: 'ABCD' } })
    expect(pokeTargetFor('crazy_eights', 'ABCD')).toEqual({
      path: '/api/crazy-eights/expire-turn',
      body: { gameId: 'ABCD' },
    })
    expect(pokeTargetFor('tic_tac_toe', 'ABCD')).toEqual({
      path: '/api/tic-tac-toe/expire-turn',
      body: { gameId: 'ABCD' },
    })
    expect(pokeTargetFor('snake_and_ladder', 'ABCD')).toEqual({
      path: '/api/snake-and-ladder/expire-turn',
      body: { gameId: 'ABCD' },
    })
    expect(pokeTargetFor('codewords', 'ABCD')).toEqual({
      path: '/api/codewords/expire-turn',
      body: { gameId: 'ABCD' },
    })
  })

  it('maps mafia to its dynamic advance route with { isAuto: true }', () => {
    expect(pokeTargetFor('mafia', 'ABCD')).toEqual({ path: '/api/mafia/ABCD/advance', body: { isAuto: true } })
  })

  it('maps bingo to its tokenless auto-call sync route', () => {
    expect(pokeTargetFor('bingo', 'ABCD')).toEqual({ path: '/api/bingo/sync', body: { gameId: 'ABCD' } })
  })

  it('maps troll_run to its tokenless sync route (advance is token-gated)', () => {
    expect(pokeTargetFor('troll_run', 'ABCD')).toEqual({ path: '/api/troll-run/sync', body: { gameId: 'ABCD' } })
  })

  it('maps the turn-based games that had no server-side backstop before', () => {
    // Regression guard: these seven shipped an `expire-turn` route but were missing from
    // TURN_EXPIRE_SLUG, so their turn clock only moved while a browser tab was open.
    expect(pokeTargetFor('ludo', 'ABCD')).toEqual({ path: '/api/ludo/expire-turn', body: { gameId: 'ABCD' } })
    expect(pokeTargetFor('scrabble', 'ABCD')).toEqual({ path: '/api/scrabble/expire-turn', body: { gameId: 'ABCD' } })
    expect(pokeTargetFor('uno', 'ABCD')).toEqual({ path: '/api/uno/expire-turn', body: { gameId: 'ABCD' } })
    expect(pokeTargetFor('ayo', 'ABCD')).toEqual({ path: '/api/ayo/expire-turn', body: { gameId: 'ABCD' } })
    expect(pokeTargetFor('mahjong', 'ABCD')).toEqual({ path: '/api/mahjong/expire-turn', body: { gameId: 'ABCD' } })
    expect(pokeTargetFor('checkers_international', 'ABCD')).toEqual({
      path: '/api/checkers-international/expire-turn',
      body: { gameId: 'ABCD' },
    })
    expect(pokeTargetFor('checkers_nigeria', 'ABCD')).toEqual({
      path: '/api/checkers-nigeria/expire-turn',
      body: { gameId: 'ABCD' },
    })
  })

  it('returns null for games with no server-driveable timer', () => {
    expect(pokeTargetFor('anonymous_messages', 'ABCD')).toBeNull()
    expect(pokeTargetFor('most_likely_to', 'ABCD')).toBeNull()
    expect(pokeTargetFor('not_a_game', 'ABCD')).toBeNull()
  })

  it('every handled type produces a target', () => {
    for (const t of HANDLED_GAME_TYPES) {
      expect(pokeTargetFor(t, 'ABCD')).not.toBeNull()
    }
  })
})

describe('tickActiveGames', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock.mockResolvedValue({ ok: true }))
    vi.stubEnv('PORT', '4567')
    activeGames.mockReset()
    fetchMock.mockClear()
    gtSpy.mockClear()
    orSpy.mockClear()
    orderSpy.mockClear()
    limitSpy.mockClear()
    selectSpy.mockClear()
    resetDiscoveryCursor()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('pokes the right endpoint for each active timed game', async () => {
    activeGames.mockResolvedValue({
      data: [
        { id: 'TRIV', game_type: 'trivia' },
        { id: 'WHT1', game_type: 'whot' },
        { id: 'MAF1', game_type: 'mafia' },
      ],
      error: null,
    })

    await tickActiveGames()

    // Whot fires TWO pokes per tick since Phase 1 of bots-in-room shipped:
    // the regular expire-turn (timer) and the bot-tick (drives any bot player
    // whose turn is up). Trivia + Mafia have one each. Total = 4.
    expect(fetchMock).toHaveBeenCalledTimes(4)
    const calls = fetchMock.mock.calls.map(([url, opts]) => ({ url, body: JSON.parse(opts.body) }))
    expect(calls).toContainEqual({ url: 'http://127.0.0.1:4567/api/trivia/advance', body: { gameId: 'TRIV' } })
    expect(calls).toContainEqual({ url: 'http://127.0.0.1:4567/api/whot/expire-turn', body: { gameId: 'WHT1' } })
    expect(calls).toContainEqual({ url: 'http://127.0.0.1:4567/api/whot/bot-tick', body: { gameId: 'WHT1' } })
    expect(calls).toContainEqual({ url: 'http://127.0.0.1:4567/api/mafia/MAF1/advance', body: { isAuto: true } })
  })

  it('does nothing when there are no active timed games', async () => {
    activeGames.mockResolvedValue({ data: [], error: null })
    await tickActiveGames()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not throw when the DB read errors', async () => {
    activeGames.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(tickActiveGames()).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  describe('discovery bounds', () => {
    it('filters out games idle beyond the activity window via gt(last_activity_at, cutoff)', async () => {
      activeGames.mockResolvedValue({ data: [], error: null })
      const before = Date.now()
      await tickActiveGames()
      const after = Date.now()

      expect(gtSpy).toHaveBeenCalledTimes(1)
      const [column, cutoffIso] = gtSpy.mock.calls[0] as [string, string]
      expect(column).toBe('last_activity_at')
      // Cutoff is "now minus window" — a game whose last_activity_at is older than this
      // (idle beyond the window) fails the gt() and is never poked; a fresher one passes.
      const cutoff = new Date(cutoffIso).getTime()
      expect(cutoff).toBeGreaterThanOrEqual(before - DEFAULT_GAME_TICK_ACTIVITY_WINDOW_MS)
      expect(cutoff).toBeLessThanOrEqual(after - DEFAULT_GAME_TICK_ACTIVITY_WINDOW_MS)
    })

    it('caps discovery and orders longest-un-poked first so the cut set rotates', async () => {
      activeGames.mockResolvedValue({ data: [], error: null })
      await tickActiveGames()

      // Ascending, NOT freshest-first: a round-based game bumps its own last_activity_at
      // every time it advances, so descending order would keep the same games at the head
      // forever and cut the same (frozen, turn-based) tail on every single tick.
      expect(orderSpy).toHaveBeenCalledWith('last_activity_at', { ascending: true })
      // `id` breaks ties so the cross-tick paging cursor is a total order.
      expect(orderSpy).toHaveBeenCalledWith('id', { ascending: true })
      expect(limitSpy).toHaveBeenCalledWith(DEFAULT_GAME_TICK_DISCOVERY_LIMIT)
    })

    it('defaults to a window wide enough to survive a long turn-based session', () => {
      // 6h, not 60m: turn-based moves never bump last_activity_at, so a live game's
      // timestamp is frozen at start — a short window would drop it mid-play.
      expect(DEFAULT_GAME_TICK_ACTIVITY_WINDOW_MS).toBe(6 * 60 * 60 * 1000)
      expect(DEFAULT_GAME_TICK_DISCOVERY_LIMIT).toBe(200)
    })

    it('still pokes games returned by the bounded query', async () => {
      activeGames.mockResolvedValue({ data: [{ id: 'FRSH', game_type: 'trivia' }], error: null })
      await tickActiveGames()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:4567/api/trivia/advance',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ gameId: 'FRSH' }) })
      )
    })

    it('warns when the returned count reaches the discovery limit', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.stubEnv('GAME_TICK_DISCOVERY_LIMIT', '2')
      activeGames.mockResolvedValue({
        data: [
          { id: 'AAAA', game_type: 'trivia' },
          { id: 'BBBB', game_type: 'trivia' },
        ],
        error: null,
      })

      await tickActiveGames()

      expect(limitSpy).toHaveBeenCalledWith(2)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0][0])).toContain('discovery cap bound')
      expect(String(warn.mock.calls[0][0])).toContain('limit=2')
      warn.mockRestore()
    })

    it('does not warn when the returned count is under the discovery limit', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.stubEnv('GAME_TICK_DISCOVERY_LIMIT', '2')
      activeGames.mockResolvedValue({ data: [{ id: 'AAAA', game_type: 'trivia' }], error: null })

      await tickActiveGames()

      expect(warn).not.toHaveBeenCalled()
      warn.mockRestore()
    })
  })

  describe('cross-tick paging', () => {
    // 7 in-window games, cap 3. Ordering alone can't rotate the head of the queue: a poke
    // is a no-op when nothing is due, so it writes nothing and last_activity_at doesn't
    // move. Without a cursor, ticks 1..N would re-select G0..G2 forever and G3..G6 would
    // starve. This drives the real cursor through a fake ordered table.
    const table = Array.from({ length: 7 }, (_, i) => ({
      id: `G${i}`,
      game_type: 'trivia',
      last_activity_at: `2026-01-01T00:0${i}:00.000Z`,
    }))

    function parseCursor(filter: string): { lastActivityAt: string; id: string } {
      const match = /last_activity_at\.gt\."([^"]+)",and\(last_activity_at\.eq\."([^"]+)",id\.gt\."([^"]+)"\)/.exec(
        filter
      )
      if (!match) throw new Error(`unparseable cursor filter: ${filter}`)
      expect(match[1]).toBe(match[2])
      return { lastActivityAt: match[1], id: match[3] }
    }

    function servePagedTable(limit: number) {
      let seenOrCalls = 0
      activeGames.mockImplementation(() => {
        const orCalls = orSpy.mock.calls
        const issuedOr = orCalls.length > seenOrCalls
        const filter = issuedOr ? String(orCalls[orCalls.length - 1][0]) : null
        seenOrCalls = orCalls.length
        const cursor = filter ? parseCursor(filter) : null
        const rows = table.filter(
          (row) =>
            !cursor ||
            row.last_activity_at > cursor.lastActivityAt ||
            (row.last_activity_at === cursor.lastActivityAt && row.id > cursor.id)
        )
        return Promise.resolve({ data: rows.slice(0, limit), error: null })
      })
    }

    function pokedIds(): string[] {
      return fetchMock.mock.calls.map(([, opts]) => JSON.parse(opts.body).gameId)
    }

    it('visits every game across successive ticks instead of re-serving the oldest page', async () => {
      vi.stubEnv('GAME_TICK_DISCOVERY_LIMIT', '3')
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      servePagedTable(3)

      // ceil(7 / 3) = 3 ticks to walk the whole queue once.
      await tickActiveGames()
      expect(pokedIds()).toEqual(['G0', 'G1', 'G2'])
      await tickActiveGames()
      await tickActiveGames()

      expect(new Set(pokedIds())).toEqual(new Set(table.map((g) => g.id)))
      expect(pokedIds()).toHaveLength(7)
    })

    it('wraps back to the head of the queue after a short page', async () => {
      vi.stubEnv('GAME_TICK_DISCOVERY_LIMIT', '3')
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      servePagedTable(3)

      await tickActiveGames() // G0 G1 G2
      await tickActiveGames() // G3 G4 G5
      await tickActiveGames() // G6 — short page, so the cursor wraps
      fetchMock.mockClear()

      await tickActiveGames()
      expect(pokedIds()).toEqual(['G0', 'G1', 'G2'])
    })

    it('does not page on the first tick (no cursor yet)', async () => {
      activeGames.mockResolvedValue({ data: [], error: null })
      await tickActiveGames()
      expect(orSpy).not.toHaveBeenCalled()
    })

    it('leaves the cursor alone when the discovery read fails, retrying the same page', async () => {
      vi.stubEnv('GAME_TICK_DISCOVERY_LIMIT', '3')
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      servePagedTable(3)
      await tickActiveGames() // G0 G1 G2 -> cursor at G2

      activeGames.mockResolvedValue({ data: null, error: { message: 'boom' } })
      await tickActiveGames()

      fetchMock.mockClear()
      servePagedTable(3)
      // The failed tick still asked for the page after G2, and the cursor survived it.
      await tickActiveGames()
      expect(pokedIds()).toEqual(['G3', 'G4', 'G5'])
    })
  })

  describe('env override clamping', () => {
    it('applies valid overrides', () => {
      vi.stubEnv('GAME_TICK_ACTIVITY_WINDOW_MS', '900000')
      vi.stubEnv('GAME_TICK_DISCOVERY_LIMIT', '50')
      expect(resolveActivityWindowMs()).toBe(900_000)
      expect(resolveDiscoveryLimit()).toBe(50)
    })

    it('floors fractional overrides', () => {
      vi.stubEnv('GAME_TICK_ACTIVITY_WINDOW_MS', '900000.9')
      vi.stubEnv('GAME_TICK_DISCOVERY_LIMIT', '50.9')
      expect(resolveActivityWindowMs()).toBe(900_000)
      expect(resolveDiscoveryLimit()).toBe(50)
    })

    it('falls back to the defaults when unset', () => {
      expect(resolveActivityWindowMs()).toBe(DEFAULT_GAME_TICK_ACTIVITY_WINDOW_MS)
      expect(resolveDiscoveryLimit()).toBe(DEFAULT_GAME_TICK_DISCOVERY_LIMIT)
    })

    it.each(['', 'abc', '0', '-1', '-999999999'])(
      'falls back for the unusable value %j rather than producing a future cutoff',
      (raw) => {
        vi.stubEnv('GAME_TICK_ACTIVITY_WINDOW_MS', raw)
        vi.stubEnv('GAME_TICK_DISCOVERY_LIMIT', raw)
        expect(resolveActivityWindowMs()).toBe(DEFAULT_GAME_TICK_ACTIVITY_WINDOW_MS)
        expect(resolveDiscoveryLimit()).toBe(DEFAULT_GAME_TICK_DISCOVERY_LIMIT)
      }
    )

    it('falls back for values that overflow to Infinity', () => {
      // `Number('1e400')` is Infinity, and `new Date(-Infinity).toISOString()` throws —
      // inside the tick's bare catch that killed the ticker with no log at all.
      vi.stubEnv('GAME_TICK_ACTIVITY_WINDOW_MS', '1e400')
      vi.stubEnv('GAME_TICK_DISCOVERY_LIMIT', '1e400')
      expect(resolveActivityWindowMs()).toBe(DEFAULT_GAME_TICK_ACTIVITY_WINDOW_MS)
      expect(resolveDiscoveryLimit()).toBe(DEFAULT_GAME_TICK_DISCOVERY_LIMIT)
    })

    it.each(['1e16', '1e15', String(31 * 24 * 60 * 60 * 1000)])(
      'falls back for the finite but out-of-range window %j',
      (raw) => {
        // 1e16 is finite and passes the min check, but `new Date(Date.now() - 1e16)` is an
        // Invalid Date and `toISOString()` throws inside the tick's bare catch — the ticker
        // would stop discovering with no log at all. Anything past the 30d cap is a typo.
        vi.stubEnv('GAME_TICK_ACTIVITY_WINDOW_MS', raw)
        expect(resolveActivityWindowMs()).toBe(DEFAULT_GAME_TICK_ACTIVITY_WINDOW_MS)
      }
    )

    it('accepts a window right up to the 30-day cap', () => {
      const cap = 30 * 24 * 60 * 60 * 1000
      vi.stubEnv('GAME_TICK_ACTIVITY_WINDOW_MS', String(cap))
      expect(resolveActivityWindowMs()).toBe(cap)
    })

    it('survives a tick with a finite out-of-range window', async () => {
      vi.stubEnv('GAME_TICK_ACTIVITY_WINDOW_MS', '1e16')
      activeGames.mockResolvedValue({ data: [], error: null })
      await expect(tickActiveGames()).resolves.toBeUndefined()
      const [, cutoffIso] = gtSpy.mock.calls[0] as [string, string]
      expect(Number.isFinite(new Date(cutoffIso).getTime())).toBe(true)
    })

    it('rejects a below-minimum window rather than shrinking it to nothing', () => {
      vi.stubEnv('GAME_TICK_ACTIVITY_WINDOW_MS', '1')
      expect(resolveActivityWindowMs()).toBe(DEFAULT_GAME_TICK_ACTIVITY_WINDOW_MS)
    })

    it('survives a tick with a hostile window override instead of dying silently', async () => {
      vi.stubEnv('GAME_TICK_ACTIVITY_WINDOW_MS', '1e400')
      activeGames.mockResolvedValue({ data: [], error: null })
      await expect(tickActiveGames()).resolves.toBeUndefined()
      const [, cutoffIso] = gtSpy.mock.calls[0] as [string, string]
      expect(Number.isFinite(new Date(cutoffIso).getTime())).toBe(true)
    })
  })
})
