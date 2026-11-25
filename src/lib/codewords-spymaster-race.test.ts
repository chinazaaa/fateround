import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { makeSupabaseStub } from '@/test-support/host-auth'
import {
  persistRandomizedRoles,
  finishCodewordsGame,
  finishDecidedCodewordsGame,
  reconcileCodewordsAllTeams,
  reconcileCodewordsTeamAfterRemoval,
  repairBrokenCodewordsRoster,
} from './codewords'

vi.mock('server-only', () => ({}))

const UNIQUE = { code: '23505', message: 'duplicate key value violates unique constraint' }

type RoleRow = { player_id: string; team: 'red' | 'blue'; role: 'spymaster' | 'operative' }

type BoardState = { id: string; winner: string | null }

/** Stateful codewords_boards: an update only lands on the named board while it is undecided. */
function boardResolver(board: BoardState, beforeUpdate?: (b: BoardState) => void) {
  return ({ op, filters, payload }: { op: string; filters: Record<string, unknown>; payload: unknown }) => {
    if (op !== 'update') return { data: { id: board.id, winner: board.winner }, error: null }
    beforeUpdate?.(board)
    if (('id' in filters && filters.id !== board.id) || board.winner !== null) return { data: [], error: null }
    board.winner = (payload as { winner: string }).winner
    return { data: [{ id: board.id }], error: null }
  }
}

/**
 * Stateful stand-in for codewords_player_roles: reads and updates honour the `team` / `role` /
 * `player_id` filters, and a promotion is rejected with the unique-index error when the team
 * already holds a spymaster (what the one-spymaster-per-team partial index does).
 * `beforeUpdate` runs right before the nth promotion write, to interleave another request.
 */
function rolesDb(
  initial: RoleRow[],
  hooks: {
    beforeUpdate?: (rows: RoleRow[], n: number, targetId: string) => void
    rejectPromotion?: () => boolean
    beforeBoardUpdate?: (b: BoardState) => void
  } = {}
) {
  const board: BoardState = { id: 'b1', winner: null }
  const gamesUpdates: unknown[] = []
  const rows: RoleRow[] = initial.map((r) => ({ ...r }))
  let updates = 0
  const filtered = (filters: Record<string, unknown>) =>
    rows.filter((r) =>
      Object.entries(filters).every(([k, v]) => k === 'game_id' || (r as Record<string, unknown>)[k] === v)
    )
  const supabase = makeSupabaseStub({
    codewords_boards: boardResolver(board, hooks.beforeBoardUpdate),
    games: ({ op, payload }) => {
      if (op === 'update') gamesUpdates.push(payload)
      return { data: null, error: null }
    },
    codewords_player_roles: ({ op, filters, payload }) => {
      if (op !== 'update') return { data: filtered(filters).map((r) => ({ ...r })), error: null }
      updates += 1
      hooks.beforeUpdate?.(rows, updates, String(filters.player_id))
      if (hooks.rejectPromotion?.()) return { data: null, error: UNIQUE }
      const live = filtered(filters)
      if (live.length === 0) return { data: [], error: null }
      const patch = payload as Partial<RoleRow>
      if (
        patch.role === 'spymaster' &&
        live.some((r) => rows.some((x) => x.team === r.team && x.role === 'spymaster'))
      ) {
        return { data: null, error: UNIQUE }
      }
      for (const r of live) Object.assign(r, patch)
      return { data: live.map((r) => ({ player_id: r.player_id })), error: null }
    },
  }) as unknown as SupabaseClient
  return { supabase, rows, board, gamesUpdates, updateCount: () => updates }
}

describe('reconcileCodewordsTeamAfterRemoval — lost promotion race', () => {
  const redOps: RoleRow[] = [
    { player_id: 'op-1', team: 'red', role: 'operative' },
    { player_id: 'op-2', team: 'red', role: 'operative' },
  ]
  const redSpies = (rows: RoleRow[]) => rows.filter((r) => r.team === 'red' && r.role === 'spymaster')

  it('promotes an operative when the seat is really empty', async () => {
    const { supabase, rows } = rolesDb(redOps)
    const result = await reconcileCodewordsTeamAfterRemoval(supabase, 'ABCD', 'red')
    expect(result.error).toBeNull()
    expect(result.outcome.promotedPlayerId).toMatch(/^op-/)
    expect(redSpies(rows)).toHaveLength(1)
  })

  it('treats a unique-index rejection as a filled seat once the re-read shows the spymaster', async () => {
    // Someone else fills the seat between our read and our write; the index rejects ours.
    const { supabase, rows } = rolesDb(redOps, {
      beforeUpdate: (r, n) => {
        if (n === 1) r[1].role = 'spymaster'
      },
    })
    const result = await reconcileCodewordsTeamAfterRemoval(supabase, 'ABCD', 'red')
    expect(result.error).toBeNull()
    expect(result.outcome).toEqual({ ended: false })
    expect(redSpies(rows)).toHaveLength(1)
  })

  it("re-reads and fills red's seat when the chosen operative moved to blue (which has a spymaster)", async () => {
    // Unbound, the promotion would hit blue's one-spymaster index, be swallowed as "seat filled"
    // and leave red with no spymaster. Bound to red/operative it matches nothing and is retried.
    const { supabase, rows } = rolesDb(
      [
        { player_id: 'blue-spy', team: 'blue', role: 'spymaster' },
        { player_id: 'op-1', team: 'red', role: 'operative' },
        { player_id: 'op-2', team: 'red', role: 'operative' },
        { player_id: 'op-3', team: 'red', role: 'operative' },
      ],
      {
        beforeUpdate: (r, n, targetId) => {
          // The operative about to be promoted moves to blue between the roster read and the write.
          if (n === 1) r.find((x) => x.player_id === targetId)!.team = 'blue'
        },
      }
    )
    const result = await reconcileCodewordsTeamAfterRemoval(supabase, 'ABCD', 'red')
    expect(result.error).toBeNull()
    expect(result.outcome.promotedPlayerId).toMatch(/^op-/)
    expect(redSpies(rows)).toHaveLength(1)
    expect(rows.filter((r) => r.team === 'blue' && r.role === 'spymaster')).toHaveLength(1)
  })

  it('does not promote a player who moved teams after the roster was read, and retries', async () => {
    const { supabase, rows } = rolesDb(redOps, {
      beforeUpdate: (r, n) => {
        // Both operatives step over to blue before the first write lands, then one comes back.
        if (n === 1) for (const x of r) x.team = 'blue'
        if (n === 2) r[0].team = 'red'
      },
    })
    const result = await reconcileCodewordsTeamAfterRemoval(supabase, 'ABCD', 'red')
    // Red's only remaining operative is alone, so the round ends by forfeit rather than
    // reporting success with an empty seat. Nobody on blue was promoted in red's name.
    expect(result.error).toBeNull()
    expect(result.outcome.ended).toBe(true)
    expect(rows.filter((r) => r.role === 'spymaster')).toHaveLength(0)
  })

  it('forfeits on the re-read when only the selected operative moved, leaving exactly one red operative', async () => {
    const { supabase, rows } = rolesDb(redOps, {
      beforeUpdate: (r, n, targetId) => {
        // Only the operative about to be promoted steps over to blue before the write lands.
        if (n === 1) r.find((x) => x.player_id === targetId)!.team = 'blue'
      },
    })
    const result = await reconcileCodewordsTeamAfterRemoval(supabase, 'ABCD', 'red')
    // The stale write matched nothing; the re-read sees one lone red operative, which cannot be
    // promoted without leaving nobody to guess, so the team forfeits.
    expect(result.error).toBeNull()
    expect(result.outcome).toMatchObject({ ended: true, forfeitWinner: 'blue' })
    expect(rows.filter((r) => r.team === 'red' && r.role === 'operative')).toHaveLength(1)
    expect(rows.filter((r) => r.role === 'spymaster')).toHaveLength(0)
  })

  it('still reports other promotion errors', async () => {
    const supabase = makeSupabaseStub({
      codewords_boards: boardResolver({ id: 'b1', winner: null }),
      codewords_player_roles: ({ op }) =>
        op === 'update' ? { data: null, error: { code: '23503', message: 'fk' } } : { data: redOps, error: null },
    }) as unknown as SupabaseClient
    const result = await reconcileCodewordsTeamAfterRemoval(supabase, 'ABCD', 'red')
    expect(result.error).not.toBeNull()
  })

  it('gives up with a retryable error when the seat keeps being contested', async () => {
    const supabase = makeSupabaseStub({
      codewords_boards: boardResolver({ id: 'b1', winner: null }),
      codewords_player_roles: ({ op }) =>
        op === 'update' ? { data: null, error: UNIQUE } : { data: redOps, error: null },
    }) as unknown as SupabaseClient
    const result = await reconcileCodewordsTeamAfterRemoval(supabase, 'ABCD', 'red')
    expect(result.error).toMatch(/try again/)
    expect(result.outcome).toEqual({ ended: false })
  })
})

describe('persistRandomizedRoles — host replaced a spymaster mid-shuffle', () => {
  const roles = [
    { player_id: 'red-spy', team: 'red' as const, role: 'spymaster' as const },
    { player_id: 'blue-spy', team: 'blue' as const, role: 'spymaster' as const },
    { player_id: 'p3', team: 'red' as const, role: 'operative' as const },
    { player_id: 'p4', team: 'blue' as const, role: 'operative' as const },
  ]
  const playerIds = roles.map((r) => r.player_id)

  it('returns a retryable conflict instead of a server error', async () => {
    const supabase = makeSupabaseStub({
      codewords_player_roles: ({ op, payload }) =>
        op === 'upsert' && (payload as { player_id: string }).player_id === 'red-spy'
          ? { data: null, error: UNIQUE }
          : { data: null, error: null },
    }) as unknown as SupabaseClient
    const result = await persistRandomizedRoles(supabase, 'ABCD', playerIds, roles)
    expect(result.conflict).toBe(true)
    expect(result.error).toBe('Team roles changed while shuffling — try again')
  })

  it('keeps other write failures as plain errors', async () => {
    const supabase = makeSupabaseStub({
      codewords_player_roles: () => ({ data: null, error: { code: '08006', message: 'down' } }),
    }) as unknown as SupabaseClient
    const result = await persistRandomizedRoles(supabase, 'ABCD', playerIds, roles)
    expect(result.conflict).toBeUndefined()
    expect(result.error).not.toBeNull()
  })

  it('succeeds with no error when every upsert lands', async () => {
    const supabase = makeSupabaseStub({
      codewords_player_roles: () => ({ data: null, error: null }),
    }) as unknown as SupabaseClient
    const result = await persistRandomizedRoles(supabase, 'ABCD', playerIds, roles)
    expect(result.error).toBeNull()
    expect(result.conflict).toBeUndefined()
  })
})

describe('reconcileCodewordsAllTeams — repeat after reconciliation gave up', () => {
  it('fills a team left without a spymaster although no departed player is named', async () => {
    const { supabase, rows } = rolesDb([
      { player_id: 'r1', team: 'red', role: 'operative' },
      { player_id: 'r2', team: 'red', role: 'operative' },
      { player_id: 'b-spy', team: 'blue', role: 'spymaster' },
      { player_id: 'b1', team: 'blue', role: 'operative' },
    ])
    // The one-team call with no team (what a repeat request can supply) does nothing...
    expect((await reconcileCodewordsTeamAfterRemoval(supabase, 'ABCD', null)).outcome).toEqual({ ended: false })
    expect(rows.filter((r) => r.team === 'red' && r.role === 'spymaster')).toHaveLength(0)
    // ...the all-teams repair fixes red and leaves the healthy blue team alone.
    const result = await reconcileCodewordsAllTeams(supabase, 'ABCD')
    expect(result.error).toBeNull()
    expect(result.outcome.promotedPlayerId).toMatch(/^r/)
    expect(rows.filter((r) => r.team === 'red' && r.role === 'spymaster')).toHaveLength(1)
    expect(rows.filter((r) => r.team === 'blue' && r.role === 'spymaster')).toHaveLength(1)
  })

  it('forfeits a team down to one operative with no spymaster', async () => {
    const { supabase } = rolesDb([
      { player_id: 'r1', team: 'red', role: 'operative' },
      { player_id: 'b-spy', team: 'blue', role: 'spymaster' },
      { player_id: 'b1', team: 'blue', role: 'operative' },
    ])
    const result = await reconcileCodewordsAllTeams(supabase, 'ABCD')
    expect(result.outcome).toMatchObject({ ended: true, forfeitWinner: 'blue' })
  })

  it('is a no-op for a healthy roster', async () => {
    const { supabase } = rolesDb([
      { player_id: 'r-spy', team: 'red', role: 'spymaster' },
      { player_id: 'r1', team: 'red', role: 'operative' },
      { player_id: 'b-spy', team: 'blue', role: 'spymaster' },
      { player_id: 'b1', team: 'blue', role: 'operative' },
    ])
    expect(await reconcileCodewordsAllTeams(supabase, 'ABCD')).toEqual({ error: null, outcome: { ended: false } })
  })
})

describe('repairBrokenCodewordsRoster — recovery that needs no repeat request', () => {
  const spies = (rows: RoleRow[], team: 'red' | 'blue') => rows.filter((r) => r.team === team && r.role === 'spymaster')

  it('heals a removal whose own reconciliation gave up', async () => {
    // The red spymaster was removed; every promotion attempt of the removal lost the seat race.
    let contested = true
    const { supabase, rows } = rolesDb(
      [
        { player_id: 'r1', team: 'red', role: 'operative' },
        { player_id: 'r2', team: 'red', role: 'operative' },
        { player_id: 'b-spy', team: 'blue', role: 'spymaster' },
        { player_id: 'b1', team: 'blue', role: 'operative' },
      ],
      { rejectPromotion: () => contested }
    )
    const first = await reconcileCodewordsTeamAfterRemoval(supabase, 'ABCD', 'red')
    expect(first.error).toMatch(/try again/)
    expect(spies(rows, 'red')).toHaveLength(0)

    // Contention is over; any participant's board read (no player id, no token of the removed
    // player) repairs the team.
    contested = false
    expect(await repairBrokenCodewordsRoster(supabase, 'ABCD')).toBe(true)
    expect(spies(rows, 'red')).toHaveLength(1)
    expect(spies(rows, 'blue')).toHaveLength(1)
  })

  it('heals a bench whose reconciliation gave up (the benched player has no role row any more)', async () => {
    let contested = true
    const { supabase, rows } = rolesDb(
      [
        { player_id: 'r-spy', team: 'red', role: 'spymaster' },
        { player_id: 'r1', team: 'red', role: 'operative' },
        // blue's spymaster was benched: their role row is gone, two operatives remain
        { player_id: 'b1', team: 'blue', role: 'operative' },
        { player_id: 'b2', team: 'blue', role: 'operative' },
      ],
      { rejectPromotion: () => contested }
    )
    expect((await reconcileCodewordsTeamAfterRemoval(supabase, 'ABCD', 'blue')).error).toMatch(/try again/)
    contested = false
    expect(await repairBrokenCodewordsRoster(supabase, 'ABCD')).toBe(true)
    expect(spies(rows, 'blue')).toHaveLength(1)
    expect(spies(rows, 'red')).toHaveLength(1)
  })

  it('forfeits a team left with one operative and no spymaster', async () => {
    const { supabase } = rolesDb([
      { player_id: 'r1', team: 'red', role: 'operative' },
      { player_id: 'b-spy', team: 'blue', role: 'spymaster' },
      { player_id: 'b1', team: 'blue', role: 'operative' },
    ])
    expect(await repairBrokenCodewordsRoster(supabase, 'ABCD')).toBe(true)
  })

  it('does not touch a healthy roster or a reset state with no roles at all', async () => {
    const healthy = rolesDb([
      { player_id: 'r-spy', team: 'red', role: 'spymaster' },
      { player_id: 'r1', team: 'red', role: 'operative' },
      { player_id: 'b-spy', team: 'blue', role: 'spymaster' },
      { player_id: 'b1', team: 'blue', role: 'operative' },
    ])
    expect(await repairBrokenCodewordsRoster(healthy.supabase, 'ABCD')).toBe(false)
    expect(healthy.updateCount()).toBe(0)
    expect(await repairBrokenCodewordsRoster(rolesDb([]).supabase, 'ABCD')).toBe(false)
  })

  it('forfeits an emptied team to the team that still has players', async () => {
    const { supabase } = rolesDb([
      { player_id: 'b-spy', team: 'blue', role: 'spymaster' },
      { player_id: 'b1', team: 'blue', role: 'operative' },
    ])
    expect(await repairBrokenCodewordsRoster(supabase, 'ABCD')).toBe(true)
  })

  it('repairs after two concurrent removals each failed before settling the board', async () => {
    // The last red player and the red spymaster of a 2-player red team were removed together:
    // both reconciliations lost to storage errors, leaving red with no rows and no winner.
    const calls: string[] = []
    const failing = makeSupabaseStub({
      codewords_boards: ({ op, payload }) => {
        calls.push(op)
        if (op === 'update') return { data: null, error: { code: '08006', message: 'down' } }
        return { data: { id: 'b1', winner: (payload as { winner?: string } | undefined)?.winner ?? null }, error: null }
      },
      codewords_player_roles: () => ({ data: [], error: null }),
    }) as unknown as SupabaseClient
    expect((await reconcileCodewordsTeamAfterRemoval(failing, 'ABCD', 'red')).error).not.toBeNull()

    // Storage is back; a later board read, with only blue's rows left, forfeits red.
    const { supabase } = rolesDb([
      { player_id: 'b-spy', team: 'blue', role: 'spymaster' },
      { player_id: 'b1', team: 'blue', role: 'operative' },
    ])
    expect(await repairBrokenCodewordsRoster(supabase, 'ABCD')).toBe(true)
  })
})

describe('forfeit write is bound to the observed board', () => {
  it('leaves a board started after the read untouched and does not finish its game', async () => {
    const { supabase, board, gamesUpdates } = rolesDb(
      [
        { player_id: 'b-spy', team: 'blue', role: 'spymaster' },
        { player_id: 'b1', team: 'blue', role: 'operative' },
      ],
      {
        // The host resets and restarts between the board read and the forfeit write.
        beforeBoardUpdate: (b) => {
          b.id = 'b2'
        },
      }
    )
    const result = await reconcileCodewordsTeamAfterRemoval(supabase, 'ABCD', 'red')
    expect(result).toEqual({ error: null, outcome: { ended: false } })
    expect(board.winner).toBeNull()
    expect(gamesUpdates).toHaveLength(0)
  })

  it('still forfeits when the observed board is unchanged', async () => {
    const { supabase, board, gamesUpdates } = rolesDb([{ player_id: 'b-spy', team: 'blue', role: 'spymaster' }])
    const result = await reconcileCodewordsTeamAfterRemoval(supabase, 'ABCD', 'red')
    expect(result.outcome).toMatchObject({ ended: true, forfeitWinner: 'blue' })
    expect(board.winner).toBe('blue')
    expect(gamesUpdates).toHaveLength(1)
  })
})

describe('finishDecidedCodewordsGame — a decided board whose game is still active', () => {
  function db(opts: {
    status?: string
    winner?: string | null
    gameError?: boolean
    sessionStartedAt?: string | null
    flipMatches?: boolean
  }) {
    const gameUpdates: Array<{ patch: unknown; calls: readonly { method: string; args: readonly unknown[] }[] }> = []
    const supabase = makeSupabaseStub({
      games: ({ op, payload, filterCalls }) => {
        if (op === 'update') {
          gameUpdates.push({ patch: payload, calls: filterCalls })
          return {
            data: opts.flipMatches === false ? [] : [{ id: 'ABCD' }],
            error: opts.gameError ? { message: 'down' } : null,
          }
        }
        return {
          data: { status: opts.status ?? 'active', session_started_at: opts.sessionStartedAt ?? 'S1' },
          error: null,
        }
      },
      codewords_boards: () => ({
        data: { id: 'b1', winner: opts.winner === undefined ? 'red' : opts.winner },
        error: null,
      }),
      codewords_messages: () => ({ data: null, error: null }),
    }) as unknown as SupabaseClient
    return { supabase, gameUpdates }
  }

  it('finishes the game, bound to the observed session', async () => {
    const { supabase, gameUpdates } = db({})
    expect(await finishDecidedCodewordsGame(supabase, 'abcd')).toEqual({ error: null, finished: true })
    expect(gameUpdates).toHaveLength(1)
    expect(gameUpdates[0].calls).toContainEqual({ method: 'eq', args: ['status', 'active'] })
    expect(gameUpdates[0].calls).toContainEqual({ method: 'eq', args: ['session_started_at', 'S1'] })
  })

  it('is a no-op for an already finished game, an undecided board, or a lost compare-and-set', async () => {
    const done = db({ status: 'finished' })
    expect(await finishDecidedCodewordsGame(done.supabase, 'ABCD')).toEqual({ error: null, finished: false })
    expect(done.gameUpdates).toHaveLength(0)
    const live = db({ winner: null })
    expect(await finishDecidedCodewordsGame(live.supabase, 'ABCD')).toEqual({ error: null, finished: false })
    expect(live.gameUpdates).toHaveLength(0)
    const lost = db({ flipMatches: false })
    expect(await finishDecidedCodewordsGame(lost.supabase, 'ABCD')).toEqual({ error: null, finished: false })
  })

  it('surfaces a failed finish', async () => {
    const { supabase } = db({ gameError: true })
    const result = await finishDecidedCodewordsGame(supabase, 'ABCD')
    expect(result.error).not.toBeNull()
    expect(result.finished).toBe(false)
  })

  it('is what reconciliation does for a decided board, and surfaces its failure', async () => {
    const ok = db({})
    expect(await reconcileCodewordsTeamAfterRemoval(ok.supabase, 'ABCD', 'red')).toEqual({
      error: null,
      outcome: { ended: false },
    })
    expect(ok.gameUpdates).toHaveLength(1)
    const bad = db({ gameError: true })
    expect((await reconcileCodewordsTeamAfterRemoval(bad.supabase, 'ABCD', 'red')).error).not.toBeNull()
  })
})

describe('forfeit finish is single-winner', () => {
  it('reports the forfeit and awards nothing twice when a board read already finished the game', async () => {
    const gameUpdates: Array<readonly { method: string; args: readonly unknown[] }[]> = []
    const supabase = makeSupabaseStub({
      games: ({ op, filterCalls }) => {
        if (op === 'update') {
          gameUpdates.push(filterCalls)
          return { data: [], error: null } // lost: finishDecidedCodewordsGame flipped it first
        }
        return {
          data: { status: 'finished', session_started_at: 'S1', finished_at: '2026-01-01T00:00:00.000Z' },
          error: null,
        }
      },
      codewords_boards: boardResolver({ id: 'b1', winner: null }),
      codewords_player_roles: () => ({ data: [], error: null }),
      codewords_messages: () => ({ data: null, error: null }),
    }) as unknown as SupabaseClient
    const result = await reconcileCodewordsTeamAfterRemoval(supabase, 'ABCD', 'red')
    expect(result).toEqual({ error: null, outcome: { ended: true, forfeitWinner: 'blue' } })
    expect(gameUpdates).toHaveLength(1)
    expect(gameUpdates[0]).toContainEqual({ method: 'eq', args: ['status', 'active'] })
    expect(gameUpdates[0]).toContainEqual({ method: 'eq', args: ['session_started_at', 'S1'] })
  })
})

describe("session-bound finish never wipes a newer session's chat", () => {
  function chatDb(opts: { flipWins: boolean; current?: Record<string, unknown> }) {
    const deletes: Array<readonly { method: string; args: readonly unknown[] }[]> = []
    const supabase = makeSupabaseStub({
      games: ({ op }) =>
        op === 'update'
          ? { data: opts.flipWins ? [{ id: 'ABCD' }] : [], error: null }
          : { data: opts.current ?? null, error: null },
      codewords_messages: ({ op, filterCalls }) => {
        if (op === 'delete') deletes.push(filterCalls)
        return { data: null, error: null }
      },
    }) as unknown as SupabaseClient
    return { supabase, deletes }
  }
  const finished = { status: 'finished', session_started_at: 'S1', finished_at: '2026-01-01T00:00:00.000Z' }

  it('a winning flip wipes only messages up to its own finish time', async () => {
    const { supabase, deletes } = chatDb({ flipWins: true })
    await finishCodewordsGame(supabase, 'ABCD', { onlyIfActive: true, onlySessionStartedAt: 'S1' })
    expect(deletes).toHaveLength(1)
    expect(deletes[0].some((c) => c.method === 'lte' && c.args[0] === 'created_at')).toBe(true)
  })

  it('a lost flip still retries the wipe for the same finished session, up to its finish time', async () => {
    const { supabase, deletes } = chatDb({ flipWins: false, current: finished })
    await finishCodewordsGame(supabase, 'ABCD', { onlyIfActive: true, onlySessionStartedAt: 'S1' })
    expect(deletes).toHaveLength(1)
    expect(deletes[0]).toContainEqual({ method: 'lte', args: ['created_at', '2026-01-01T00:00:00.000Z'] })
  })

  it('a lost flip does not wipe when the game now belongs to a newer session', async () => {
    const newer = chatDb({ flipWins: false, current: { ...finished, session_started_at: 'S2', status: 'active' } })
    await finishCodewordsGame(newer.supabase, 'ABCD', { onlyIfActive: true, onlySessionStartedAt: 'S1' })
    expect(newer.deletes).toHaveLength(0)
    const finishedNewer = chatDb({ flipWins: false, current: { ...finished, session_started_at: 'S2' } })
    await finishCodewordsGame(finishedNewer.supabase, 'ABCD', { onlyIfActive: true, onlySessionStartedAt: 'S1' })
    expect(finishedNewer.deletes).toHaveLength(0)
  })

  it('a host/admin finish (no session binding) wipes the chat of the session it ended, never more', async () => {
    const { supabase, deletes } = chatDb({ flipWins: true })
    await finishCodewordsGame(supabase, 'ABCD')
    expect(deletes).toHaveLength(1)
    // An unbounded wipe would also delete a replayed session's chat when this call is delayed.
    expect(deletes[0].some((c) => c.method === 'lte')).toBe(true)
  })

  it('the winning-finish wipe is created_at <= the exact finished_at written to games, and a later row survives', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-03-03T03:03:03.000Z'))
      let written: string | undefined
      const chat = [
        { id: 'during', created_at: '2026-03-03T03:03:02.000Z' },
        { id: 'at', created_at: '2026-03-03T03:03:03.000Z' },
        { id: 'replayed', created_at: '2026-03-03T03:03:04.000Z' },
      ]
      let remaining = chat
      const supabase = makeSupabaseStub({
        games: ({ op, payload }) => {
          if (op === 'update') {
            written = (payload as { finished_at: string }).finished_at
            return { data: [{ id: 'ABCD' }], error: null }
          }
          return { data: null, error: null }
        },
        codewords_messages: ({ op, filterCalls }) => {
          if (op === 'delete') {
            const bound = filterCalls.find((c) => c.method === 'lte' && c.args[0] === 'created_at')
            expect(bound?.args[1]).toBe(written)
            remaining = remaining.filter((r) => r.created_at > (bound?.args[1] as string))
          }
          return { data: null, error: null }
        },
      }) as unknown as SupabaseClient
      await finishCodewordsGame(supabase, 'ABCD', { onlyIfActive: true, onlySessionStartedAt: 'S1' })
      expect(written).toBe('2026-03-03T03:03:03.000Z')
      expect(remaining.map((r) => r.id)).toEqual(['replayed'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('a lost onlyIfActive finish (no session named) wipes only a game that really is finished, up to that finished_at', async () => {
    const done = chatDb({ flipWins: false, current: finished })
    await finishCodewordsGame(done.supabase, 'ABCD', { onlyIfActive: true })
    expect(done.deletes).toHaveLength(1)
    expect(done.deletes[0]).toContainEqual({ method: 'lte', args: ['created_at', '2026-01-01T00:00:00.000Z'] })

    const live = chatDb({ flipWins: false, current: { ...finished, status: 'active', finished_at: null } })
    await finishCodewordsGame(live.supabase, 'ABCD', { onlyIfActive: true })
    expect(live.deletes).toHaveLength(0)
  })
})

describe('reconcile retries stay on the observed round', () => {
  it('stops instead of promoting in a lobby the host reopened between attempts', async () => {
    const reds: RoleRow[] = [
      { player_id: 'op-1', team: 'red', role: 'operative' },
      { player_id: 'op-2', team: 'red', role: 'operative' },
    ]
    const { supabase, rows } = rolesDb(reds, {
      beforeUpdate: (_r, n) => {
        // First promotion loses (zero rows); the game is replayed before the retry.
        if (n === 1) rows.forEach((x) => (x.team = 'blue'))
      },
      beforeBoardUpdate: undefined,
    })
    // After the first attempt the board is gone (Play Again deleted it): the retry must not write.
    let boardReads = 0
    const wrapped = new Proxy(supabase, {
      get(target, prop, recv) {
        if (prop !== 'from') return Reflect.get(target, prop, recv)
        return (table: string) => {
          if (table === 'codewords_boards') {
            boardReads += 1
            if (boardReads > 1) {
              const chain: Record<string, unknown> = {}
              for (const m of ['select', 'eq']) chain[m] = () => chain
              chain.maybeSingle = async () => ({ data: null, error: null })
              return chain
            }
          }
          return (target as unknown as { from: (t: string) => unknown }).from(table)
        }
      },
    }) as unknown as SupabaseClient
    const result = await reconcileCodewordsTeamAfterRemoval(wrapped, 'ABCD', 'red')
    expect(result).toEqual({ error: null, outcome: { ended: false } })
    expect(rows.filter((r) => r.role === 'spymaster')).toHaveLength(0)
  })
})
