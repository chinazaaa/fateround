import { describe, it, expect, vi } from 'vitest'

// The trophy fact builders read many game tables of their own; the fence under test is the WRITE, so they are
// replaced by controllable stubs (the stall below happens inside `buildGameFacts`, i.e. between read and write).
const facts = vi.hoisted(() => ({ build: vi.fn() }))
vi.mock('@/lib/trophies/game-facts', () => ({
  hasGameFacts: () => true,
  buildGameFacts: facts.build,
}))
vi.mock('@/lib/trophies/outcome', () => ({
  resolveFinishers: async () => [],
  resolveWinners: async () => [],
}))

import { awardRoomGamePoints } from './room-points'
import { recordRoundFacts } from './trophies/round-facts'

type Row = Record<string, unknown>

/**
 * A stateful stand-in for the database. Tables are plain arrays; the query builder supports the handful of
 * shapes the two writers use. `rpc` mirrors the SQL in 20261203400000_finish_bookkeeping_lease_fenced_writes.sql:
 * each call is atomic (JS runs it without yielding), checks `finish_bookkeeping.owner` and writes in the same step.
 * `gate(table)` makes the next read of that table wait on a promise the test controls: that is the stalled step.
 */
function makeDb() {
  const t: Record<string, Row[]> = {
    games: [{ id: 'GAME', game_type: 'custom', status: 'finished', finish_bookkeeping: { owner: 'A' } }],
    room_games: [{ id: 'rg1', room_id: 'ROOM', game_id: 'GAME', points_awarded_at: null }],
    players: [{ id: 'p1', game_id: 'GAME', name: 'Ada', room_member_id: 'm1', spectator: false }],
    room_members: [{ id: 'm1', room_id: 'ROOM', display_name: 'Ada', room_points: 0, games_played: 0 }],
    round_facts: [],
  }
  const gates = new Map<string, Promise<void>>()
  const rpcLog: string[] = []

  const owns = (gameId: string, owner: string | null) => {
    const g = t.games.find((r) => r.id === gameId)
    return !owner || (g?.finish_bookkeeping as { owner?: string } | null)?.owner === owner
  }

  function from(table: string) {
    let op: 'select' | 'update' | 'upsert' = 'select'
    let patch: Row = {}
    let upserts: Row[] = []
    const filters: Array<[string, unknown]> = []
    const run = async () => {
      const gate = gates.get(table)
      if (gate && op === 'select') {
        gates.delete(table)
        await gate
      }
      const rows = t[table].filter((r) => filters.every(([c, v]) => r[c] === v))
      if (op === 'update') {
        rows.forEach((r) => Object.assign(r, patch))
        return { data: null, error: null }
      }
      if (op === 'upsert') {
        for (const u of upserts) {
          const hit = t[table].find(
            (r) => r.game_id === u.game_id && r.player_id === u.player_id && r.finished_at === u.finished_at
          )
          if (hit) Object.assign(hit, u)
          else t[table].push({ ...u })
        }
        return { data: null, error: null }
      }
      return { data: rows.map((r) => ({ ...r })), error: null }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      update: (p: Row) => {
        op = 'update'
        patch = p
        return b
      },
      upsert: (rows: Row[]) => {
        op = 'upsert'
        upserts = rows
        return b
      },
      eq: (c: string, v: unknown) => {
        filters.push([c, v])
        return b
      },
      maybeSingle: async () => {
        const r = await run()
        return { data: (r.data as Row[] | null)?.[0] ?? null, error: null }
      },
      single: async () => b.maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: (res: any, rej: any) => run().then(res, rej),
    }
    return b
  }

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    rpcLog.push(fn)
    if (fn === 'award_room_game_points_fenced') {
      if (!owns(args.p_game_id as string, args.p_owner as string)) return { data: 'not_owner', error: null }
      const rg = t.room_games.find((r) => r.game_id === args.p_game_id)
      if (!rg) return { data: 'no_room_game', error: null }
      if (rg.points_awarded_at) return { data: 'already_awarded', error: null }
      for (const a of args.p_awards as Array<{ member_id: string; points: number }>) {
        const m = t.room_members.find((r) => r.id === a.member_id)!
        m.room_points = (m.room_points as number) + a.points
        m.games_played = (m.games_played as number) + 1
      }
      rg.points_awarded_at = 'now'
      return { data: 'awarded', error: null }
    }
    if (fn === 'upsert_round_facts_fenced') {
      if (!owns(args.p_game_id as string, args.p_owner as string)) return { data: 'not_owner', error: null }
      for (const r of args.p_rows as Array<{ player_id: string; facts: Row }>) {
        const row = { game_id: args.p_game_id, player_id: r.player_id, finished_at: args.p_finished_at, facts: r.facts }
        const hit = t.round_facts.find((x) => x.player_id === r.player_id && x.finished_at === args.p_finished_at)
        if (hit) Object.assign(hit, row)
        else t.round_facts.push(row)
      }
      return { data: 'written', error: null }
    }
    throw new Error(`unexpected rpc ${fn}`)
  }

  const takeOver = (owner: string) => {
    t.games[0].finish_bookkeeping = { owner }
  }
  const stallNextRead = (table: string) => {
    let release!: () => void
    gates.set(table, new Promise<void>((r) => (release = r)))
    return release
  }
  return { client: { from, rpc } as never, t, takeOver, stallNextRead, rpcLog }
}

describe('room points are lease-fenced', () => {
  it('a step that stalls past its lease cannot add the points a second time after a takeover', async () => {
    const db = makeDb()
    // Runner A reads the roster, then stalls (a hung request) before it writes.
    const release = db.stallNextRead('players')
    const stalled = awardRoomGamePoints(db.client, 'GAME', 'A')
    await Promise.resolve()

    // Its lease expires; runner B takes over and completes the award.
    db.takeOver('B')
    expect(await awardRoomGamePoints(db.client, 'GAME', 'B')).toBe('done')
    expect(db.t.room_members[0]).toMatchObject({ room_points: 25, games_played: 1 })

    // A wakes up holding stale reads: its write must be rejected, not applied on top.
    release()
    expect(await stalled).toBe('lost_lease')
    expect(db.t.room_members[0]).toMatchObject({ room_points: 25, games_played: 1 })
  })

  it('still awards exactly once for the current owner, and a repeat is a no-op', async () => {
    const db = makeDb()
    expect(await awardRoomGamePoints(db.client, 'GAME', 'A')).toBe('done')
    expect(await awardRoomGamePoints(db.client, 'GAME', 'A')).toBe('done')
    expect(db.t.room_members[0]).toMatchObject({ room_points: 25, games_played: 1 })
    expect(db.rpcLog).toEqual(['award_room_game_points_fenced'])
  })

  it('a runner whose marker was already cleared (game replayed) is rejected too', async () => {
    const db = makeDb()
    const release = db.stallNextRead('players')
    const stalled = awardRoomGamePoints(db.client, 'GAME', 'A')
    await Promise.resolve()
    db.t.games[0].finish_bookkeeping = null // B completed, Play Again reset the game
    release()
    expect(await stalled).toBe('lost_lease')
    expect(db.t.room_members[0]).toMatchObject({ room_points: 0, games_played: 0 })
  })

  it('without a lease owner the legacy untracked path is unchanged (no RPC)', async () => {
    const db = makeDb()
    expect(await awardRoomGamePoints(db.client, 'GAME')).toBe('done')
    expect(db.rpcLog).toEqual([])
    expect(db.t.room_members[0]).toMatchObject({ room_points: 25, games_played: 1 })
  })
})

describe('trophy round facts are lease-fenced', () => {
  const FINISHED = '2026-01-01T00:00:00.000Z'

  it('a stalled step cannot overwrite the takeover runner’s facts with stale ones', async () => {
    const db = makeDb()
    db.t.games[0].game_type = 'trivia'
    db.t.games[0].timer_seconds = null
    // Runner A derives facts from rows that a replay has since changed, and stalls before writing them.
    let releaseBuild!: () => void
    facts.build.mockImplementationOnce(async () => {
      await new Promise<void>((r) => (releaseBuild = r))
      return new Map([['p1', { stale: 9 }]])
    })
    const stalled = recordRoundFacts(db.client, 'GAME', FINISHED, 'A')
    await vi.waitFor(() => expect(releaseBuild).toBeTypeOf('function'))

    db.takeOver('B')
    facts.build.mockImplementationOnce(async () => new Map([['p1', { good: 1 }]]))
    expect(await recordRoundFacts(db.client, 'GAME', FINISHED, 'B')).toBe('done')
    expect(db.t.round_facts).toHaveLength(1)
    expect(db.t.round_facts[0].facts).toEqual({ good: 1 })

    releaseBuild()
    expect(await stalled).toBe('lost_lease')
    expect(db.t.round_facts[0].facts).toEqual({ good: 1 })
  })

  it('writes for the current owner', async () => {
    const db = makeDb()
    db.t.games[0].game_type = 'trivia'
    facts.build.mockImplementationOnce(async () => new Map([['p1', { good: 1 }]]))
    expect(await recordRoundFacts(db.client, 'GAME', FINISHED, 'A')).toBe('done')
    expect(db.t.round_facts[0]).toMatchObject({ player_id: 'p1', facts: { good: 1 } })
  })
})
