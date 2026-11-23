// @vitest-environment jsdom
/**
 * Matching Pairs player view: how the board is reconciled with the server after a refused flip.
 *
 * The view plays optimistically (cards, streak and points move before the server answers). When a flip is
 * refused the board must be rebuilt from the stored submissions, but never from a snapshot that may predate a
 * flip, never from a failed read, and without re-reading in a loop while a card is selected. The bootstrap hook
 * is replaced by a small fake whose `load()` runs the view's own `afterResolve` against a stateful fake database,
 * so the view's real snapshot-application code is what is exercised.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY } from '@/lib/memory-match'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'

type Sub = {
  id: string
  game_id: string
  round_id: string
  player_id: string
  pair_index: number
  is_match: boolean
  streak_at_time: number
  streak_bonus: number
  points_after: number
  submitted_at: string
}

const GAME = {
  id: 'ABCD',
  status: 'active',
  game_type: 'matching_pairs',
  current_round_number: 1,
  rounds_count: 1,
  timer_seconds: null,
  session_started_at: '2026-01-01T00:00:00Z',
}
const ROUND = {
  id: 'r1',
  status: 'active',
  started_at: '2026-01-01T00:00:00Z',
  memory_match_metadata: {
    gridSizePairs: 3,
    seed: 1,
    pairs: [
      { icon: 'A', color: '#111', pairIndex: 0 },
      { icon: 'B', color: '#222', pairIndex: 1 },
      { icon: 'C', color: '#333', pairIndex: 2 },
    ],
    // cards 0,1 = pair 0; cards 2,3 = pair 1; cards 4,5 = pair 2
    playerBoards: [{ playerId: 'p1', cardOrder: [0, 0, 1, 1, 2, 2] }],
  },
}

const db = vi.hoisted(() => ({
  subs: [] as unknown[],
  failReads: false,
  roundId: 'r1',
  reads: 0,
  /** Holds the next submissions read open (once), so a read can be in flight across other events. */
  readGate: null as null | Promise<void>,
}))
const boot = vi.hoisted(() => ({
  opts: null as null | {
    afterResolve: (g: unknown, playerId: string | null, state: unknown) => Promise<unknown>
  },
  loadCalls: 0,
  /** Controls when the fake load() finishes, to interleave it with flips. */
  gate: null as null | Promise<void>,
}))

vi.mock('@/lib/supabase', () => {
  const result = (table: string) => {
    if (table === 'rounds') return { data: ROUND_ROW(), error: null }
    if (table === 'memory_match_submissions') {
      db.reads += 1
      return db.failReads ? { data: null, error: { message: 'boom' } } : { data: [...db.subs], error: null }
    }
    if (table === 'memory_match_progress')
      return db.failReads ? { data: null, error: { message: 'boom' } } : { data: [], error: null }
    return { data: null, error: null }
  }
  const chain = (table: string): unknown => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order']) q[m] = () => q
    q.maybeSingle = async () => result(table)
    q.then = (resolve: (v: unknown) => unknown) => {
      // One-shot: only the next submissions query is held, not the follow-up refreshes after a flip.
      const gate = table === 'memory_match_submissions' ? db.readGate : null
      if (gate) db.readGate = null
      const snapshot = result(table) // the data is read when the query starts, as a real request would
      return (gate ?? Promise.resolve()).then(() => snapshot).then(resolve)
    }
    return q
  }
  return {
    supabase: {
      from: (table: string) => chain(table),
      channel: () => {
        const c = { on: () => c, subscribe: () => c }
        return c
      },
      removeChannel: () => {},
    },
  }
})
function ROUND_ROW() {
  return { ...ROUND, id: db.roundId }
}

vi.mock('@/hooks/useGameViewBootstrap', async () => {
  const React = await import('react')
  return {
    useGameViewBootstrap: (opts: typeof boot.opts) => {
      boot.opts = opts
      const load = React.useCallback(async () => {
        boot.loadCalls += 1
        if (boot.gate) await boot.gate
        await boot.opts!.afterResolve(GAME, 'p1', { hasBoard: false, ownFinished: false, roundFinished: false })
        return true
      }, [])
      React.useEffect(() => {
        void load()
      }, [load])
      return {
        screen: 'playing',
        game: GAME,
        setGame: () => {},
        players: [{ id: 'p1', name: 'Me', spectator: false, is_eliminated: false, joined_at: '2025-12-31T00:00:00Z' }],
        setPlayers: () => {},
        myPlayerId: 'p1',
        setMyPlayerId: () => {},
        myResumeToken: 'tok',
        setMyResumeToken: () => {},
        joinName: '',
        setJoinName: () => {},
        joining: false,
        load,
        lobbyFull: false,
        join: () => {},
      }
    },
  }
})

vi.mock('@/hooks/useRoomMemberJoin', () => ({
  useRoomMemberJoin: () => ({ displayName: '', joinExtras: {}, resolving: false }),
  useRoomMemberNamePrefill: () => {},
}))
vi.mock('@/hooks/useGameRosterPoll', () => ({ useGameRosterPoll: () => {} }))
vi.mock('@/hooks/useLobbyOpenNotification', () => ({ useLobbyOpenNotification: () => {} }))
vi.mock('@/hooks/useLateJoinContext', () => ({ useLateJoinContext: () => ({}) }))
vi.mock('@/hooks/useTurnNotifications', () => ({ useTurnNotifications: () => {} }))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }))
vi.mock('@/components/roster/RosterDrawerContext', () => ({
  useGameScores: () => {},
  useGameStats: () => {},
}))
vi.mock('@/components/GameSettingsContext', () => ({ useRegisterGameSettings: () => {} }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }))
vi.mock('@/components/ui/EditNameInline', () => ({ EditNameInline: () => null }))
vi.mock('@/components/ui/LeaveGameButton', () => ({ LeaveGameButton: () => null }))
vi.mock('@/components/game-lobby/RulesInPlaySection', () => ({ RulesInPlaySection: () => null }))
vi.mock('@/components/GameEndedScreen', () => ({ GameEndedScreen: () => null }))
vi.mock('@/components/PaginatedLeaderboard', () => ({ PaginatedLeaderboard: () => null }))
vi.mock('@/components/host/HostGameFinishedActions', () => ({ HostGameFinishedActions: () => null }))
vi.mock('@/components/ShareResults', () => ({ ShareResults: () => null }))
vi.mock('@/components/matching-pairs/MatchingPairsStatDetails', () => ({
  MatchingPairsStatDetails: () => null,
  MatchingPairsFinalBreakdown: () => null,
}))
vi.mock('@/components/matching-pairs/MatchingPairsGameTimerBar', () => ({ MatchingPairsGameTimerBar: () => null }))
vi.mock('@/components/community/PostWinToCommunity', () => ({ PostWinToCommunity: () => null }))
vi.mock('@/components/GameStartedWaiting', () => ({ GameStartedWaiting: () => null }))
vi.mock('@/components/game-lobby/GameJoinHeader', () => ({ GameJoinHeader: () => null }))
vi.mock('@/components/game-lobby/GameInfoChips', () => ({ GameInfoChips: () => null }))
vi.mock('@/components/game-lobby/GameJoinLobbyShell', () => ({ GameJoinLobbyShell: () => null }))
vi.mock('@/components/game-lobby/GameLobbyWaitingPanel', () => ({ GameLobbyWaitingPanel: () => null }))
vi.mock('@/components/game-lobby/NameJoinForm', () => ({ NameJoinForm: () => null }))
vi.mock('@/components/LateJoinChoice', () => ({ LateJoinChoice: () => null }))
vi.mock('@/components/ViewerModeBanner', () => ({ ViewerModeBanner: () => null }))
vi.mock('@/components/ui/GameRulesLink', () => ({ GameRulesLink: () => null }))
vi.mock('@/components/ReplayReadyRing', () => ({ ReplayReadyRing: () => null }))

import { MatchingPairsPlayerView } from './MatchingPairsPlayerView'

let fetchMock: ReturnType<typeof vi.fn>

const sub = (pair: number, isMatch: boolean, streak: number, points: number, n: number): Sub => ({
  id: `s${n}`,
  game_id: 'ABCD',
  round_id: 'r1',
  player_id: 'p1',
  pair_index: pair,
  is_match: isMatch,
  streak_at_time: streak,
  streak_bonus: 0,
  points_after: points,
  submitted_at: `2026-01-01T00:00:0${n}Z`,
})

const cards = () => screen.getAllByRole('button').filter((b) => /card/i.test(b.getAttribute('aria-label') ?? ''))
const hiddenCount = () => cards().filter((b) => b.getAttribute('aria-label') === 'Hidden card').length
const scoreValue = () => screen.getByText('Score').nextElementSibling!.textContent
const streakValue = () => screen.getByText('Streak').nextElementSibling!.textContent

async function mount() {
  render(<MatchingPairsPlayerView gameCode="ABCD" />)
  // The first load builds the board from the (empty) stored history.
  await waitFor(() => expect(cards()).toHaveLength(6))
}

beforeEach(() => {
  db.subs = []
  db.failReads = false
  db.roundId = 'r1'
  db.reads = 0
  db.readGate = null
  boot.loadCalls = 0
  boot.gate = null
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const refused = () => ({ ok: false, json: async () => ({ error: 'The round changed while recording this flip' }) })

describe('Matching Pairs player view: reconciling after a refused flip', () => {
  it('rebuilds the board, streak and points from the server after a refused match', async () => {
    fetchMock.mockResolvedValue(refused())
    await mount()
    const loadsBefore = boot.loadCalls

    fireEvent.click(cards()[0])
    fireEvent.click(cards()[1]) // pair 0 matches: optimistic +100
    expect(scoreValue()).not.toBe('0')

    // Nothing was stored, so the resync shows the empty board and no points again.
    await waitFor(() => expect(scoreValue()).toBe('0'))
    expect(streakValue()).toBe('0🔥')
    expect(hiddenCount()).toBe(6)
    expect(boot.loadCalls).toBe(loadsBefore + 1)
  })

  it('does not reset the board when the snapshot read fails', async () => {
    // The flip is accepted and stored; a later read fails and must not look like an empty history.
    await mount()
    fetchMock.mockImplementation(async () => {
      db.subs = [sub(0, true, 1, 100, 1)]
      return { ok: true, json: async () => ({ currentStreak: 1, pointsAfter: 100, finished: false }) }
    })
    fireEvent.click(cards()[0])
    fireEvent.click(cards()[1])
    await waitFor(() => expect(scoreValue()).toBe('100'))

    db.failReads = true
    await act(async () => {
      await boot.opts!.afterResolve(GAME, 'p1', {})
    })
    expect(scoreValue()).toBe('100')
    expect(hiddenCount()).toBe(4)
  })

  it('reads again by itself after a failed snapshot read, without touching the board meanwhile', async () => {
    // No realtime event, poll or flip follows the failure: only the bounded retry can reconcile the board.
    db.subs = [sub(0, true, 1, 100, 1)]
    await mount()
    expect(scoreValue()).toBe('100')

    db.failReads = true
    await act(async () => {
      await boot.opts!.afterResolve(GAME, 'p1', {})
    })
    expect(scoreValue()).toBe('100')
    expect(hiddenCount()).toBe(4)

    // The server recovers (and holds one more match than the screen shows); nobody calls load().
    db.subs = [sub(0, true, 1, 100, 1), sub(1, true, 2, 200, 2)]
    db.failReads = false
    await waitFor(() => expect(scoreValue()).toBe('200'), { timeout: 3000 })
    expect(hiddenCount()).toBe(2)
  })

  it('keeps the optimistic board while a flip is in flight, then reads again once it has settled', async () => {
    let answer: (v: unknown) => void = () => {}
    fetchMock.mockReturnValue(new Promise((r) => (answer = r)))
    await mount()
    fireEvent.click(cards()[0])
    fireEvent.click(cards()[1]) // optimistic match, request unanswered

    // A load that completes now holds a snapshot without this flip: it must not hide the match.
    await act(async () => {
      await boot.opts!.afterResolve(GAME, 'p1', {})
    })
    expect(scoreValue()).not.toBe('0')
    expect(hiddenCount()).toBe(4)

    answer(refused())
    await waitFor(() => expect(scoreValue()).toBe('0'))
  })

  it('does not replace a selected, unpaired card, and does not read again in a loop', async () => {
    await mount()
    fireEvent.click(cards()[0]) // first card of a pair, selected
    const loadsBefore = boot.loadCalls
    const readsBefore = db.reads

    await act(async () => {
      await boot.opts!.afterResolve(GAME, 'p1', {})
      await boot.opts!.afterResolve(GAME, 'p1', {})
    })
    expect(cards()[0].getAttribute('aria-label')).not.toBe('Hidden card')
    // Only the two reads this test made itself: nothing re-armed a read.
    expect(db.reads - readsBefore).toBe(2)
    expect(boot.loadCalls).toBe(loadsBefore)
  })

  it("does not keep the previous round's board up when the read fails for a new round", async () => {
    await mount()
    expect(cards()).toHaveLength(6)

    db.roundId = 'r2' // a new round started, and this load's reads fail
    db.failReads = true
    let state: unknown
    await act(async () => {
      state = await boot.opts!.afterResolve(GAME, 'p1', {})
    })
    expect((state as { hasBoard: boolean }).hasBoard).toBe(false)
    await waitFor(() => expect(screen.queryAllByRole('button', { name: /card/i })).toHaveLength(0))
  })

  // Cards 0,1 are pair 0 (stored as matched, streak 1, 100 points); a miss is cards 2 (pair 1) and 4 (pair 2).
  const storedMatch = () => [sub(0, true, 1, 100, 1)]

  it('after a refused miss, reconciles streak and points once the pair has flipped back', async () => {
    fetchMock.mockResolvedValue(refused())
    db.subs = storedMatch()
    await mount()
    expect(scoreValue()).toBe('100')
    expect(streakValue()).toBe('1🔥')
    const loadsBefore = boot.loadCalls

    fireEvent.click(cards()[2])
    fireEvent.click(cards()[4]) // a miss: streak reset and penalty applied optimistically
    expect(streakValue()).toBe('0🔥')
    // The refusal resyncs while the pair is still flipping back (board locked): that snapshot is deferred, and
    // the idle board after the flip-back reads again exactly once.
    await waitFor(() => expect(hiddenCount()).toBe(4), { timeout: 3000 })
    await waitFor(() => expect(boot.loadCalls).toBeGreaterThan(loadsBefore))
    await waitFor(() => expect(scoreValue()).toBe('100'))
    expect(streakValue()).toBe('1🔥')
    const settled = boot.loadCalls
    await new Promise((r) => setTimeout(r, 300))
    expect(boot.loadCalls).toBe(settled) // no repeated reads
  })

  it('a read that finishes after the flip-back timer unlocked the board but before it rendered is still reconciled', async () => {
    // Only setTimeout is faked, so the flip-back timer can be fired by hand while React's own scheduler (a
    // separate macrotask) has not yet rendered the unlock. A read that completes in microtasks right then still
    // sees the board as locked and defers; the idle-board effect must pick that up once the render lands.
    fetchMock.mockResolvedValue(refused())
    db.subs = storedMatch()
    await mount()

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const flush = () =>
      act(async () => {
        for (let i = 0; i < 25; i++) await Promise.resolve()
      })
    fireEvent.click(cards()[2])
    fireEvent.click(cards()[4]) // a miss, refused: its resync reads while the board is still locked and defers
    await flush()
    expect(scoreValue()).not.toBe('100') // still the optimistic miss
    const loadsBeforeUnlock = boot.loadCalls

    const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    const prevActEnv = g.IS_REACT_ACT_ENVIRONMENT
    g.IS_REACT_ACT_ENVIRONMENT = false // let React render on its own scheduler, outside act
    try {
      vi.advanceTimersByTime(900) // the timer unlocks the board: setBoard is scheduled but not rendered yet
      // A read completing in this gap: microtasks run before React's scheduler task.
      await boot.opts!.afterResolve(GAME, 'p1', {})
      vi.useRealTimers()
      await waitFor(() => expect(scoreValue()).toBe('100'), { timeout: 3000 })
    } finally {
      vi.useRealTimers()
      g.IS_REACT_ACT_ENVIRONMENT = prevActEnv
    }
    expect(streakValue()).toBe('1🔥')
    expect(hiddenCount()).toBe(4)
    // Reads: the one in the gap plus the single follow-up from the idle board; nothing keeps re-reading.
    const settled = boot.loadCalls
    await new Promise((r) => setTimeout(r, 300))
    expect(boot.loadCalls).toBe(settled)
    expect(settled - loadsBeforeUnlock).toBeLessThanOrEqual(1)
  })

  it('a read that started before an accepted flip is not applied over it, and is read again', async () => {
    // The read's snapshot (taken when it starts) lacks the miss that is stored afterwards. It finishes only once
    // the board is idle again; applying it would put the pre-miss streak and points back.
    const PEN = MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY
    let releaseRead: () => void = () => {}
    db.subs = storedMatch()
    fetchMock.mockImplementation(async () => {
      db.subs = [...storedMatch(), sub(1, false, 0, 100 - PEN, 2)]
      return { ok: true, json: async () => ({ currentStreak: 0, pointsAfter: 100 - PEN, finished: false }) }
    })
    await mount()

    db.readGate = new Promise<void>((r) => {
      releaseRead = r
    })
    const readsBefore = db.reads
    let inFlightRead: Promise<unknown> = Promise.resolve()
    act(() => {
      inFlightRead = boot.opts!.afterResolve(GAME, 'p1', {})
    })
    // Wait until the submissions query has started, so its snapshot predates the miss.
    await waitFor(() => expect(db.reads).toBe(readsBefore + 1))
    fireEvent.click(cards()[2])
    fireEvent.click(cards()[4]) // the miss, stored by the (accepted) request
    await waitFor(() => expect(hiddenCount()).toBe(4), { timeout: 3000 }) // flipped back: the board is idle
    db.readGate = null
    await act(async () => {
      releaseRead()
      await inFlightRead
    })
    await waitFor(() => expect(streakValue()).toBe('0🔥'))
    expect(scoreValue()).toBe(String(100 - PEN))
    const settled = boot.loadCalls
    await new Promise((r) => setTimeout(r, 300))
    expect(boot.loadCalls).toBe(settled)
  })
})
