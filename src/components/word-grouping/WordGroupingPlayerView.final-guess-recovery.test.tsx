// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

/**
 * Regression test for the final-guess failure path of the Word Grouping player view.
 *
 * The last player's final guess can COMMIT and then the request 500s (the game finish failed). The
 * client then never sees its own submission unless the realtime INSERT arrives; with the event missed
 * the local count stays at 3/4, the puzzle looks unfinished, and the completion nudge — which is
 * enabled only for a finished puzzle — never starts. The view must reload the submissions after a 5xx
 * so the committed guess is observed and the nudge turns on. This runs the REAL `afterResolve` /
 * `computeScreen` of the view against a fake database, with the realtime event deliberately never
 * delivered.
 */

const WORDS = ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4', 'c1', 'c2', 'c3', 'c4', 'd1', 'd2', 'd3', 'd4']
const sub = (id: string, group: number, correct: boolean) => ({
  id,
  game_id: 'GAME',
  round_id: 'r1',
  player_id: 'p1',
  group_index: group,
  difficulty: group + 1,
  guess_words: WORDS.slice(group * 4, group * 4 + 4),
  is_correct: correct,
  mistakes_at_time: 0,
  submitted_at: '2026-01-01T00:00:00.000Z',
})

const db = vi.hoisted(() => ({
  submissions: [] as unknown[],
  loadCalls: 0,
  nudgeEnabled: [] as boolean[],
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel() {
      const ch = { on: () => ch, subscribe: () => ch }
      return ch
    },
    removeChannel: () => Promise.resolve('ok'),
    from(table: string) {
      const rows = () =>
        table === 'rounds'
          ? { id: 'r1', word_grouping_metadata: { words: WORDS } }
          : table === 'word_grouping_submissions'
            ? db.submissions
            : null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select: () => b,
        eq: () => b,
        maybeSingle: () => Promise.resolve({ data: rows(), error: null }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
      }
      return b
    },
  },
}))

// The bootstrap hook is replaced by a small stand-in that drives the view's own `afterResolve` and
// `computeScreen`, so the initial load and every `load()` run the real loading code.
vi.mock('@/hooks/useGameViewBootstrap', async () => {
  const React = await import('react')
  const GAME = { id: 'GAME', status: 'active', session_started_at: null, game_duration_seconds: 0 }
  const ME = { id: 'p1', name: 'Me', spectator: false }
  return {
    useGameViewBootstrap: (opts: {
      afterResolve: (g: unknown, p: string | null) => Promise<unknown>
      computeScreen: (g: unknown, p: string | null, s: unknown) => string
    }) => {
      const [screen, setScreen] = React.useState('loading')
      const [game, setGame] = React.useState(GAME)
      const [players, setPlayers] = React.useState([ME])
      const optsRef = React.useRef(opts)
      optsRef.current = opts
      const load = React.useCallback(async () => {
        db.loadCalls += 1
        const state = await optsRef.current.afterResolve(GAME, 'p1')
        setScreen(optsRef.current.computeScreen(GAME, 'p1', state))
      }, [])
      React.useEffect(() => {
        void load()
      }, [load])
      return {
        screen,
        game,
        setGame,
        players,
        setPlayers,
        myPlayerId: 'p1',
        myResumeToken: 'tok',
        joinName: '',
        setJoinName: () => {},
        joining: false,
        join: () => {},
        load,
        lobbyFull: false,
      }
    },
  }
})

// The nudge hook is spied on (not stubbed away): what matters here is whether the view ENABLES it.
vi.mock('@/hooks/useWordGroupingCompletionNudge', () => ({
  useWordGroupingCompletionNudge: (_code: string, enabled: boolean) => {
    db.nudgeEnabled.push(enabled)
  },
}))

vi.mock('@/hooks/useGameRosterPoll', () => ({ useGameRosterPoll: () => {} }))
vi.mock('@/hooks/useRoomMemberJoin', () => ({
  useRoomMemberJoin: () => ({ displayName: null, joinExtras: undefined, resolving: false }),
  useRoomMemberAutoJoin: () => {},
  useRoomMemberNamePrefill: () => {},
}))
vi.mock('@/components/roster/RosterDrawerContext', () => ({
  useGameScores: () => {},
  useGameStats: () => {},
  useRosterBase: () => {},
}))
vi.mock('@/components/GameSettingsContext', () => ({ useRegisterGameSettings: () => {} }))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ error: vi.fn() }) }))
vi.mock('@/lib/viewers', () => ({
  allowLatePlayers: () => false,
  preJoinScreen: () => null,
  playerIsViewer: () => false,
}))

import { WordGroupingPlayerView } from './WordGroupingPlayerView'

const fetchMock = vi.fn()

beforeEach(() => {
  db.submissions = [sub('s1', 0, true), sub('s2', 1, true), sub('s3', 2, true)] // 3 of 4 groups solved
  db.loadCalls = 0
  db.nudgeEnabled = []
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const selectLastGroupAndSubmit = async () => {
  await screen.findByText('d1')
  for (const w of WORDS.slice(12)) fireEvent.click(screen.getByText(w))
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
}

describe('WordGroupingPlayerView — final guess that commits but fails to finish', () => {
  it('starts with the puzzle unfinished: the completion nudge is off', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    render(<WordGroupingPlayerView gameCode="GAME" />)
    await screen.findByText('d1')
    expect(db.nudgeEnabled.at(-1)).toBe(false)
    expect(db.loadCalls).toBe(1)
  })

  it('reloads the submissions after a 5xx so the committed final guess turns the nudge on (realtime event missed)', async () => {
    // The final guess COMMITS server-side, but the request answers 500 and no realtime INSERT is delivered.
    fetchMock.mockImplementation(async () => {
      db.submissions = [...db.submissions, sub('s4', 3, true)]
      return { ok: false, status: 500, json: async () => ({ error: 'Could not finish the game' }) }
    })
    render(<WordGroupingPlayerView gameCode="GAME" />)
    await selectLastGroupAndSubmit()

    await waitFor(() => expect(db.loadCalls).toBe(2)) // the failure path reloaded
    await waitFor(() => expect(db.nudgeEnabled.at(-1)).toBe(true)) // ...so the puzzle is seen as done
    expect(await screen.findByText('Puzzle solved!')).toBeTruthy()
  })

  it('does NOT reload after a 4xx (nothing was committed, so there is nothing to refresh)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Invalid guess' }) })
    render(<WordGroupingPlayerView gameCode="GAME" />)
    await selectLastGroupAndSubmit()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 50))
    expect(db.loadCalls).toBe(1)
    expect(db.nudgeEnabled.at(-1)).toBe(false)
  })
})
