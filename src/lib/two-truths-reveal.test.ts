import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { syncTwoTruthsGameState, revealFinishedTtlRounds } from './two-truths-advance'

// The reveal is the moment the round flips to 'finished': the server folds the hidden lie
// (ttl_round_lies) and everyone's guesses (the revoked ttl_guesses columns) into
// rounds.ttl_metadata in the SAME update. Both live outside anon-readable data now, so a
// round that finishes WITHOUT them is permanently unreadable — no lie highlighted, no
// results, on the reveal screen and in /history, with no path back.
//
// These tests pin the fail-closed rule: if the lie or the guesses cannot be READ, the round
// stays active and the next advance poll retries. An unreadable answer must never be
// published as "there is no answer".

type Row = { data: unknown; error: unknown }

const HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000).toISOString()

function makeMockSupabase(opts: {
  lieError?: boolean
  guessesError?: boolean
  noLieRow?: boolean
  roundsError?: boolean
  alreadyRevealed?: boolean
  roundFinished?: boolean
}) {
  const updates: Array<{ table: string; vals: Record<string, unknown> }> = []
  // alreadyRevealed: the round carries a lie AND a guesses array, but the array is SHORT —
  // one guess landed after endActiveRound read the results. This is the shape the backfill
  // used to skip.
  let roundMetadata: Record<string, unknown> = opts.alreadyRevealed
    ? { statements: ['a', 'b', 'c'], lie_index: 2, guesses: [] }
    : { statements: ['a', 'b', 'c'] }

  const game = {
    id: 'ABCD',
    game_type: 'two_truths',
    status: 'active',
    current_round_number: 1,
    rounds_count: 1,
    timer_seconds: 30,
    elimination_config: null,
  }
  // roundFinished: the round already ended and its reveal window has elapsed, so
  // syncTwoTruthsGameState takes the ADVANCE path rather than the end-round path.
  const round = {
    id: 'round-1',
    game_id: 'ABCD',
    round_number: 1,
    status: opts.roundFinished ? 'finished' : 'active',
    started_at: HOUR_AGO, // timer long expired → the round is due to end
    ended_at: opts.roundFinished ? HOUR_AGO : null,
    ttl_metadata: roundMetadata,
  }

  function chain(result: Row | { count: number }): Promise<unknown> & Record<string, unknown> {
    const p = Promise.resolve(result) as Promise<unknown> & Record<string, unknown>
    p.eq = () => chain(result)
    p.not = () => chain(result)
    p.order = () => chain(result)
    p.select = () => chain(result)
    p.maybeSingle = () => Promise.resolve(result)
    return p
  }

  const supabase = {
    from(table: string) {
      return {
        select(cols?: string) {
          if (table === 'games') return chain({ data: game, error: null })
          if (table === 'players') return chain({ count: 2 })
          if (table === 'rounds') {
            if (cols === 'ttl_metadata') return chain({ data: { ttl_metadata: roundMetadata }, error: null })
            if (opts.roundsError) return chain({ data: null, error: { message: 'boom' } })
            return chain({ data: [{ ...round, ttl_metadata: roundMetadata }], error: null })
          }
          if (table === 'ttl_round_lies') {
            return chain(
              opts.lieError
                ? { data: null, error: { message: 'boom' } }
                : { data: opts.noLieRow ? null : { lie_index: 2 }, error: null }
            )
          }
          if (table === 'ttl_guesses') {
            if (cols === 'id') return chain({ count: 1 })
            return chain(
              opts.guessesError
                ? { data: null, error: { message: 'boom' } }
                : {
                    data: [{ id: 'g1', player_id: 'p2', guessed_index: 0, is_correct: false, points: 0 }],
                    error: null,
                  }
            )
          }
          return chain({ data: null, error: null })
        },
        update(vals: Record<string, unknown>) {
          updates.push({ table, vals })
          if (table === 'rounds' && vals.ttl_metadata) roundMetadata = vals.ttl_metadata as Record<string, unknown>
          return chain({ data: { id: 'round-1' }, error: null })
        },
      }
    },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: supabase as any, updates, metadata: () => roundMetadata }
}

describe('two truths reveal', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('folds the hidden lie and the guesses in when the round ends', async () => {
    const { supabase, updates, metadata } = makeMockSupabase({})
    const result = await syncTwoTruthsGameState(supabase, 'ABCD')

    expect(result.code).toBe('ended_round')
    const flip = updates.find((u) => u.table === 'rounds' && u.vals.status === 'finished')
    expect(flip).toBeTruthy()
    expect((flip!.vals.ttl_metadata as Record<string, unknown>).lie_index).toBe(2)
    expect(metadata().guesses).toHaveLength(1)
  })

  it('does NOT finish the round when the hidden lie cannot be read', async () => {
    const { supabase, updates } = makeMockSupabase({ lieError: true })
    const result = await syncTwoTruthsGameState(supabase, 'ABCD')

    // Round stays active, so the next advance poll retries the reveal.
    expect(result.code).toBe('round_active')
    expect(updates.find((u) => u.vals.status === 'finished')).toBeUndefined()
  })

  it('does NOT finish the round when the guesses cannot be read', async () => {
    const { supabase, updates } = makeMockSupabase({ guessesError: true })
    const result = await syncTwoTruthsGameState(supabase, 'ABCD')

    expect(result.code).toBe('round_active')
    expect(updates.find((u) => u.vals.status === 'finished')).toBeUndefined()
  })

  it('still finishes (loudly) when the lie row is genuinely absent, rather than wedging the game', async () => {
    // Retrying cannot conjure a row that was never written; blocking forever would leave the
    // round unplayable. Reveal what exists — the UI highlights nothing rather than the wrong
    // statement — and log it.
    const { supabase, updates } = makeMockSupabase({ noLieRow: true })
    const result = await syncTwoTruthsGameState(supabase, 'ABCD')

    expect(result.code).toBe('ended_round')
    const flip = updates.find((u) => u.table === 'rounds' && u.vals.status === 'finished')
    expect((flip!.vals.ttl_metadata as Record<string, unknown>).lie_index).toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('no lie recorded'), 'round-1')
  })
  // The ADMIN path (adminEndGame -> revealFinishedTtlRounds) had the same hole the player path
  // was hardened against, but worse: the bulk update flips the rounds to 'finished' BEFORE the
  // reveal runs, a failed reveal was silently skipped, and adminEndGame then finished the game —
  // after which its own "only waiting or active games can be ended" guard rejects every retry.
  // The round is then stuck with no lie_index and no guesses, permanently.
  it('reports failure when a finished round cannot be revealed, so the game stays endable', async () => {
    const { supabase } = makeMockSupabase({ lieError: true })
    // rounds come back already 'finished' on this path
    await expect(revealFinishedTtlRounds(supabase, 'ABCD')).resolves.toBe(false)
  })

  it('reports success when every finished round reveals', async () => {
    const { supabase } = makeMockSupabase({})
    await expect(revealFinishedTtlRounds(supabase, 'ABCD')).resolves.toBe(true)
  })
  // A failed rounds SELECT returns no rows, which `rounds ?? []` turns into "nothing to reveal".
  // Reporting success there is the same permanent loss as swallowing a per-round failure: the
  // caller finishes the game and adminEndGame then rejects every retry.
  it('reports failure when the finished-round query itself fails', async () => {
    const { supabase } = makeMockSupabase({ roundsError: true })
    await expect(revealFinishedTtlRounds(supabase, 'ABCD')).resolves.toBe(false)
  })
  // "Has a guesses array" is not "has the WHOLE list". A guess that lands between
  // endActiveRound's read and its status flip is scored but missing from the published array,
  // and the backfill used to skip any round whose metadata merely had the right SHAPE — so the
  // missing guess could never be repaired. It now reconciles, and reports failure if it cannot.
  it('backfills a finished round whose published guess list is short', async () => {
    const { supabase, updates } = makeMockSupabase({ alreadyRevealed: true })
    await expect(revealFinishedTtlRounds(supabase, 'ABCD')).resolves.toBe(true)
    // the short list was rewritten from the real guess rows
    const rewrite = updates.find((u) => u.table === 'rounds' && u.vals.ttl_metadata)
    expect(rewrite).toBeTruthy()
    expect((rewrite!.vals.ttl_metadata as Record<string, unknown>).guesses).toHaveLength(1)
  })

  it('reports failure when an already-revealed round cannot be reconciled', async () => {
    const { supabase } = makeMockSupabase({ alreadyRevealed: true, guessesError: true })
    await expect(revealFinishedTtlRounds(supabase, 'ABCD')).resolves.toBe(false)
  })
  // endActiveRound reconciles once and ignores the result; before this, nothing else in NORMAL
  // play ever tried again — the finished-round backfill only runs from adminEndGame. A transient
  // failure therefore left ttl_metadata.guesses permanently short, and unreadable, because the
  // raw guess columns are revoked from anon. The advance path now retries.
  it('reconciles again on the advance path after the reveal window', async () => {
    // Round already finished with a SHORT guess list, reveal window elapsed: the end-round path
    // is not taken, so the only thing that can rewrite the metadata is the advance-path reconcile.
    const { supabase, updates } = makeMockSupabase({ alreadyRevealed: true, roundFinished: true })
    await syncTwoTruthsGameState(supabase, 'ABCD')
    const rewrite = updates.find(
      (u) =>
        u.table === 'rounds' &&
        u.vals.ttl_metadata &&
        Array.isArray((u.vals.ttl_metadata as Record<string, unknown>).guesses)
    )
    expect(rewrite).toBeTruthy()
    expect((rewrite!.vals.ttl_metadata as Record<string, unknown>).guesses).toHaveLength(1)
  })
})
