import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { pokeTargetFor, HANDLED_GAME_TYPES, tickActiveGames } from '@/lib/game-tick'

const activeGames = vi.fn()
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => activeGames(),
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
})
