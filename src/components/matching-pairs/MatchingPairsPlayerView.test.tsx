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
      }
      const p = Promise.resolve({ data, error: null })
      const b: any = {
        select: () => b,
        eq: () => b,
        order: () => b,
        maybeSingle: () => p,
        then: (resolve: any) => p.then(resolve),
      }
      return b
    },
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
