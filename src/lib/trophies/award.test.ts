import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { awardForFinishedGame, levelForPoints } from './award'

/**
 * An in-memory stand-in for the handful of tables the pass touches. Deliberately models the
 * PRIMARY KEY on `awarded_sessions`, because the claim conflict is the control under test —
 * a mock that always accepts the insert would make every idempotency assertion vacuous.
 */
function makeDb(over: Partial<Record<string, unknown[]>> = {}) {
  const tables: Record<string, Record<string, unknown>[]> = {
    games: [{ id: 'ABCD', game_type: 'whot', status: 'finished', max_players: 4, finished_at: '2026-08-02T12:00:00Z' }],
    players: [
      { id: 'pl-1', game_id: 'ABCD', profile_id: 'prof-1', spectator: false },
      { id: 'pl-2', game_id: 'ABCD', profile_id: 'prof-2', spectator: false },
    ],
    whot_sessions: [{ game_id: 'ABCD', winner_player_id: 'pl-1' }],
    profiles: [{ id: 'prof-1', current_streak: 0, longest_streak: 0, last_active_date: null, trophy_points: 0 }],
    player_stats: [],
    player_distinct: [],
    player_trophies: [],
    awarded_sessions: [],
    trophies: [],
    ...(over as Record<string, Record<string, unknown>[]>),
  }

  const client = {
    // The counters moved into Postgres, so the mock has to model the RPCs or the tests would
    // assert nothing about the path that actually runs.
    async rpc(fn: string, args: Record<string, unknown>) {
      const rows = (tables.player_stats ??= [])
      if (fn === 'bump_player_stats') {
        const key = (r: Record<string, unknown>) =>
          r.profile_id === args.p_profile_id && r.game_type === args.p_game_type
        let row = rows.find(key)
        if (!row) {
          row = {
            profile_id: args.p_profile_id,
            game_type: args.p_game_type,
            games_played: 0,
            games_won: 0,
            counters: {},
          }
          rows.push(row)
        }
        row.games_played = (Number(row.games_played) || 0) + (Number(args.p_played) || 0)
        row.games_won = (Number(row.games_won) || 0) + (Number(args.p_won) || 0)
        const merged = { ...((row.counters ?? {}) as Record<string, number>) }
        for (const [k, v] of Object.entries((args.p_counters ?? {}) as Record<string, number>)) {
          merged[k] = (Number(merged[k]) || 0) + Number(v)
        }
        row.counters = merged
        return { data: null, error: null }
      }
      if (fn === 'recompute_profile_points') {
        // Derived, exactly as the SQL does it: sum of what the profile holds.
        const held = (tables.player_trophies ?? []).filter((r) => r.profile_id === args.p_profile_id)
        const total = held.reduce((sum, r) => {
          const t = (tables.trophies ?? []).find((x) => x.id === r.trophy_id)
          return sum + (Number(t?.points) || 0)
        }, 0)
        const profile = (tables.profiles ?? []).find((r) => r.id === args.p_profile_id)
        if (profile) {
          profile.trophy_points = total
          profile.trophy_level = total >= 150 ? 3 : total >= 50 ? 2 : 1
        }
        return { data: total, error: null }
      }
      return { data: null, error: null }
    },
    from(table: string) {
      const rows = (tables[table] ??= [])
      const filters: Array<[string, unknown]> = []
      const current = () => (tables[table] ?? []).filter(match(filters))

      const api = {
        select: () => api,
        eq: (col: string, val: unknown) => {
          filters.push([col, val])
          return api
        },
        maybeSingle: async () => ({ data: current()[0] ?? null, error: null }),
        insert: async (row: Record<string, unknown>) => {
          if (table === 'awarded_sessions') {
            const clash = rows.some((r) => r.profile_id === row.profile_id && r.session_id === row.session_id)
            if (clash) return { data: null, error: { code: '23505' } }
          }
          rows.push({ ...row })
          return { data: null, error: null }
        },
        upsert: async (row: Record<string, unknown> | Record<string, unknown>[]) => {
          for (const r of Array.isArray(row) ? row : [row]) {
            const keys = Object.keys(r).filter((k) => k.endsWith('_id') || k === 'game_type' || k === 'key')
            const existing = rows.find((existingRow) => keys.every((k) => existingRow[k] === r[k]))
            if (existing) Object.assign(existing, r)
            else rows.push({ ...r })
          }
          return { data: null, error: null }
        },
        update: (patch: Record<string, unknown>) => ({
          eq: async (col: string, val: unknown) => {
            filters.push([col, val])
            for (const r of current()) Object.assign(r, patch)
            return { data: null, error: null }
          },
        }),
        delete: () => {
          const chain = {
            eq: (col: string, val: unknown) => {
              filters.push([col, val])
              tables[table] = (tables[table] ?? []).filter((r) => !match(filters)(r))
              return chain
            },
            then: (resolve: (v: unknown) => void) => resolve({ error: null }),
          }
          return chain
        },
        // Lazy: PostgREST resolves the builder to the FILTERED rows, so this must be evaluated
        // when awaited rather than when `from()` was called.
        then: (resolve: (value: { data: unknown; error: null }) => void) => resolve({ data: current(), error: null }),
      }
      return api
    },
  }

  return { client: client as unknown as SupabaseClient, tables }
}

const match = (filters: Array<[string, unknown]>) => (row: Record<string, unknown>) =>
  filters.every(([col, val]) => row[col] === val)

beforeEach(() => vi.restoreAllMocks())

describe('levelForPoints', () => {
  it('starts at level 1 and climbs with points', () => {
    expect(levelForPoints(0)).toBe(1)
    expect(levelForPoints(49)).toBe(1)
    expect(levelForPoints(50)).toBe(2)
    expect(levelForPoints(150)).toBe(3)
  })

  it('is safe on junk', () => {
    expect(levelForPoints(Number.NaN)).toBe(1)
    expect(levelForPoints(-100)).toBe(1)
  })
})

describe('awardForFinishedGame', () => {
  it('records the game, the win and the streak', async () => {
    const { client, tables } = makeDb()
    const result = await awardForFinishedGame(client, 'prof-1', 'ABCD')

    expect(result.applied).toBe(true)
    const global = tables.player_stats.find((r) => r.game_type === '__global__')
    expect(global).toMatchObject({ games_played: 1, games_won: 1 })
    expect(tables.player_stats.find((r) => r.game_type === 'whot')).toMatchObject({ games_played: 1, games_won: 1 })
    expect(tables.profiles[0]).toMatchObject({ current_streak: 1, longest_streak: 1 })
  })

  it('does not award a win to a player who did not win', async () => {
    const { client, tables } = makeDb()
    await awardForFinishedGame(client, 'prof-2', 'ABCD')
    expect(tables.player_stats.find((r) => r.game_type === '__global__')).toMatchObject({
      games_played: 1,
      games_won: 0,
    })
  })

  it('is idempotent — a replayed attribution awards nothing twice', async () => {
    // The client retries attribution on every mount of the finished screen, so this is the
    // normal case, not an edge one.
    const { client, tables } = makeDb()
    await awardForFinishedGame(client, 'prof-1', 'ABCD')
    const second = await awardForFinishedGame(client, 'prof-1', 'ABCD')

    expect(second.applied).toBe(false)
    expect(second.reason).toBe('already_awarded')
    expect(tables.player_stats.find((r) => r.game_type === '__global__')).toMatchObject({ games_played: 1 })
  })

  it('normalises the game code so casing cannot bypass the claim', async () => {
    const { client, tables } = makeDb()
    await awardForFinishedGame(client, 'prof-1', 'ABCD')
    await awardForFinishedGame(client, 'prof-1', 'abcd')
    expect(tables.player_stats.find((r) => r.game_type === '__global__')).toMatchObject({ games_played: 1 })
  })

  it('awards nothing for a spectator', async () => {
    const { client, tables } = makeDb({
      players: [{ id: 'pl-1', game_id: 'ABCD', profile_id: 'prof-1', spectator: true }],
    })
    const result = await awardForFinishedGame(client, 'prof-1', 'ABCD')
    expect(result.reason).toBe('not_a_player')
    expect(tables.player_stats).toHaveLength(0)
  })

  it('releases the claim when it declines, so a later valid attempt still counts', async () => {
    // Otherwise a spectator who later takes a seat could never earn from that game.
    const { client, tables } = makeDb({
      players: [{ id: 'pl-1', game_id: 'ABCD', profile_id: 'prof-1', spectator: true }],
    })
    await awardForFinishedGame(client, 'prof-1', 'ABCD')
    expect(tables.awarded_sessions).toHaveLength(0)
  })

  it('refuses a game that is not finished', async () => {
    const { client } = makeDb({
      games: [{ id: 'ABCD', game_type: 'whot', status: 'active', max_players: 4, finished_at: null }],
    })
    expect((await awardForFinishedGame(client, 'prof-1', 'ABCD')).reason).toBe('game_not_found')
  })

  it('records no win when the server cannot determine one', async () => {
    // A poll game has no winner concept. Recording games_won: 0 is right; recording a LOSS
    // would be too, but silently counting it as measured would let "never lost" trophies leak.
    const { client, tables } = makeDb({
      games: [
        {
          id: 'ABCD',
          game_type: 'never_have_i_ever',
          status: 'finished',
          max_players: 10,
          finished_at: '2026-08-02T12:00:00Z',
        },
      ],
    })
    await awardForFinishedGame(client, 'prof-1', 'ABCD')
    expect(tables.player_stats.find((r) => r.game_type === '__global__')).toMatchObject({
      games_played: 1,
      games_won: 0,
    })
  })

  it('awards a trophy whose criteria the new totals satisfy', async () => {
    const { client, tables } = makeDb({
      trophies: [
        {
          id: 'first_win',
          title: 'First win',
          tier: 'bronze',
          points: 50,
          is_active: true,
          criteria: { type: 'counter', counter: 'games_won', gte: 1 },
        },
      ],
    })
    const result = await awardForFinishedGame(client, 'prof-1', 'ABCD')

    expect(result.earned.map((t) => t.id)).toEqual(['first_win'])
    expect(tables.player_trophies).toHaveLength(1)
    // Points and level are recomputed from the award, never supplied by a caller.
    expect(tables.profiles[0]).toMatchObject({ trophy_points: 50, trophy_level: 2 })
  })

  it('does not award a trophy whose threshold is not met', async () => {
    const { client } = makeDb({
      trophies: [
        {
          id: 'ten_wins',
          title: 'Ten wins',
          tier: 'gold',
          points: 200,
          is_active: true,
          criteria: { type: 'counter', counter: 'games_won', gte: 10 },
        },
      ],
    })
    expect((await awardForFinishedGame(client, 'prof-1', 'ABCD')).earned).toEqual([])
  })

  it('skips a malformed catalog row without losing the rest', async () => {
    // Criteria is admin-authored. One bad row must not cost everyone else their trophies.
    const { client } = makeDb({
      trophies: [
        { id: 'broken', title: 'Broken', tier: 'bronze', points: 10, is_active: true, criteria: { type: 'nonsense' } },
        {
          id: 'ok',
          title: 'Played one',
          tier: 'bronze',
          points: 20,
          is_active: true,
          criteria: { type: 'counter', counter: 'games_played', gte: 1 },
        },
      ],
    })
    const result = await awardForFinishedGame(client, 'prof-1', 'ABCD')
    expect(result.earned.map((t) => t.id)).toEqual(['ok'])
  })
})

describe('awardForFinishedGame — a win needs an opponent', () => {
  it('does not record a win for a solo game', async () => {
    // Yahtzee and Sudoku allow one player and still write winner_player_id. Counting that as a
    // win would make every Champion track farmable alone.
    const db = makeDb({
      games: [{ id: 'SOLO01', status: 'finished', game_type: 'yahtzee', finished_at: '2026-08-02T12:00:00Z' }],
      players: [{ id: 'p1', game_id: 'SOLO01', profile_id: 'prof-1', spectator: false }],
      yahtzee_sessions: [{ game_id: 'SOLO01', winner_player_id: 'p1' }],
      profiles: [{ id: 'prof-1', current_streak: 0, longest_streak: 0, last_active_date: null, trophy_points: 0 }],
      trophies: [],
      player_trophies: [],
      player_stats: [],
      awarded_sessions: [],
      player_distinct: [],
    })

    await awardForFinishedGame(db.client as never, 'prof-1', 'SOLO01')

    const stats = db.tables.player_stats.find((r) => r.game_type === 'yahtzee')
    expect(stats?.games_played).toBe(1)
    expect(stats?.games_won).toBe(0)
  })
})

describe('awardForFinishedGame — every round in a room awards', () => {
  it('awards again after play again reuses the same game code', async () => {
    // "Play again" UPDATEs the same games row, so a room plays many rounds under one code.
    // The claim used to be keyed on the code alone, which meant round 2 onwards silently
    // awarded nothing — a room that played all evening recorded one game.
    const db = makeDb({
      games: [{ id: 'ROOM01', status: 'finished', game_type: 'trivia', finished_at: '2026-08-02T12:00:00Z' }],
      players: [
        { id: 'p1', game_id: 'ROOM01', profile_id: 'prof-1', spectator: false },
        { id: 'p2', game_id: 'ROOM01', profile_id: 'prof-2', spectator: false },
      ],
      profiles: [{ id: 'prof-1', current_streak: 0, longest_streak: 0, last_active_date: null, trophy_points: 0 }],
      trophies: [],
      player_trophies: [],
      player_stats: [],
      awarded_sessions: [],
      player_distinct: [],
      trivia_answers: [],
      rounds: [],
    })

    await awardForFinishedGame(db.client as never, 'prof-1', 'ROOM01')
    expect(db.tables.player_stats.find((r) => r.game_type === 'trivia')?.games_played).toBe(1)

    // A retry of the SAME round must still be a no-op.
    await awardForFinishedGame(db.client as never, 'prof-1', 'ROOM01')
    expect(db.tables.player_stats.find((r) => r.game_type === 'trivia')?.games_played).toBe(1)

    // Play again: same row, new finish.
    db.tables.games[0].finished_at = '2026-08-02T13:30:00Z'
    await awardForFinishedGame(db.client as never, 'prof-1', 'ROOM01')
    expect(db.tables.player_stats.find((r) => r.game_type === 'trivia')?.games_played).toBe(2)
  })
})

describe('awardForFinishedGame — the card-game winner is flagged spectator but still earns', () => {
  it('attributes the winner who went out (finish_order rescue)', async () => {
    // Whot/UNO/Crazy Eights flip a player to spectator=true the moment they empty their hand —
    // winner included. Without the finish_order rescue the winner earns nothing at all.
    const db = makeDb({
      games: [{ id: 'WHOT01', status: 'finished', game_type: 'whot', finished_at: '2026-08-02T12:00:00Z' }],
      players: [
        { id: 'winner', game_id: 'WHOT01', profile_id: 'prof-1', spectator: true }, // went out -> spectator
        { id: 'loser', game_id: 'WHOT01', profile_id: 'prof-2', spectator: false },
      ],
      whot_sessions: [{ game_id: 'WHOT01', winner_player_id: 'winner', finish_order: ['winner'] }],
      profiles: [{ id: 'prof-1', current_streak: 0, longest_streak: 0, last_active_date: null, trophy_points: 0 }],
      trophies: [],
      player_trophies: [],
      player_stats: [],
      awarded_sessions: [],
      player_distinct: [],
    })

    await awardForFinishedGame(db.client as never, 'prof-1', 'WHOT01')

    const stats = db.tables.player_stats.find((r) => r.game_type === 'whot')
    expect(stats?.games_played).toBe(1)
    expect(stats?.games_won).toBe(1)
  })
})
