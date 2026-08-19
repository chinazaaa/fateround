import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Driver tests use a hand-rolled Supabase mock — the driver reads sessions,
 * hands, game rules, then plays via the pure processWhot* functions. We
 * intercept both layers and assert what got called.
 *
 * Not a full integration test: the pure engine (processWhotPlay etc.) IS
 * shipped-code that has its own tests. Here we only prove the DRIVER's
 * wiring — that it loads the right rows, adapts state correctly, calls the
 * right process function for the bot's action, and no-ops in the "not a
 * bot's turn" cases.
 */

// ── Mock surface ────────────────────────────────────────────────────────────

// `server-only` is a Next runtime guard, not an npm package — it isn't
// resolvable under vitest. Stub it out so the driver (which imports it) can
// load inside tests without a "Cannot find package" error.
vi.mock('server-only', () => ({}))

const from = vi.fn()
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({ from }),
}))

const processPlay = vi.fn()
const processDraw = vi.fn()
const processChoose = vi.fn()
vi.mock('@/lib/whot', async (importActual) => {
  // Preserve every other export (parseWhotRules, WhotRules, whotNextTurnIndex
  // used by the adapter, etc.) — only override the DB-writing process* fns.
  const actual = (await importActual()) as Record<string, unknown>
  return {
    ...actual,
    processWhotPlay: (...args: unknown[]) => processPlay(...args),
    processWhotDraw: (...args: unknown[]) => processDraw(...args),
    processWhotChoose: (...args: unknown[]) => processChoose(...args),
  }
})

vi.mock('@/lib/push', () => ({
  scheduleTurnNotification: vi.fn(),
}))

import { driveWhotBotsOnce } from '@/lib/whot-bot-driver'

// ── Table stub ──────────────────────────────────────────────────────────────

/**
 * Minimal chainable stub for supabase.from('table').select(...).eq(...).etc.
 * Each `from()` call reads the next scripted response off `nextResponses`.
 */
type StubResponse = { data: unknown; error?: unknown; count?: number | null }
const nextResponses: StubResponse[] = []
function queueResponse(r: StubResponse) {
  nextResponses.push(r)
}

function makeChain(resp: StubResponse) {
  const chain: Record<string, unknown> = {}
  const terminals = new Set(['maybeSingle', 'single'])
  const passThroughs = ['select', 'eq', 'in', 'order', 'limit']
  passThroughs.forEach((m) => {
    chain[m] = () => chain
  })
  terminals.forEach((m) => {
    chain[m] = () => Promise.resolve(resp)
  })
  // Special: certain reads (bot count, hands list) resolve at the last .eq() /
  // .order() without a maybeSingle(). Give the chain a thenable behaviour so
  // awaiting it yields the response too.
  chain.then = (onFulfilled: (v: StubResponse) => unknown) => Promise.resolve(onFulfilled(resp))
  return chain
}

beforeEach(() => {
  nextResponses.length = 0
  from.mockReset()
  from.mockImplementation(() => {
    const r = nextResponses.shift()
    return makeChain(r ?? { data: null, error: null, count: 0 })
  })
  processPlay.mockReset().mockResolvedValue({})
  processDraw.mockReset().mockResolvedValue({})
  processChoose.mockReset().mockResolvedValue({})
})

// ── Fixture builders ────────────────────────────────────────────────────────

function botCountResp(count: number) {
  return { data: null, error: null, count }
}

const sessionRow = (overrides: Record<string, unknown> = {}) => ({
  id: 's',
  game_id: 'GAME1',
  turn_order: ['human', 'bot'],
  current_turn_index: 1, // bot's turn by default
  phase: 'playing',
  draw_pile: [],
  discard_pile: [],
  top_card: { id: 'top', shape: 'circle', number: 5 },
  required_shape: null,
  required_number: null,
  pick_two_stack: 0,
  pick_five_stack: 0,
  status_message: null,
  winner_player_id: null,
  finish_order: [],
  reshuffle_count: 0,
  turn_deadline_at: null,
  created_at: '',
  updated_at: '',
  ...overrides,
})

const handRow = (playerId: string, cards: { id: string; shape: string; number: number }[]) => ({
  id: `h-${playerId}`,
  game_id: 'GAME1',
  player_id: playerId,
  cards,
  player_order: 0,
  created_at: '',
})

// ── Tests ───────────────────────────────────────────────────────────────────

describe('driveWhotBotsOnce', () => {
  it('returns idle when the game has no bots', async () => {
    queueResponse(botCountResp(0))
    const r = await driveWhotBotsOnce('GAME1')
    expect(r).toEqual({ kind: 'idle' })
    expect(processPlay).not.toHaveBeenCalled()
  })

  it('returns idle when the current turn is a human', async () => {
    queueResponse(botCountResp(1)) // bot count
    queueResponse({ data: sessionRow({ current_turn_index: 0 }), error: null }) // narrow turn-check session
    queueResponse({ data: { id: 'human', is_bot: false }, error: null }) // turn player lookup
    // No further fetches happen once the turn holder isn't a bot.

    const r = await driveWhotBotsOnce('GAME1')
    expect(r).toEqual({ kind: 'idle' })
    expect(processPlay).not.toHaveBeenCalled()
  })

  it('calls processWhotPlay with the bot player id + card id when the bot plays', async () => {
    queueResponse(botCountResp(1))
    queueResponse({ data: sessionRow({ current_turn_index: 1 }), error: null }) // narrow turn-check session
    queueResponse({ data: { id: 'bot', is_bot: true }, error: null }) // bot is real bot
    queueResponse({ data: sessionRow({ current_turn_index: 1 }), error: null }) // full session
    queueResponse({
      data: [
        handRow('human', [{ id: 'h1', shape: 'star', number: 3 }]),
        handRow('bot', [{ id: 'b1', shape: 'circle', number: 5 }]), // matches top by shape
      ],
      error: null,
    })
    queueResponse({ data: null, error: null }) // game rules

    const r = await driveWhotBotsOnce('GAME1')
    expect(r).toEqual({ kind: 'played', action: 'play' })
    expect(processPlay).toHaveBeenCalledTimes(1)
    const args = processPlay.mock.calls[0]!
    // (admin, gameCode, botPlayerId, cardId)
    expect(args[1]).toBe('GAME1')
    expect(args[2]).toBe('bot')
    expect(args[3]).toBe('b1')
  })

  it('reports skipped when the underlying engine returns an error', async () => {
    queueResponse(botCountResp(1))
    queueResponse({ data: sessionRow({ current_turn_index: 1 }), error: null }) // narrow turn-check session
    queueResponse({ data: { id: 'bot', is_bot: true }, error: null })
    queueResponse({ data: sessionRow({ current_turn_index: 1 }), error: null }) // full session
    queueResponse({
      data: [
        handRow('human', [{ id: 'h1', shape: 'star', number: 3 }]),
        handRow('bot', [{ id: 'b1', shape: 'circle', number: 5 }]),
      ],
      error: null,
    })
    queueResponse({ data: null, error: null })
    processPlay.mockResolvedValueOnce({ error: 'Not your turn' })

    const r = await driveWhotBotsOnce('GAME1')
    expect(r).toEqual({ kind: 'skipped', reason: 'Not your turn' })
  })

  it('returns idle when the session is finished', async () => {
    queueResponse(botCountResp(1))
    queueResponse({ data: sessionRow({ phase: 'finished' }), error: null }) // narrow turn-check session
    // No further fetches happen once phase=finished.
    const r = await driveWhotBotsOnce('GAME1')
    expect(r).toEqual({ kind: 'idle' })
  })
})
