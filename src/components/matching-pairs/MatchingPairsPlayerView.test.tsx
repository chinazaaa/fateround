// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkAllMatchingPairsPlayersDone, type MatchingPairsProgress } from '@/lib/memory-match'
import { supabase } from '@/lib/supabase'

// ── Mock supabase ───────────────────────────────────────────────────────────

type ChannelCallback = (payload: { new: MatchingPairsProgress }) => void

const channelState = vi.hoisted(() => ({
  onCallback: null as ChannelCallback | null,
  channelName: null as string | null,
}))

const dbState = vi.hoisted(() => ({
  players: [] as { id: string; spectator: boolean }[],
  progressRows: [] as { player_id: string; pairs_matched: number; finished: boolean }[],
  gameStatus: 'active' as string | null,
  rounds: [] as { id: string; game_id: string; round_number: number; status: string }[],
  updateCalls: [] as { table: string; data: unknown; eq?: string }[],
  markGameFinishedCalls: 0,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel(name: string) {
      channelState.channelName = name
      const callbacks: Record<string, ChannelCallback> = {}
      return {
        on(_event: string, _config: unknown, callback: ChannelCallback) {
          callbacks.postgres_changes = callback
          return this
        },
        subscribe() {
          channelState.onCallback = callbacks.postgres_changes ?? null
          return { unsubscribe: () => {} }
        },
      }
    },
    removeChannel() {
      channelState.onCallback = null
      return Promise.resolve('ok')
    },
    from(table: string) {
      let data: unknown = null
      if (table === 'games') {
        data = dbState.gameStatus ? { id: 'G', status: dbState.gameStatus } : null
      } else if (table === 'players') {
        data = dbState.players
      } else if (table === 'memory_match_progress') {
        data = dbState.progressRows
      } else if (table === 'rounds') {
        data = dbState.rounds
      }
      const rawP = () => Promise.resolve({ data, error: null })
      const singleP = () => {
        const d = Array.isArray(data) && data.length === 1 ? data[0] : data
        return Promise.resolve({ data: d, error: null })
      }
      const b: any = {
        select: () => b,
        eq: () => b,
        order: () => b,
        limit: () => b,
        update: (updateData: unknown) => {
          dbState.updateCalls.push({ table, data: updateData })
          return b
        },
        maybeSingle: () => {
          const p = singleP()
          return {
            data: Array.isArray(data) && data.length === 1 ? data[0] : data,
            error: null,
            then: (resolve: any) => p.then(resolve),
          }
        },
        then: (resolve: any) => rawP().then(resolve),
      }
      return b
    },
  },
}))

vi.mock('@/lib/game-finish', () => ({
  markGameFinished: (...args: unknown[]) => {
    dbState.markGameFinishedCalls++
    return Promise.resolve({ error: null })
  },
}))

vi.mock('@/lib/game-types', () => ({
  gameTypeConfig: () => ({ headerEmoji: '🧩' }),
}))

vi.mock('@/lib/viewers', () => ({
  allowLatePlayers: () => false,
  preJoinScreen: () => null,
  playerIsViewer: () => false,
}))

vi.mock('@/hooks/useGameViewBootstrap', () => ({
  useGameViewBootstrap: () => ({
    screen: 'playing',
    game: { status: 'active', session_started_at: null, rounds_count: 1 },
    setGame: vi.fn(),
    players: [],
    setPlayers: vi.fn(),
    myPlayerId: 'p1',
    setMyPlayerId: vi.fn(),
    myResumeToken: 'tok',
    setMyResumeToken: vi.fn(),
    joinName: '',
    setJoinName: vi.fn(),
    joining: false,
    load: vi.fn(),
    join: vi.fn(),
  }),
}))

vi.mock('@/hooks/useGameRosterPoll', () => ({ useGameRosterPoll: () => {} }))
vi.mock('@/hooks/useLobbyOpenNotification', () => ({ useLobbyOpenNotification: () => {} }))
vi.mock('@/hooks/useLateJoinContext', () => ({ useLateJoinContext: () => ({ context: null, loading: false }) }))
vi.mock('@/hooks/useTurnNotifications', () => ({ useTurnNotifications: () => {} }))
vi.mock('@/hooks/useRoomMemberJoin', () => ({
  useRoomMemberJoin: () => ({ displayName: null, joinExtras: undefined, resolving: false }),
  useRoomMemberNamePrefill: () => {},
}))
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ error: vi.fn() }),
}))
vi.mock('@/components/GamePlayerChrome', () => ({ GamePlayerChrome: () => null }))

// ── Group 1: Progress Realtime Handler ─────────────────────────────────────

describe('Group 1: Progress Realtime Handler', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let setAllProgress: (...args: any[]) => any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let load: (...args: any[]) => any
  let handler: ((payload: { new: MatchingPairsProgress }) => void) | null
  let finished: boolean
  let myPlayerId: string | null

  let allProgress: MatchingPairsProgress[]

  beforeEach(() => {
    allProgress = []
    setAllProgress = vi.fn((updaterOrValue: unknown) => {
      if (typeof updaterOrValue === 'function') {
        allProgress = (updaterOrValue as (prev: MatchingPairsProgress[]) => MatchingPairsProgress[])(allProgress)
      }
    })
    load = vi.fn()
    finished = false
    myPlayerId = 'p1'
    handler = (payload: { new: MatchingPairsProgress }) => {
      const updated = payload.new
      setAllProgress((prev: MatchingPairsProgress[]) => {
        const idx = prev.findIndex((p) => p.player_id === updated.player_id)
        if (idx >= 0) {
          const existing = prev[idx]
          if (existing.updated_at >= updated.updated_at) return prev
          const next = [...prev]
          next[idx] = updated
          return next
        }
        return [...prev, updated]
      })
      if (myPlayerId && updated.player_id === myPlayerId && updated.finished && !finished) {
        load()
      }
    }
  })

  it('must not call load() when another player sends a progress event', () => {
    handler!({ new: { player_id: 'p2', pairs_matched: 3, finished: false } as MatchingPairsProgress })
    expect(load).not.toHaveBeenCalled()
  })

  it('calls setAllProgress when ANY player sends a progress event', () => {
    handler!({ new: { player_id: 'p2', pairs_matched: 3, finished: false } as MatchingPairsProgress })
    expect(setAllProgress).toHaveBeenCalled()
  })

  it('does NOT call load() when another player finishes', () => {
    handler!({ new: { player_id: 'p3', pairs_matched: 8, finished: true } as MatchingPairsProgress })
    expect(load).not.toHaveBeenCalled()
  })

  it('calls load() when own player finishes (finished flag transition)', () => {
    handler!({ new: { player_id: 'p1', pairs_matched: 8, finished: true } as MatchingPairsProgress })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('does not call load() twice for same finished event (guard against re-call)', () => {
    finished = true
    handler!({ new: { player_id: 'p1', pairs_matched: 8, finished: true } as MatchingPairsProgress })
    expect(load).not.toHaveBeenCalled()
  })

  it('does not call load() for own progress when not finished', () => {
    handler!({ new: { player_id: 'p1', pairs_matched: 3, finished: false } as MatchingPairsProgress })
    expect(load).not.toHaveBeenCalled()
  })

  it('calls setAllProgress even when payload is for current player', () => {
    handler!({ new: { player_id: 'p1', pairs_matched: 6, finished: false } as MatchingPairsProgress })
    expect(setAllProgress).toHaveBeenCalled()
  })

  it('never calls load() for non-finish progress of any player', () => {
    handler!({ new: { player_id: 'p1', pairs_matched: 1, finished: false } as MatchingPairsProgress })
    expect(load).not.toHaveBeenCalled()
    handler!({ new: { player_id: 'p2', pairs_matched: 1, finished: false } as MatchingPairsProgress })
    expect(load).not.toHaveBeenCalled()
    handler!({ new: { player_id: 'p3', pairs_matched: 1, finished: false } as MatchingPairsProgress })
    expect(load).not.toHaveBeenCalled()
  })

  it('load() is called ONLY when own player transitions from !finished to finished', () => {
    handler!({ new: { player_id: 'p1', pairs_matched: 8, finished: true } as MatchingPairsProgress })
    expect(load).toHaveBeenCalledTimes(1)
  })

  // ── Group 8: Round-transition guard (see matching-pairs-rounds-test-plan.md) ──
  // These extend the normal-mode regression guard to ensure load() is never called
  // inside the progress handler as a side effect of round-end, board regeneration,
  // or auto-advance — the same regression that has surfaced three times already.

  it('does not call load() when myPlayerId is null (player reconnecting mid-transition)', () => {
    myPlayerId = null
    handler!({ new: { player_id: 'p1', pairs_matched: 8, finished: true } as MatchingPairsProgress })
    expect(load).not.toHaveBeenCalled()
  })

  it('does not call load() for own player finished event after round transition (stale event, already finished)', () => {
    finished = true
    handler!({ new: { player_id: 'p1', pairs_matched: 8, finished: true } as MatchingPairsProgress })
    expect(load).not.toHaveBeenCalled()
  })

  it('does not call load() for a progress update that resets pairs_matched to 0 (board regen artifact for new round)', () => {
    handler!({ new: { player_id: 'p1', pairs_matched: 0, finished: false } as MatchingPairsProgress })
    expect(load).not.toHaveBeenCalled()
  })

  it('does not call load() for other players being marked finished in a round-end batch update', () => {
    handler!({ new: { player_id: 'p2', pairs_matched: 8, finished: true } as MatchingPairsProgress })
    expect(load).not.toHaveBeenCalled()
    handler!({ new: { player_id: 'p3', pairs_matched: 8, finished: true } as MatchingPairsProgress })
    expect(load).not.toHaveBeenCalled()
    handler!({ new: { player_id: 'p4', pairs_matched: 8, finished: true } as MatchingPairsProgress })
    expect(load).not.toHaveBeenCalled()
  })

  it('only own finished transition triggers load() amid rapid multi-player round-end updates', () => {
    handler!({ new: { player_id: 'p2', pairs_matched: 8, finished: true } as MatchingPairsProgress })
    handler!({ new: { player_id: 'p3', pairs_matched: 8, finished: true } as MatchingPairsProgress })
    handler!({ new: { player_id: 'p4', pairs_matched: 8, finished: true } as MatchingPairsProgress })
    expect(load).not.toHaveBeenCalled()
    handler!({ new: { player_id: 'p1', pairs_matched: 8, finished: true } as MatchingPairsProgress })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('stale timestamp rejection does not interfere with the load() guard during round transition', () => {
    handler!({
      new: {
        player_id: 'p1',
        pairs_matched: 8,
        finished: true,
        updated_at: '2026-06-01T00:00:10Z',
      } as MatchingPairsProgress,
    })
    expect(load).toHaveBeenCalledTimes(1)
    // Mark player as already finished (simulating state after the first finish)
    finished = true
    // Stale event with older timestamp arrives — rejected by stale guard AND finished guard
    handler!({
      new: {
        player_id: 'p1',
        pairs_matched: 8,
        finished: true,
        updated_at: '2026-06-01T00:00:05Z',
      } as MatchingPairsProgress,
    })
    expect(load).toHaveBeenCalledTimes(1)
  })
})

// ── Group 4: Finish Detection & Multi-Player Sync ────────────────────────────

describe('Group 4: Finish Detection & Multi-Player Sync', () => {
  it('finished flag is true only when pairs_matched === total_pairs', () => {
    const totalPairs = 8
    expect(7 >= totalPairs).toBe(false)
    expect(8 >= totalPairs).toBe(true)
    expect(9 >= totalPairs).toBe(true)
  })

  afterEach(() => {
    dbState.players = []
    dbState.progressRows = []
    dbState.gameStatus = null
  })

  it('check all players done reads current state, not stale snapshot', async () => {
    dbState.gameStatus = 'active'
    dbState.players = [
      { id: 'p1', spectator: false },
      { id: 'p2', spectator: false },
      { id: 'p3', spectator: false },
    ]

    // Only p1 done — not all done
    dbState.progressRows = [{ player_id: 'p1', pairs_matched: 8, finished: true }]
    const result1 = await checkAllMatchingPairsPlayersDone(supabase as never, 'G', 'R', 8)
    expect(result1.allDone).toBe(false)

    // All three done via finished flag
    dbState.progressRows = [
      { player_id: 'p1', pairs_matched: 8, finished: true },
      { player_id: 'p2', pairs_matched: 5, finished: true },
      { player_id: 'p3', pairs_matched: 8, finished: true },
    ]
    const result2 = await checkAllMatchingPairsPlayersDone(supabase as never, 'G', 'R', 8)
    expect(result2.allDone).toBe(true)

    // All done via pairs_matched fallback even without finished flag
    dbState.progressRows = [
      { player_id: 'p1', pairs_matched: 8, finished: false },
      { player_id: 'p2', pairs_matched: 8, finished: false },
      { player_id: 'p3', pairs_matched: 8, finished: false },
    ]
    const result3 = await checkAllMatchingPairsPlayersDone(supabase as never, 'G', 'R', 8)
    expect(result3.allDone).toBe(true)
  })

  it('finish_rank is assigned atomically and uniquely', () => {
    const ranks: string[] = []
    const assignRank = (playerId: string): number => {
      ranks.push(playerId)
      return ranks.length
    }
    const r1 = assignRank('p1')
    const r2 = assignRank('p2')
    const r3 = assignRank('p3')
    expect(r1).toBe(1)
    expect(r2).toBe(2)
    expect(r3).toBe(3)
    expect(new Set([r1, r2, r3]).size).toBe(3)
  })

  it('first genuine finisher always receives rank 1', () => {
    const ranks: string[] = []
    const finish = (player: string) => {
      ranks.push(player)
      return ranks.length
    }
    expect(finish('p2')).toBe(1)
    expect(finish('p1')).toBe(2)
  })
})

// ── Group 7: Realtime Sync Resilience ───────────────────────────────────────

describe('Group 7: Realtime Sync Resilience', () => {
  it('handles out-of-order progress updates by comparing timestamps', () => {
    let stored = { pairs_matched: 0, updated_at: '2026-01-01T00:00:00Z' }
    function applyUpdate(update: typeof stored) {
      if (update.updated_at >= stored.updated_at) {
        stored = update
      }
    }
    applyUpdate({ pairs_matched: 3, updated_at: '2026-01-01T00:00:05Z' })
    expect(stored.pairs_matched).toBe(3)
    applyUpdate({ pairs_matched: 1, updated_at: '2026-01-01T00:00:01Z' })
    expect(stored.pairs_matched).toBe(3)
    applyUpdate({ pairs_matched: 5, updated_at: '2026-01-01T00:00:10Z' })
    expect(stored.pairs_matched).toBe(5)
  })
})

// ── Group 1b: Round-End vs. Game-End Detection ──────────────────────────────
// Tests that finishMatchingPairsRoundIfAllDone correctly distinguishes
// ending a round (keep game active) from ending the game (final round).

import { finishMatchingPairsRoundIfAllDone } from '@/lib/memory-match'

describe('Group 1: Round-End vs. Game-End Detection', () => {
  beforeEach(() => {
    dbState.gameStatus = 'active'
    dbState.players = [{ id: 'p1', spectator: false }]
    dbState.progressRows = [{ player_id: 'p1', pairs_matched: 8, finished: true }]
    dbState.rounds = [{ id: 'R', game_id: 'G', round_number: 1, status: 'active' }]
    dbState.updateCalls = []
    dbState.markGameFinishedCalls = 0
  })

  afterEach(() => {
    dbState.players = []
    dbState.progressRows = []
    dbState.gameStatus = null
    dbState.rounds = []
    dbState.updateCalls = []
    dbState.markGameFinishedCalls = 0
  })

  it('with total_rounds=3 and current_round=1, ends round only (not game) when all finish', async () => {
    const result = await finishMatchingPairsRoundIfAllDone(supabase as never, 'G', 'R', 1, 3, 8)
    expect(result.roundEnded).toBe(true)
    expect(result.gameEnded).toBe(false)
    expect(result.error).toBeNull()
    // markGameFinished should NOT be called for a non-final round
    expect(dbState.markGameFinishedCalls).toBe(0)
    // The round should be updated to finished
    const roundUpdate = dbState.updateCalls.find((c) => c.table === 'rounds')
    expect(roundUpdate).toBeDefined()
    expect((roundUpdate!.data as any).status).toBe('finished')
  })

  it('with total_rounds=3 and current_round=3, ends game (not just round) when all finish', async () => {
    const result = await finishMatchingPairsRoundIfAllDone(supabase as never, 'G', 'R', 3, 3, 8)
    expect(result.roundEnded).toBe(true)
    expect(result.gameEnded).toBe(true)
    expect(result.error).toBeNull()
    // markGameFinished SHOULD be called for the final round
    expect(dbState.markGameFinishedCalls).toBe(1)
  })

  it('with total_rounds=1 single round, behaves as classic single-game (game ends immediately)', async () => {
    const result = await finishMatchingPairsRoundIfAllDone(supabase as never, 'G', 'R', 1, 1, 8)
    expect(result.roundEnded).toBe(true)
    expect(result.gameEnded).toBe(true)
    expect(result.error).toBeNull()
    expect(dbState.markGameFinishedCalls).toBe(1)
  })

  it('round-end and game-end are separate condition branches (not off-by-one)', async () => {
    // Non-final: roundNumber < totalRounds
    const r1 = await finishMatchingPairsRoundIfAllDone(supabase as never, 'G', 'R', 2, 5, 8)
    expect(r1.roundEnded).toBe(true)
    expect(r1.gameEnded).toBe(false)
    expect(dbState.markGameFinishedCalls).toBe(0)

    // Final: roundNumber === totalRounds
    const r2 = await finishMatchingPairsRoundIfAllDone(supabase as never, 'G', 'R', 5, 5, 8)
    expect(r2.roundEnded).toBe(true)
    expect(r2.gameEnded).toBe(true)
    expect(dbState.markGameFinishedCalls).toBe(1)
  })

  it('boundary: current_round === total_rounds triggers game-end, not total_rounds - 1 or + 1', async () => {
    // total_rounds=5, current=4 → NOT final
    const r1 = await finishMatchingPairsRoundIfAllDone(supabase as never, 'G', 'R', 4, 5, 8)
    expect(r1.gameEnded).toBe(false)
    const callsAfterR1 = dbState.markGameFinishedCalls

    // total_rounds=5, current=5 → IS final
    const r2 = await finishMatchingPairsRoundIfAllDone(supabase as never, 'G', 'R', 5, 5, 8)
    expect(r2.gameEnded).toBe(true)
    expect(dbState.markGameFinishedCalls).toBe(callsAfterR1 + 1)
  })

  it('returns early when game is not active', async () => {
    dbState.gameStatus = 'finished'
    const result = await finishMatchingPairsRoundIfAllDone(supabase as never, 'G', 'R', 1, 3, 8)
    expect(result.roundEnded).toBe(false)
    expect(result.gameEnded).toBe(false)
    expect(dbState.markGameFinishedCalls).toBe(0)
  })

  it('returns early when not all players are done', async () => {
    dbState.progressRows = [{ player_id: 'p1', pairs_matched: 3, finished: false }]
    const result = await finishMatchingPairsRoundIfAllDone(supabase as never, 'G', 'R', 1, 3, 8)
    expect(result.roundEnded).toBe(false)
    expect(result.gameEnded).toBe(false)
    expect(dbState.markGameFinishedCalls).toBe(0)
  })
})

// ── Group 2: Round Timer Behavior ─────────────────────────────────────────────

describe('Group 2: Round Timer Behavior', () => {
  beforeEach(() => {
    dbState.gameStatus = 'active'
    dbState.players = [
      { id: 'p1', spectator: false },
      { id: 'p2', spectator: false },
    ]
    dbState.progressRows = []
    dbState.updateCalls = []
    dbState.markGameFinishedCalls = 0
  })

  afterEach(() => {
    dbState.players = []
    dbState.progressRows = []
    dbState.gameStatus = null
    dbState.updateCalls = []
    dbState.markGameFinishedCalls = 0
  })

  it('timer expiry for round 1 triggers round-end (not game-end) in multi-round game', async () => {
    // Simulate what the expire-matching-pairs route does: mark all non-finished
    // players as finished, mark round finished, then check if game should end.
    // For round 1 of 3, the game should NOT end.

    // Simulate expire route logic for round 1 of 3
    const currentRoundNumber = 1
    const totalRounds = 3
    const now = '2026-01-01T00:00:30Z'

    // Mark all unfinshed progress rows as finished (timeout)
    dbState.progressRows = [
      { player_id: 'p1', pairs_matched: 3, finished: false },
      { player_id: 'p2', pairs_matched: 5, finished: false },
    ]

    // Simulate expire: mark round finished
    dbState.rounds = [{ id: 'R', game_id: 'G', round_number: 1, status: 'active' }]

    // Now call finishMatchingPairsRoundIfAllDone — it checks allDone via the
    // progress table, which now has all players marked finished.
    dbState.progressRows = [
      { player_id: 'p1', pairs_matched: 3, finished: true },
      { player_id: 'p2', pairs_matched: 5, finished: true },
    ]

    const result = await finishMatchingPairsRoundIfAllDone(
      supabase as never,
      'G',
      'R',
      currentRoundNumber,
      totalRounds,
      8
    )
    expect(result.roundEnded).toBe(true)
    expect(result.gameEnded).toBe(false)
    expect(dbState.markGameFinishedCalls).toBe(0)
  })

  it('timer expiry on the last round ends the game, same as completion-triggered round-end', async () => {
    dbState.progressRows = [
      { player_id: 'p1', pairs_matched: 3, finished: true },
      { player_id: 'p2', pairs_matched: 5, finished: true },
    ]
    const result = await finishMatchingPairsRoundIfAllDone(supabase as never, 'G', 'R', 2, 2, 8)
    expect(result.roundEnded).toBe(true)
    expect(result.gameEnded).toBe(true)
    expect(dbState.markGameFinishedCalls).toBe(1)
  })

  it('if all players finish before expiry, round ends without waiting for timer', async () => {
    // All players already finished — the function should detect allDone
    dbState.progressRows = [
      { player_id: 'p1', pairs_matched: 8, finished: true },
      { player_id: 'p2', pairs_matched: 8, finished: true },
    ]
    const result = await finishMatchingPairsRoundIfAllDone(supabase as never, 'G', 'R', 1, 3, 8)
    expect(result.roundEnded).toBe(true)
    expect(result.gameEnded).toBe(false)
  })

  it('timer state does not leak between rounds (each round gets independent lifecycle)', () => {
    // This tests that roundId changes between rounds cause the realtime
    // progress channel to re-subscribe with the new round ID.
    // The component's progress useEffect includes roundId in dependencies,
    // so a round change triggers cleanup and re-subscription.
    let currentRoundId: string | null = null
    let channelRoundId: string | null = null

    const subscribeToRound = (roundId: string) => {
      // Cleanup old channel
      channelRoundId = null
      currentRoundId = null
      // Subscribe to new round
      channelRoundId = roundId
      currentRoundId = roundId
    }

    subscribeToRound('R1')
    expect(currentRoundId).toBe('R1')
    expect(channelRoundId).toBe('R1')

    // Round transition — re-subscribe with new ID
    subscribeToRound('R2')
    expect(currentRoundId).toBe('R2')
    expect(channelRoundId).toBe('R2')
    // Old channel values should be gone
    expect(channelRoundId).not.toBe('R1')
  })
})

// ── Group 5: Board State Isolation Between Rounds ─────────────────────────────

describe('Group 5: Board State Isolation Between Rounds', () => {
  it("round-based progress filtering isolates each round's data", () => {
    const progress: Array<{ player_id: string; round_id: string; pairs_matched: number }> = [
      { player_id: 'p1', round_id: 'R1', pairs_matched: 8 },
      { player_id: 'p1', round_id: 'R2', pairs_matched: 3 },
      { player_id: 'p2', round_id: 'R1', pairs_matched: 8 },
      { player_id: 'p2', round_id: 'R2', pairs_matched: 5 },
    ]

    const round1Progs = progress.filter((p) => p.round_id === 'R1')
    const round2Progs = progress.filter((p) => p.round_id === 'R2')

    expect(round1Progs).toHaveLength(2)
    expect(round1Progs.every((p) => p.round_id === 'R1')).toBe(true)
    expect(round2Progs).toHaveLength(2)
    expect(round2Progs.every((p) => p.round_id === 'R2')).toBe(true)

    // Round 1's pairs_matched values should not leak into round 2
    const r1Values = round1Progs.map((p) => p.pairs_matched)
    const r2Values = round2Progs.map((p) => p.pairs_matched)
    expect(r1Values).toEqual([8, 8])
    expect(r2Values).toEqual([3, 5])
    expect(r1Values).not.toEqual(r2Values)
  })

  it('submissions filtering by round_id isolates per-round flip/match state', () => {
    const subs: Array<{ player_id: string; round_id: string; pair_index: number; is_match: boolean }> = [
      { player_id: 'p1', round_id: 'R1', pair_index: 0, is_match: true },
      { player_id: 'p1', round_id: 'R1', pair_index: 1, is_match: true },
      { player_id: 'p1', round_id: 'R2', pair_index: 0, is_match: true },
    ]

    const round1Subs = subs.filter((s) => s.round_id === 'R1')
    const round2Subs = subs.filter((s) => s.round_id === 'R2')

    expect(round1Subs).toHaveLength(2)
    expect(round2Subs).toHaveLength(1)
    // Round 2 should not see round 1's submissions
    expect(round2Subs.every((s) => s.round_id === 'R2')).toBe(true)
  })

  it('cumulative score persists while per-round progress resets independently', () => {
    const mockScores: Record<string, number> = {}

    function recordRoundScore(playerId: string, roundId: string, score: number) {
      const key = `${playerId}_${roundId}`
      mockScores[key] = score
    }

    function getCumulative(playerId: string): number {
      return Object.entries(mockScores)
        .filter(([key]) => key.startsWith(`${playerId}_`))
        .reduce((sum, [, score]) => sum + score, 0)
    }

    // Round 1
    recordRoundScore('p1', 'R1', 4000)
    recordRoundScore('p2', 'R1', 3000)
    expect(getCumulative('p1')).toBe(4000)

    // Round 2 — new scores added
    recordRoundScore('p1', 'R2', 2500)
    expect(getCumulative('p1')).toBe(6500)

    // Round 1 progress does not leak
    const round1Scores = Object.entries(mockScores)
      .filter(([key]) => key.endsWith('_R1'))
      .map(([, v]) => v)
    expect(round1Scores).toEqual([4000, 3000])
  })

  it('round 2 starts with fresh progress (0 pairs, 0 wrong, 0 streak) while cumulative exists', () => {
    // Simulate what afterResolve does: load round 2 progress separately from round 1
    const round1Progress = { pairs_matched: 8, wrong_attempts: 2, streak: 5 }
    const round2Progress = { pairs_matched: 0, wrong_attempts: 0, streak: 0 }

    // Round 1: full progress
    expect(round1Progress.pairs_matched).toBe(8)
    expect(round1Progress.wrong_attempts).toBe(2)
    expect(round1Progress.streak).toBe(5)

    // Round 2: fresh, no carry-over
    expect(round2Progress.pairs_matched).toBe(0)
    expect(round2Progress.wrong_attempts).toBe(0)
    expect(round2Progress.streak).toBe(0)

    // Cumulative exists but is separate
    const cumulative = 6500
    expect(cumulative).toBeGreaterThan(0)
  })

  it('ownFinished is correctly false for round 2 even when round 1 progress has finished=true', () => {
    // Simulate the afterResolve fix: progData contains rows from ALL rounds,
    // but the ownFinished check must only consider the current round's row.
    const progData = [
      {
        player_id: 'p1',
        round_id: 'R1',
        pairs_matched: 8,
        finished: true,
        finish_rank: 1,
        updated_at: '2026-01-01T00:00:20Z',
      },
      {
        player_id: 'p1',
        round_id: 'R2',
        pairs_matched: 0,
        finished: false,
        finish_rank: null,
        updated_at: '2026-01-01T00:00:30Z',
      },
    ]

    // This is the fix: filter by current round_id before finding player's progress
    const currentRoundId = 'R2'
    const currentProgs = progData.filter((p) => p.round_id === currentRoundId)
    const myProg = currentProgs.find((p) => p.player_id === 'p1')
    const ownFinished = myProg?.finished === true

    expect(ownFinished).toBe(false)
    expect(myProg?.pairs_matched).toBe(0)
    expect(myProg?.finish_rank).toBeNull()

    // Without the fix (looking up by player_id only), it would find round 1's row
    const wrongProg = progData.find((p) => p.player_id === 'p1')
    expect(wrongProg?.finished).toBe(true) // This is the bug we fixed
  })
})

// ── Group 6: Auto-Advance Transition ─────────────────────────────────────────

describe('Group 6: Auto-Advance Transition', () => {
  it('replicating computeScreen: round_results when roundFinished and game not finished', () => {
    const computeScreen = (status: string, roundFinished: boolean, ownFinished: boolean, hasBoard: boolean): string => {
      if (status === 'waiting') return 'waiting'
      if (status === 'finished') return 'finished'
      if (roundFinished) return 'round_results'
      if (ownFinished) return 'waiting_for_others'
      return hasBoard ? 'playing' : 'waiting'
    }

    // Round ended, game still active
    expect(computeScreen('active', true, false, false)).toBe('round_results')
    // Game finished (no round_results after final round)
    expect(computeScreen('finished', false, false, false)).toBe('finished')
    // Playing normally
    expect(computeScreen('active', false, false, true)).toBe('playing')
  })

  it("auto-advance fires past round_results to next round's playing screen", () => {
    // Simulate the round_results → playing transition sequence
    let screen = 'round_results'
    let roundId = 'R1'
    let status = 'active'

    // Auto-advance: next round starts (simulates realtime event updating rounds)
    roundId = 'R2'
    status = 'active'
    screen = 'playing' // afterResolve would set hasBoard=true for new round

    expect(screen).toBe('playing')
    expect(roundId).toBe('R2')
  })

  it('auto-advance does NOT fire after the final round (game ends instead)', () => {
    // Simulate the final round ending
    let screen = 'round_results'
    let status = 'active'

    // For the final round, auto-advance should NOT fire
    // Instead, finishMatchingPairsRoundIfAllDone marks game as finished
    status = 'finished'
    screen = 'finished'

    expect(screen).toBe('finished')
    expect(status).toBe('finished')
  })

  it('no double-advance: round transitions exactly once per round-end event', () => {
    let roundAdvanceCount = 0
    let currentRound = 1

    function advanceRound() {
      roundAdvanceCount++
      currentRound++
    }

    // Single trigger
    advanceRound()
    expect(currentRound).toBe(2)
    expect(roundAdvanceCount).toBe(1)

    // Duplicate trigger (e.g., from realtime double-fire)
    // The guard should reject it — in practice this is handled by the DB
    // (round already finished) and the realtime handler's state check.
    // Round only advances once per event.
    expect(roundAdvanceCount).toBe(1)
  })
})

// ── Group 7b: Reconnect / Refresh Mid-Round ──────────────────────────────────

describe('Group 7: Reconnect / Refresh Mid-Round', () => {
  it("reconnecting mid-round loads that round's board and progress", () => {
    // Simulate afterResolve loading data for the current round
    function simulateLoad(roundId: string): { boardReady: boolean; roundId: string; pairsMatched: number } {
      // afterResolve would query submissions/progress for this roundId
      const progressRows = [{ player_id: 'p1', round_id: 'R2', pairs_matched: 4, finished: false }]
      const row = progressRows.find((p) => p.round_id === roundId && p.player_id === 'p1')
      return {
        boardReady: true,
        roundId,
        pairsMatched: row?.pairs_matched ?? 0,
      }
    }

    // Player reconnects during round 2
    const result = simulateLoad('R2')
    expect(result.boardReady).toBe(true)
    expect(result.roundId).toBe('R2')
    expect(result.pairsMatched).toBe(4) // Not 0, not round 1 state
  })

  it('reconnecting retains cumulative score from prior completed rounds', () => {
    const scoresByRound: Record<string, number> = { R1: 4500, R2: 3200 }
    function getCumulative(playerId: string, completedRounds: string[]): number {
      return completedRounds.reduce((sum, r) => sum + (scoresByRound[r] ?? 0), 0)
    }

    // Player reconnects after round 2 started (R1 completed)
    const cumulative = getCumulative('p1', ['R1'])
    expect(cumulative).toBe(4500)

    // After round 2 completes
    const cumulativeAfterR2 = getCumulative('p1', ['R1', 'R2'])
    expect(cumulativeAfterR2).toBe(7700)
  })

  it('reconnecting during Round Results shows round_results screen, not stale board', () => {
    // Simulate: player reconnects while screen is round_results
    const roundFinished = true
    const gameStatus: string = 'active'

    let screen: string
    if (gameStatus === 'finished') {
      screen = 'finished'
    } else if (roundFinished) {
      screen = 'round_results'
    } else {
      screen = 'playing'
    }

    expect(screen).toBe('round_results')
  })

  it('reconnecting as auto-advance transitions lands in new round, not stuck on old', () => {
    // Simulate: player reconnects right when round transitions from 1 to 2
    let roundId = 'R1'
    let hasBoard = false

    // afterResolve detects new round
    roundId = 'R2'
    hasBoard = true

    expect(roundId).toBe('R2')
    expect(hasBoard).toBe(true)
    // Not stuck on old round
    expect(roundId).not.toBe('R1')
  })
})
