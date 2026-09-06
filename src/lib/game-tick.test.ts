import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  pokeTargetFor,
  HANDLED_GAME_TYPES,
  tickActiveGames,
  DEFAULT_GAME_TICK_ACTIVITY_WINDOW_MS,
  DEFAULT_GAME_TICK_DISCOVERY_LIMIT,
  resolveActivityWindowMs,
  resolveDiscoveryLimit,
} from '@/lib/game-tick'

const activeGames = vi.fn()
const gtSpy = vi.fn()
const orderSpy = vi.fn()
const limitSpy = vi.fn()
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            gt: (...gtArgs: unknown[]) => {
              gtSpy(...gtArgs)
              return {
                order: (...orderArgs: unknown[]) => {
                  orderSpy(...orderArgs)
                  return {
                    limit: (...limitArgs: unknown[]) => {
                      limitSpy(...limitArgs)
                      return activeGames()
                    },
                  }
                },
              }
            },
          }),
        }),
      }),
    }),
  }),
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
    orderSpy.mockClear()
    limitSpy.mockClear()
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
