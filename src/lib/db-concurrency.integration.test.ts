/**
 * The four database functions that make a game transition atomic, exercised by CONCURRENT callers
 * against a real Postgres:
 *
 *   - word_grouping_submit       (20261201160000)
 *   - pick_a_number_submit       (20261201130000)
 *   - mahjong_apply_transition   (20261201140000)
 *   - rummy_apply_transition     (20261201150000)
 *   - bingo_claim_win            (20261202700000)
 *   - matching_pairs_record_flip_checked (20261202900000)
 *   - submit_vote_atomic         (20261203100000)
 *
 * Each replaced route code that read, decided, then wrote across several requests, and lost races:
 * simultaneous wrong guesses all passed a limit check, two picks clobbered each other's question,
 * a session compare-and-swap landed while its player-state writes failed. The route unit tests mock
 * the database, so they cannot see any of that -- they would pass with the advisory lock, the row
 * lock or the transaction removed. This suite sends the calls through PostgREST at the same time,
 * on separate database connections, and asserts the outcome that only holds if the function really
 * serialises: exactly one winner, exactly the allowed number admitted, nothing half-written.
 *
 * It WRITES and DELETES rows, so it refuses to run against anything but a local stack. That is
 * deliberate: the hosted `RLS Boundaries` job exports real credentials, and a fixture-creating
 * suite must never be one `pnpm vitest run` away from a shared project.
 *
 * Run locally: start a stack with `supabase start`, then give the test the local API URL
 * (http://127.0.0.1:54321) and the stack's anon and service_role keys from `supabase status`, as the
 * NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY environment
 * variables. A database built from scratch also needs the hosted-parity grant the CI job applies:
 *   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
 *     -c 'grant all privileges on all tables in schema public to service_role;'
 * and then:
 *   pnpm vitest run src/lib/db-concurrency.integration.test.ts
 *
 * In CI it runs in the `db-concurrency` job (.github/workflows/ci.yml). Without those variables the
 * whole file is skipped, so the default `pnpm test` pass is unaffected.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// A few dozen round-trips per case, plus fixture setup.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
// The placeholder URL vitest.config.ts substitutes when nothing is configured is not local, so an
// unconfigured run skips here as well.
const isLocalStack = Boolean(url && /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url))
const enabled = Boolean(url && anonKey && serviceKey && isLocalStack)

type Outcome = { status: string; [key: string]: unknown }
type RpcResult = { data: unknown; error: { code?: string; message: string } | null }

let service: SupabaseClient
let anon: SupabaseClient

/** Unique per run so a re-run against a stack that kept rows from a crashed run cannot collide. */
const RUN = Math.random().toString(36).slice(2, 6).toUpperCase()
let gameCounter = 0
const createdGames: string[] = []

function must<T = unknown>(what: string, res: { data: unknown; error: { message: string } | null }): T {
  if (res.error || res.data === null) throw new Error(`${what}: ${res.error?.message ?? 'no row returned'}`)
  return res.data as T
}

async function makeGame(gameType: string, status = 'active'): Promise<string> {
  const id = `DB${RUN}${++gameCounter}`
  const { error } = await service
    .from('games')
    .insert({ id, title: `db-concurrency ${id}`, host_token: `host-${id}`, game_type: gameType, status })
  if (error) throw new Error(`insert game ${id}: ${error.message}`)
  createdGames.push(id)
  return id
}

async function makePlayer(gameId: string, name: string): Promise<string> {
  const row = must<{ id: string }>(
    `insert player ${name}`,
    await service.from('players').insert({ game_id: gameId, name }).select('id').single()
  )
  return row.id
}

async function makeRound(gameId: string, status = 'active'): Promise<string> {
  const row = must<{ id: string }>(
    'insert round',
    await service.from('rounds').insert({ game_id: gameId, round_number: 1, status }).select('id').single()
  )
  return row.id
}

/** Fire `n` calls at once. Each is its own HTTP request, so PostgREST runs them on separate connections. */
function inParallel(n: number, call: (i: number) => PromiseLike<RpcResult>): Promise<RpcResult[]> {
  return Promise.all(Array.from({ length: n }, (_, i) => call(i)))
}

function noErrors(results: RpcResult[]) {
  const errors = results.filter((r) => r.error).map((r) => r.error!.message)
  expect(errors).toEqual([])
}

const outcomes = (results: RpcResult[]) => results.map((r) => r.data as Outcome)
const count = (list: Outcome[], status: string) => list.filter((o) => o.status === status).length

/**
 * A race only shows up when the calls really overlap, and overlap is a matter of timing. In a local
 * experiment with the round lock removed from pick_a_number_submit, one simultaneous start of
 * twelve callers still produced a clean result one time in five. Repeating each race with fresh
 * fixtures makes a regression slipping through that way vanishingly unlikely, at the cost of about
 * a second. A correct function never fails any repetition, so this adds no flakiness of its own.
 */
const RACE_ROUNDS = 15
async function repeatRace(body: (round: number) => Promise<void>): Promise<void> {
  for (let round = 1; round <= RACE_ROUNDS; round++) await body(round)
}

/**
 * timestamptz as microseconds since the epoch. PostgREST trims trailing zeros of the fraction
 * ("…18.2617+00:00"), so strings do not sort; Date alone would drop the microseconds, and the
 * version these functions hand out advances by as little as one.
 */
function micros(ts: string): number {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(ts)
  if (!m) throw new Error(`unparseable timestamptz: ${ts}`)
  const tz = m[4] === 'Z' ? 'Z' : m[4].length === 3 ? `${m[4]}:00` : m[4]
  return Date.parse(`${m[1]}T${m[2]}${tz}`) * 1000 + Number((m[3] ?? '').padEnd(6, '0').slice(0, 6))
}

// CI sets DB_CONCURRENCY_REQUIRED so that a lost credential or a half-started stack FAILS here
// instead of skipping the whole file and reporting a green check that proved nothing.
if (process.env.DB_CONCURRENCY_REQUIRED === '1' && !enabled) {
  describe('database functions under concurrent callers', () => {
    it('has a local Supabase stack to run against', () => {
      throw new Error(
        'DB_CONCURRENCY_REQUIRED=1 but no local stack is configured: NEXT_PUBLIC_SUPABASE_URL must be ' +
          'a http(s)://127.0.0.1 or localhost URL, and NEXT_PUBLIC_SUPABASE_ANON_KEY and ' +
          'SUPABASE_SERVICE_ROLE_KEY must be set.'
      )
    })
  })
}

describe.skipIf(!enabled)('database functions under concurrent callers', () => {
  beforeAll(() => {
    service = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } })
    anon = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } })
  })

  afterAll(async () => {
    // Every child table references games with ON DELETE CASCADE.
    if (service && createdGames.length) {
      const { error } = await service.from('games').delete().in('id', createdGames)
      // A silent failure here would leave fixtures behind in the developer's database while the
      // run reports green, so name them.
      if (error) throw new Error(`could not delete fixture games ${createdGames.join(', ')}: ${error.message}`)
    }
  })

  // -------------------------------------------------------------------------------------------
  describe('word_grouping_submit', () => {
    const MAX = 4
    const guess = (gameId: string, roundId: string, playerId: string, i: number, correct = false) =>
      service.rpc('word_grouping_submit', {
        p_game_id: gameId,
        p_round_id: roundId,
        p_player_id: playerId,
        p_group_index: correct ? 1 : -1,
        p_difficulty: correct ? 2 : 0,
        p_guess_words: [`w${i}`],
        p_is_correct: correct,
        p_max_mistakes: MAX,
      })

    const stored = async (roundId: string, playerId: string, isCorrect: boolean) => {
      const res = await service
        .from('word_grouping_submissions')
        .select('mistakes_at_time')
        .eq('round_id', roundId)
        .eq('player_id', playerId)
        .eq('is_correct', isCorrect)
      return must<{ mistakes_at_time: number }[]>('read submissions', res)
    }

    it('admits exactly the limit when wrong guesses arrive at once, in a strict order', async () => {
      await repeatRace(async () => {
        const gameId = await makeGame('word_grouping')
        const roundId = await makeRound(gameId)
        const playerId = await makePlayer(gameId, 'solo')

        const results = await inParallel(12, (i) => guess(gameId, roundId, playerId, i))
        noErrors(results)
        const out = outcomes(results)

        expect(count(out, 'ok')).toBe(MAX)
        expect(count(out, 'out_of_guesses')).toBe(12 - MAX)
        // A lost race would let two callers read the same count and both report, say, 3.
        expect(
          out
            .filter((o) => o.status === 'ok')
            .map((o) => o.mistake_count)
            .sort()
        ).toEqual([1, 2, 3, 4])

        // A rejected guess must never be stored (the old route stored it, then tried to take it back).
        const rows = await stored(roundId, playerId, false)
        expect(rows).toHaveLength(MAX)
        expect(rows.map((r) => r.mistakes_at_time).sort()).toEqual([1, 2, 3, 4])
      })
    })

    it("keeps each player's limit independent when two players guess at once", async () => {
      await repeatRace(async () => {
        const gameId = await makeGame('word_grouping')
        const roundId = await makeRound(gameId)
        const a = await makePlayer(gameId, 'a')
        const b = await makePlayer(gameId, 'b')

        const results = await inParallel(12, (i) => guess(gameId, roundId, i % 2 === 0 ? a : b, i))
        noErrors(results)

        // Six guesses each: both players fill their own four slots, neither starves the other.
        expect(await stored(roundId, a, false)).toHaveLength(MAX)
        expect(await stored(roundId, b, false)).toHaveLength(MAX)
        expect(count(outcomes(results), 'ok')).toBe(MAX * 2)
      })
    })

    it('stores a group that several requests solve at once exactly once', async () => {
      await repeatRace(async () => {
        const gameId = await makeGame('word_grouping')
        const roundId = await makeRound(gameId)
        const playerId = await makePlayer(gameId, 'solo')

        const results = await inParallel(6, (i) => guess(gameId, roundId, playerId, i, true))
        noErrors(results) // no unique-violation leaking out as an error
        const out = outcomes(results)

        expect(count(out, 'ok')).toBe(1)
        expect(count(out, 'already_solved')).toBe(5)
        expect(await stored(roundId, playerId, true)).toHaveLength(1)
      })
    })

    it('refuses a guess once the game has finished, and stores nothing', async () => {
      const gameId = await makeGame('word_grouping', 'finished')
      const roundId = await makeRound(gameId)
      const playerId = await makePlayer(gameId, 'solo')

      const results = await inParallel(3, (i) => guess(gameId, roundId, playerId, i))
      noErrors(results)

      expect(count(outcomes(results), 'game_not_active')).toBe(3)
      expect(await stored(roundId, playerId, false)).toHaveLength(0)
    })
  })

  // -------------------------------------------------------------------------------------------
  describe('pick_a_number_submit', () => {
    const pick = (gameId: string, roundId: string, playerId: string, n: number) =>
      service.rpc('pick_a_number_submit', {
        p_game_id: gameId,
        p_round_id: roundId,
        p_player_id: playerId,
        p_picked_number: n,
        p_question: `question-${n}`,
      })

    it("lets one of several simultaneous picks win and keeps that pick's question", async () => {
      await repeatRace(async () => {
        const gameId = await makeGame('pick_a_number')
        const roundId = await makeRound(gameId)
        const playerId = await makePlayer(gameId, 'picker')

        // Eight different numbers, each carrying its own question text.
        const results = await inParallel(8, (i) => pick(gameId, roundId, playerId, i + 1))
        noErrors(results)
        const out = outcomes(results)

        expect(count(out, 'ok')).toBe(1)
        expect(count(out, 'already_picked')).toBe(7)
        const winner = out.find((o) => o.status === 'ok')!.picked_number as number

        // Every loser is told the number that actually stands.
        for (const o of out.filter((x) => x.status === 'already_picked')) expect(o.picked_number).toBe(winner)

        // One vote, the winner's number...
        const votes = must<{ picked_number: number }[]>(
          'read votes',
          await service.from('votes').select('picked_number').eq('round_id', roundId).eq('player_id', playerId)
        )
        expect(votes).toEqual([{ picked_number: winner }])

        // ...and the winner's question. The old route let a loser's rollback overwrite this with its own.
        const round = must<{ mlt_question: string }>(
          'read round',
          await service.from('rounds').select('mlt_question').eq('id', roundId).single()
        )
        expect(round.mlt_question).toBe(`question-${winner}`)
      })
    })

    it('refuses once the game has finished, and records nothing', async () => {
      const gameId = await makeGame('pick_a_number', 'finished')
      const roundId = await makeRound(gameId)
      const playerId = await makePlayer(gameId, 'picker')

      const results = await inParallel(3, (i) => pick(gameId, roundId, playerId, i + 1))
      noErrors(results)

      expect(count(outcomes(results), 'game_not_active')).toBe(3)
      const votes = must('read votes', await service.from('votes').select('id').eq('round_id', roundId))
      expect(votes).toHaveLength(0)
    })

    it('refuses once the round has ended, and leaves its question alone', async () => {
      const gameId = await makeGame('pick_a_number')
      const roundId = await makeRound(gameId, 'finished')
      const playerId = await makePlayer(gameId, 'picker')

      const results = await inParallel(3, (i) => pick(gameId, roundId, playerId, i + 1))
      noErrors(results)

      expect(count(outcomes(results), 'round_not_active')).toBe(3)
      // No vote either: a function that inserted one and only then answered round_not_active
      // would still return the right status.
      const votes = must('read votes', await service.from('votes').select('id').eq('round_id', roundId))
      expect(votes).toHaveLength(0)
      const round = must<{ mlt_question: string | null }>(
        'read round',
        await service.from('rounds').select('mlt_question').eq('id', roundId).single()
      )
      expect(round.mlt_question).toBeNull()
    })

    it('refuses a round that belongs to a different game, and writes nothing', async () => {
      const gameA = await makeGame('pick_a_number')
      const gameB = await makeGame('pick_a_number')
      const roundOfB = await makeRound(gameB)
      const playerId = await makePlayer(gameA, 'picker')

      // Game A is active, but the round it names is game B's: the round lock must be scoped to the game.
      const res = await pick(gameA, roundOfB, playerId, 3)
      expect(res.error?.message).toMatch(/not found/)

      const votes = must('read votes', await service.from('votes').select('id').eq('round_id', roundOfB))
      expect(votes).toHaveLength(0)
      const round = must<{ mlt_question: string | null }>(
        'read round',
        await service.from('rounds').select('mlt_question').eq('id', roundOfB).single()
      )
      expect(round.mlt_question).toBeNull()
    })
  })

  // -------------------------------------------------------------------------------------------
  describe('submit_vote_atomic', () => {
    const vote = (
      gameId: string,
      roundId: string,
      playerId: string,
      choice: 'a' | 'b',
      opts: { grace?: number | null; now?: Date } = {}
    ) =>
      service.rpc('submit_vote_atomic', {
        p_game_id: gameId,
        p_round_id: roundId,
        p_player_id: playerId,
        p_row: { wyr_choice: choice },
        p_grace_ms: opts.grace === undefined ? 3000 : opts.grace,
        p_now: (opts.now ?? new Date()).toISOString(),
      })

    const stored = async (roundId: string, playerId: string) =>
      must<{ wyr_choice: string }[]>(
        'read votes',
        await service.from('votes').select('wyr_choice').eq('round_id', roundId).eq('player_id', playerId)
      )

    const finish = (roundId: string, endedAt: Date) =>
      service
        .from('rounds')
        .update({ status: 'finished', ended_at: endedAt.toISOString() })
        .eq('id', roundId)
        .eq('status', 'active')
        .select('id')

    it('lets a player change their vote while the round is active', async () => {
      const gameId = await makeGame('would_you_rather')
      const roundId = await makeRound(gameId)
      const playerId = await makePlayer(gameId, 'voter')

      noErrors([await vote(gameId, roundId, playerId, 'a'), await vote(gameId, roundId, playerId, 'b')])
      expect(await stored(roundId, playerId)).toEqual([{ wyr_choice: 'b' }])
    })

    it('refuses a vote on a finished round when the game type has no grace, and keeps the stored vote', async () => {
      const gameId = await makeGame('who_said_this')
      const roundId = await makeRound(gameId)
      const playerId = await makePlayer(gameId, 'voter')
      await vote(gameId, roundId, playerId, 'a', { grace: null })
      await finish(roundId, new Date())

      const res = await vote(gameId, roundId, playerId, 'b', { grace: null })
      noErrors([res])
      expect(outcomes([res])[0].status).toBe('round_not_active')
      expect(await stored(roundId, playerId)).toEqual([{ wyr_choice: 'a' }])
    })

    it('inside the grace window saves a missing vote but never overwrites an accepted one', async () => {
      const gameId = await makeGame('would_you_rather')
      const roundId = await makeRound(gameId)
      const early = await makePlayer(gameId, 'early')
      const late = await makePlayer(gameId, 'late')
      await vote(gameId, roundId, early, 'a')
      await finish(roundId, new Date())

      const results = [await vote(gameId, roundId, early, 'b'), await vote(gameId, roundId, late, 'b')]
      noErrors(results)
      expect(outcomes(results).map((o) => o.status)).toEqual(['kept_existing', 'ok'])
      expect(await stored(roundId, early)).toEqual([{ wyr_choice: 'a' }])
      expect(await stored(roundId, late)).toEqual([{ wyr_choice: 'b' }])
    })

    it('refuses a vote once the grace window has passed', async () => {
      const gameId = await makeGame('would_you_rather')
      const roundId = await makeRound(gameId)
      const playerId = await makePlayer(gameId, 'voter')
      await finish(roundId, new Date())

      const res = await vote(gameId, roundId, playerId, 'a', { now: new Date(Date.now() + 10_000) })
      noErrors([res])
      expect(outcomes([res])[0].status).toBe('round_not_active')
      expect(await stored(roundId, playerId)).toEqual([])
    })

    it('serialises a resend racing end-round: it replaces the vote only if it beat the close', async () => {
      await repeatRace(async () => {
        const gameId = await makeGame('who_said_this')
        const roundId = await makeRound(gameId)
        const playerId = await makePlayer(gameId, 'voter')
        await vote(gameId, roundId, playerId, 'a', { grace: null })

        // No grace: a resend is either fully before the close (replaces) or refused (keeps 'a').
        const [resend, closed] = await Promise.all([
          vote(gameId, roundId, playerId, 'b', { grace: null }),
          finish(roundId, new Date()),
        ])
        noErrors([resend])
        expect(closed.error).toBeNull()
        const status = outcomes([resend])[0].status
        expect(['ok', 'round_not_active']).toContain(status)
        expect(await stored(roundId, playerId)).toEqual([{ wyr_choice: status === 'ok' ? 'b' : 'a' }])
      })
    })

    it('cannot be called with the public anon key', async () => {
      const res = await anon.rpc('submit_vote_atomic', {
        p_game_id: 'NOPE',
        p_round_id: '00000000-0000-4000-8000-000000000000',
        p_player_id: '00000000-0000-4000-8000-000000000000',
        p_row: {},
        p_grace_ms: null,
        p_now: new Date().toISOString(),
      })
      expect(res.data).toBeNull()
      expect(['42501', 'PGRST202']).toContain(res.error?.code)
    })
  })

  // -------------------------------------------------------------------------------------------
  // Mahjong and Rummy are the same function over different tables: a session compare-and-swap on
  // updated_at plus writes to per-player rows, in one transaction.
  const TRANSITIONS = [
    {
      name: 'mahjong_apply_transition',
      gameType: 'mahjong',
      sessionTable: 'mahjong_sessions',
      childTable: 'mahjong_player_state',
      childColumn: 'hand',
      writesParam: 'p_state_writes',
      childRow: (gameId: string, playerId: string, index: number) => ({
        game_id: gameId,
        player_id: playerId,
        seat: ['east', 'south'][index],
      }),
    },
    {
      name: 'rummy_apply_transition',
      gameType: 'rummy',
      sessionTable: 'rummy_sessions',
      childTable: 'rummy_player_hands',
      childColumn: 'cards',
      writesParam: 'p_hand_writes',
      childRow: (gameId: string, playerId: string) => ({ game_id: gameId, player_id: playerId }),
    },
  ] as const

  describe.each(TRANSITIONS)('$name', (t) => {
    async function fixture() {
      const gameId = await makeGame(t.gameType)
      const playerIds = [await makePlayer(gameId, 'a'), await makePlayer(gameId, 'b')]
      const session = must<{ updated_at: string }>(
        'insert session',
        await service.from(t.sessionTable).insert({ game_id: gameId }).select('updated_at').single()
      )
      const children = must<{ id: string }[]>(
        'insert child rows',
        await service
          .from(t.childTable)
          .insert(playerIds.map((p, i) => t.childRow(gameId, p, i)))
          .select('id')
      )
      return { gameId, updatedAt: session.updated_at, childIds: children.map((c) => c.id) }
    }

    const transition = (
      gameId: string,
      expected: string,
      patch: Record<string, unknown>,
      writes: { id: string; patch: Record<string, unknown> }[]
    ) =>
      service.rpc(t.name, {
        p_game_id: gameId,
        p_expected_updated_at: expected,
        p_session_patch: patch,
        [t.writesParam]: writes,
      })

    const readSession = async (gameId: string) =>
      must<{ status_message: string | null; updated_at: string }>(
        'read session',
        await service.from(t.sessionTable).select('status_message, updated_at').eq('game_id', gameId).single()
      )

    const readChild = async (id: string) =>
      must<Record<string, unknown>>(
        'read child row',
        await service.from(t.childTable).select(t.childColumn).eq('id', id).single()
      )[t.childColumn]

    it('lets exactly one of many concurrent transitions win, and only its writes land', async () => {
      await repeatRace(async () => {
        const f = await fixture()
        const untouched = await Promise.all(f.childIds.map(readChild))

        // Ten writers all believe the session is still at the version they read. Each writer has
        // its OWN field values and alternates between the two child rows, so a losing request that
        // wrote its patch before checking the version leaves a trace the winner cannot overwrite:
        // the winner only ever writes one of the two rows.
        const results = await inParallel(10, (i) =>
          transition(f.gameId, f.updatedAt, { status_message: `writer-${i}` }, [
            { id: f.childIds[i % 2], patch: { [t.childColumn]: [`value-${i}`] } },
          ])
        )
        noErrors(results)
        const out = outcomes(results)

        expect(count(out, 'ok')).toBe(1)
        expect(count(out, 'conflict')).toBe(9)
        const winner = out.findIndex((o) => o.status === 'ok')

        expect((await readSession(f.gameId)).status_message).toBe(`writer-${winner}`)
        expect(await readChild(f.childIds[winner % 2])).toEqual([`value-${winner}`])
        // The row the winner did not write is exactly as it was: no loser got a write in.
        expect(await readChild(f.childIds[(winner + 1) % 2])).toEqual(untouched[(winner + 1) % 2])
      })
    })

    it('rolls the session and every earlier write back when a later write in the transition fails', async () => {
      const f = await fixture()
      const sessionBefore = await readSession(f.gameId)
      const childBefore = await readChild(f.childIds[0])

      // The session update is valid and would win the compare-and-swap, and so is the first child
      // write; the second write, to a row that is not in this game, then fails. The old route had
      // already moved the session by this point, and a half-applied transition leaves the earlier
      // child written too.
      const res = await transition(f.gameId, f.updatedAt, { status_message: 'must-not-stick' }, [
        { id: f.childIds[0], patch: { [t.childColumn]: ['must-not-stick'] } },
        { id: '00000000-0000-4000-8000-000000000000', patch: { [t.childColumn]: [] } },
      ])

      expect(res.error?.message).toMatch(/not found/)
      expect(await readSession(f.gameId)).toEqual(sessionBefore)
      expect(await readChild(f.childIds[0])).toEqual(childBefore)
    })

    it('rejects an unknown column before writing anything', async () => {
      const f = await fixture()
      const before = await readSession(f.gameId)

      const res = await transition(f.gameId, f.updatedAt, { not_a_column: 1 }, [])

      expect(res.error?.message).toMatch(/invalid session column/)
      expect(await readSession(f.gameId)).toEqual(before)
    })

    it('hands out strictly increasing versions and turns a stale one away', async () => {
      const f = await fixture()

      let version = f.updatedAt
      const seen = [micros(version)]
      for (let i = 1; i <= 5; i++) {
        const res = await transition(f.gameId, version, { status_message: `step-${i}` }, [])
        noErrors([res])
        const out = res.data as Outcome
        expect(out.status).toBe('ok')
        version = out.updated_at as string
        seen.push(micros(version))
      }
      for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1])

      // The version every caller read at the start is long gone.
      const stale = await transition(f.gameId, f.updatedAt, { status_message: 'stale' }, [])
      noErrors([stale])
      expect((stale.data as Outcome).status).toBe('conflict')
      expect((await readSession(f.gameId)).status_message).toBe('step-5')
    })
  })

  // -------------------------------------------------------------------------------------------
  describe('bingo_claim_win', () => {
    const FAKE_PLAYER = '00000000-0000-4000-8000-000000000000'

    const claim = (gameId: string, playerId: string) =>
      service.rpc('bingo_claim_win', {
        p_game_id: gameId,
        p_player_id: playerId,
        p_pattern: 'line',
        p_finished_at: new Date().toISOString(),
      })

    async function readGameStatus(gameId: string): Promise<string> {
      return must<{ status: string }>(
        'read game',
        await service.from('games').select('status').eq('id', gameId).single()
      ).status
    }
    async function readClaims(gameId: string): Promise<{ player_id: string; status: string }[]> {
      return must<{ player_id: string; status: string }[]>(
        'read claims',
        await service.from('bingo_claims').select('player_id, status').eq('game_id', gameId)
      )
    }

    it('admits exactly one of many simultaneous claims and finishes the game with it', async () => {
      await repeatRace(async () => {
        const gameId = await makeGame('bingo')
        const players = await Promise.all(Array.from({ length: 8 }, (_, i) => makePlayer(gameId, `P${i}`)))

        const results = await inParallel(players.length, (i) => claim(gameId, players[i]))

        noErrors(results)
        const list = outcomes(results)
        expect(count(list, 'won')).toBe(1)
        // Everyone else is told someone already won, or that the round is no longer active.
        expect(count(list, 'already_won') + count(list, 'game_not_active')).toBe(players.length - 1)
        expect(await readGameStatus(gameId)).toBe('finished')
        const claims = await readClaims(gameId)
        expect(claims).toHaveLength(1)
        expect(claims[0].status).toBe('approved')
      })
    })

    it('leaves the game active and writes no claim when the claim insert fails, and a retry then succeeds', async () => {
      const gameId = await makeGame('bingo')
      const player = await makePlayer(gameId, 'Winner')

      // The status flip succeeds first; the claim insert then fails on the player foreign key. The
      // old route had already committed the flip (or the claim) by the time its second write failed.
      const failed = await claim(gameId, FAKE_PLAYER)
      expect(failed.error).not.toBeNull()
      expect(await readGameStatus(gameId)).toBe('active')
      expect(await readClaims(gameId)).toEqual([])

      const retry = await claim(gameId, player)
      expect(retry.error).toBeNull()
      expect((retry.data as Outcome).status).toBe('won')
      expect(await readGameStatus(gameId)).toBe('finished')
      expect(await readClaims(gameId)).toEqual([{ player_id: player, status: 'approved' }])
    })

    it('refuses once the game has finished, and records nothing', async () => {
      const gameId = await makeGame('bingo', 'finished')
      const player = await makePlayer(gameId, 'Late')
      const res = await claim(gameId, player)
      expect(res.error).toBeNull()
      expect((res.data as Outcome).status).toBe('game_not_active')
      expect(await readClaims(gameId)).toEqual([])
    })
  })

  // -------------------------------------------------------------------------------------------
  describe('matching_pairs_record_flip_checked', () => {
    // Every caller scored its flip from the same (empty) history, so its fingerprint is (0, null). Only the
    // first to run may store; the rest must see the history it appended and answer `stale`, inserting nothing.
    const flip = (gameId: string, roundId: string, playerId: string, pairIndex: number) =>
      service.rpc('matching_pairs_record_flip_checked', {
        p_game_id: gameId,
        p_round_id: roundId,
        p_player_id: playerId,
        p_pair_index: pairIndex,
        p_is_match: true,
        p_streak_at_time: 1,
        p_streak_bonus: 0,
        p_points_after: 1000,
        p_expected_count: 0,
        p_expected_last_id: null,
      })

    async function storedFlips(roundId: string, playerId: string): Promise<number> {
      const rows = must<unknown[]>(
        'read submissions',
        await service.from('memory_match_submissions').select('id').eq('round_id', roundId).eq('player_id', playerId)
      )
      return rows.length
    }

    it.each([
      ['has a progress row', true],
      // Joined or promoted after the round was seeded: nothing to FOR UPDATE, so the advisory lock is what serialises.
      ['has no progress row (joined mid-round)', false],
    ])(
      'stores exactly one of many simultaneous flips scored from the same history when the player %s',
      async (_name, seeded) => {
        await repeatRace(async () => {
          const gameId = await makeGame('matching_pairs')
          const playerId = await makePlayer(gameId, 'Flipper')
          const roundId = await makeRound(gameId)
          if (seeded) {
            must(
              'insert progress',
              await service
                .from('memory_match_progress')
                .insert({ game_id: gameId, round_id: roundId, player_id: playerId })
                .select('player_id')
                .single()
            )
          }

          const results = await inParallel(8, (i) => flip(gameId, roundId, playerId, i))

          noErrors(results)
          const list = outcomes(results)
          expect(count(list, 'ok')).toBe(1)
          expect(count(list, 'stale')).toBe(7)
          expect(await storedFlips(roundId, playerId)).toBe(1)
        })
      }
    )

    it('refuses a flip on a round that is no longer active', async () => {
      const gameId = await makeGame('matching_pairs')
      const playerId = await makePlayer(gameId, 'Late')
      const roundId = await makeRound(gameId, 'finished')
      const res = await flip(gameId, roundId, playerId, 0)
      expect(res.error).toBeNull()
      expect((res.data as Outcome).status).toBe('round_not_active')
      expect(await storedFlips(roundId, playerId)).toBe(0)
    })
  })

  // -------------------------------------------------------------------------------------------
  describe('execute privileges', () => {
    // These are SECURITY DEFINER and write hidden game state. If a later migration re-grants
    // EXECUTE to PUBLIC, the public anon key could call them straight from a browser.
    const CALLS: [name: string, args: Record<string, unknown>][] = [
      [
        'word_grouping_submit',
        {
          p_game_id: 'NOPE',
          p_round_id: '00000000-0000-4000-8000-000000000000',
          p_player_id: '00000000-0000-4000-8000-000000000000',
          p_group_index: -1,
          p_difficulty: 0,
          p_guess_words: [],
          p_is_correct: false,
          p_max_mistakes: 4,
        },
      ],
      [
        'pick_a_number_submit',
        {
          p_game_id: 'NOPE',
          p_round_id: '00000000-0000-4000-8000-000000000000',
          p_player_id: '00000000-0000-4000-8000-000000000000',
          p_picked_number: 1,
          p_question: 'q',
        },
      ],
      [
        'mahjong_apply_transition',
        { p_game_id: 'NOPE', p_expected_updated_at: new Date().toISOString(), p_session_patch: {}, p_state_writes: [] },
      ],
      [
        'rummy_apply_transition',
        { p_game_id: 'NOPE', p_expected_updated_at: new Date().toISOString(), p_session_patch: {}, p_hand_writes: [] },
      ],
      [
        'bingo_claim_win',
        {
          p_game_id: 'NOPE',
          p_player_id: '00000000-0000-4000-8000-000000000000',
          p_pattern: 'line',
          p_finished_at: new Date().toISOString(),
        },
      ],
      [
        'matching_pairs_record_flip_checked',
        {
          p_game_id: 'NOPE',
          p_round_id: '00000000-0000-4000-8000-000000000000',
          p_player_id: '00000000-0000-4000-8000-000000000000',
          p_pair_index: 0,
          p_is_match: true,
          p_streak_at_time: 1,
          p_streak_bonus: 0,
          p_points_after: 1000,
          p_expected_count: 0,
          p_expected_last_id: null,
        },
      ],
    ]

    it.each(CALLS)('%s cannot be called with the public anon key', async (name, args) => {
      const res = await anon.rpc(name, args)
      expect(res.data).toBeNull()
      // 42501 is "permission denied for function"; PGRST202 is PostgREST not exposing it at all.
      // Either way the call did not run.
      if (res.error?.code === 'PGRST202') return
      expect(res.error?.code).toBe('42501')
      // 42501 alone does not prove the body never ran: a function that DOES have an EXECUTE grant
      // can raise the same code from an internal permission check. The EXECUTE denial has its own
      // message naming the function, so require that.
      expect(res.error?.message).toContain(`permission denied for function ${name}`)
    })
  })
})
