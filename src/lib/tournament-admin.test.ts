import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  assertTournamentHostWith,
  assertTournamentHostAny,
  assertTournamentHostUnfinished,
  assertTournamentHostBeforeStart,
  TOURNAMENT_UNFINISHED_STATUSES,
} from './tournament-admin'

/** Stand-in for `supabase.from('tournaments').select('*').eq('id', …).maybeSingle()`. */
function mockSupabase(tournament: Record<string, unknown> | null): SupabaseClient {
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: tournament }) }) }) }),
  } as unknown as SupabaseClient
}

/** Same stub, but records the column/value the query was actually filtered by. */
function spySupabase(tournament: Record<string, unknown> | null) {
  const seen: { table?: string; column?: string; value?: unknown } = {}
  const client = {
    from: (table: string) => {
      seen.table = table
      return {
        select: () => ({
          eq: (column: string, value: unknown) => {
            seen.column = column
            seen.value = value
            return { maybeSingle: async () => ({ data: tournament }) }
          },
        }),
      }
    },
  } as unknown as SupabaseClient
  return { client, seen }
}

const TOKEN = 'tournament-host-secret'
const tournament = (status: string) => ({ id: 'ABCD', host_token: TOKEN, status, title: 'Cup' })

/** The full closed vocabulary from supabase/migrations/0097_tournaments.sql and its followers. */
const ALL_STATUSES = ['waiting', 'active', 'finished', 'scheduled'] as const

describe('assertTournamentHost* shared checks', () => {
  it('returns 404 when the tournament is missing', async () => {
    const r = await assertTournamentHostAny(mockSupabase(null), 'abcd', TOKEN)
    expect(r.status).toBe(404)
    expect(r.error).toBe('Tournament not found')
    expect(r.tournament).toBeNull()
    expect(r.id).toBe('ABCD')
  })

  it('returns 403 on a wrong host token', async () => {
    const r = await assertTournamentHostAny(mockSupabase(tournament('waiting')), 'abcd', 'wrong-token')
    expect(r.status).toBe(403)
    expect(r.error).toBe('Unauthorized')
    expect(r.tournament).toBeNull()
  })

  it('returns the row and a 200 on success', async () => {
    const r = await assertTournamentHostAny(mockSupabase(tournament('active')), 'ABCD', TOKEN)
    expect(r.status).toBe(200)
    expect(r.error).toBeNull()
    expect(r.tournament).toMatchObject({ id: 'ABCD', title: 'Cup' })
  })

  /**
   * Every tournament route does `code.toUpperCase()` before querying (all 13 route files),
   * so the helper must too — otherwise a lowercase code from a shared link 404s.
   */
  it('queries the `tournaments` table by the upper-cased code', async () => {
    const { client, seen } = spySupabase(tournament('waiting'))
    const r = await assertTournamentHostAny(client, 'abcd', TOKEN)
    expect(r.id).toBe('ABCD')
    expect(seen.table).toBe('tournaments')
    expect(seen.column).toBe('id')
    expect(seen.value).toBe('ABCD')
  })
})

describe('assertTournamentHostAny (no status gate)', () => {
  it('authorizes the host whatever the tournament status is', async () => {
    for (const status of [...ALL_STATUSES, 'cancelled', 'weird-future-status']) {
      const r = await assertTournamentHostAny(mockSupabase(tournament(status)), 'abcd', TOKEN)
      expect(r.error, `status ${status}`).toBeNull()
      expect(r.status, `status ${status}`).toBe(200)
      expect(r.tournament).not.toBeNull()
    }
  })

  it('still 404s a missing tournament and 403s a wrong token', async () => {
    const missing = await assertTournamentHostAny(mockSupabase(null), 'abcd', TOKEN)
    expect(missing.status).toBe(404)
    expect(missing.error).toBe('Tournament not found')

    const wrong = await assertTournamentHostAny(mockSupabase(tournament('active')), 'abcd', 'wrong-token')
    expect(wrong.status).toBe(403)
    expect(wrong.error).toBe('Unauthorized')
  })
})

describe('assertTournamentHostWith (caller-supplied status gate)', () => {
  const opts = { allowedStatuses: ['scheduled', 'waiting'], statusError: 'Only before kickoff' } as const

  it('accepts each status the caller allowed', async () => {
    for (const status of opts.allowedStatuses) {
      const r = await assertTournamentHostWith(mockSupabase(tournament(status)), 'abcd', TOKEN, opts)
      expect(r.error, `status ${status}`).toBeNull()
      expect(r.status).toBe(200)
      expect(r.tournament).not.toBeNull()
    }
  })

  it('rejects an unlisted status with 400 and the caller’s own message', async () => {
    for (const status of ['active', 'finished']) {
      const r = await assertTournamentHostWith(mockSupabase(tournament(status)), 'abcd', TOKEN, opts)
      expect(r.status, `status ${status}`).toBe(400)
      expect(r.error).toBe('Only before kickoff') // verbatim, not a generic message
      expect(r.tournament).toBeNull()
    }
  })

  it('an empty allowedStatuses list rejects everything', async () => {
    const r = await assertTournamentHostWith(mockSupabase(tournament('waiting')), 'abcd', TOKEN, {
      allowedStatuses: [],
      statusError: 'nope',
    })
    expect(r.status).toBe(400)
    expect(r.error).toBe('nope')
  })
})

/**
 * The two named gates cover 6 of the 14 sites. Their status sets are the behaviour those
 * routes have today, so they are pinned against the FULL vocabulary, not just the statuses
 * each route happens to see.
 */
describe('named status gates (behaviour to be preserved on adoption)', () => {
  const variants = [
    {
      name: 'assertTournamentHostUnfinished',
      fn: assertTournamentHostUnfinished,
      ok: ['waiting', 'active', 'scheduled'],
      reject: ['finished'],
      message: 'Tournament has ended',
    },
    {
      name: 'assertTournamentHostBeforeStart',
      fn: assertTournamentHostBeforeStart,
      ok: ['waiting', 'scheduled'],
      reject: ['active', 'finished'],
      message: 'Reschedule is only available before the tournament starts.',
    },
  ] as const

  for (const v of variants) {
    it(`${v.name} accepts ${v.ok.join('/')}`, async () => {
      for (const status of v.ok) {
        const r = await v.fn(mockSupabase(tournament(status)), 'abcd', TOKEN, v.message)
        expect(r.error, `${v.name} @ ${status}`).toBeNull()
        expect(r.status).toBe(200)
        expect(r.tournament).not.toBeNull()
      }
    })

    it(`${v.name} rejects ${v.reject.join('/')} with 400 and the caller's message`, async () => {
      for (const status of v.reject) {
        const r = await v.fn(mockSupabase(tournament(status)), 'abcd', TOKEN, v.message)
        expect(r.status, `${v.name} @ ${status}`).toBe(400)
        expect(r.error).toBe(v.message)
        expect(r.tournament).toBeNull()
      }
    })

    it(`${v.name} partitions the whole status vocabulary`, () => {
      expect([...v.ok, ...v.reject].sort()).toEqual([...ALL_STATUSES].sort())
    })
  }

  it('TOURNAMENT_UNFINISHED_STATUSES is exactly "not finished"', () => {
    expect([...TOURNAMENT_UNFINISHED_STATUSES].sort()).toEqual(ALL_STATUSES.filter((s) => s !== 'finished').sort())
  })
})

/**
 * `missingTokenError` reproduces the `400 Missing hostToken` that `transfer-host` and both
 * methods of `branding/logo` return today. It must fire BEFORE the database is touched —
 * for `branding/logo` POST that ordering is the whole point (it runs before `formData()`,
 * so an unauthenticated caller cannot make the server buffer a multipart upload).
 */
describe('missingTokenError (the 400 rung)', () => {
  const MISSING = 'Missing hostToken'

  it.each([
    ['empty string', ''],
    ['null', null],
    ['undefined', undefined],
  ])('400s a %s token with the caller’s message', async (_label, supplied) => {
    const { client, seen } = spySupabase(tournament('waiting'))
    const r = await assertTournamentHostAny(client, 'abcd', supplied, { missingTokenError: MISSING })
    expect(r.status).toBe(400)
    expect(r.error).toBe(MISSING)
    expect(r.tournament).toBeNull()
    expect(r.id).toBe('ABCD')
    expect(seen.table, 'the database must not be read before the missing-token 400').toBeUndefined()
  })

  it('beats the 404 — a missing token on a nonexistent code still 400s', async () => {
    const r = await assertTournamentHostAny(mockSupabase(null), 'abcd', '', { missingTokenError: MISSING })
    expect(r.status).toBe(400)
    expect(r.error).toBe(MISSING)
  })

  it('does not fire for a present-but-wrong token', async () => {
    const r = await assertTournamentHostAny(mockSupabase(tournament('waiting')), 'abcd', 'wrong', {
      missingTokenError: MISSING,
    })
    expect(r.status).toBe(403)
    expect(r.error).toBe('Unauthorized')
  })

  it('is opt-in: without it a missing token falls through the normal ladder', async () => {
    const r = await assertTournamentHostAny(mockSupabase(tournament('waiting')), 'abcd', '')
    expect(r.status).toBe(403)
    expect(r.error).toBe('Unauthorized')

    const missingTournament = await assertTournamentHostAny(mockSupabase(null), 'abcd', '')
    expect(missingTournament.status).toBe(404) // 404 still beats the bad token
  })

  it('composes with a status gate, and still precedes it', async () => {
    const r = await assertTournamentHostUnfinished(mockSupabase(tournament('finished')), 'abcd', '', 'ended', {
      missingTokenError: MISSING,
    })
    expect(r.status).toBe(400)
    expect(r.error).toBe(MISSING)
  })
})

/**
 * The order matters more than any single rung: a caller with no valid token must not be able
 * to tell a nonexistent tournament code from a real one, nor learn a real tournament's state.
 */
describe('host failure ladder order', () => {
  it('missing tournament beats a bad token (404, not 403)', async () => {
    for (const call of [
      assertTournamentHostAny(mockSupabase(null), 'abcd', 'wrong-token'),
      assertTournamentHostUnfinished(mockSupabase(null), 'abcd', 'wrong-token', 'Tournament has ended'),
      assertTournamentHostWith(mockSupabase(null), 'abcd', 'wrong-token', {
        allowedStatuses: ['waiting'],
        statusError: 'nope',
      }),
    ]) {
      const r = await call
      expect(r.status).toBe(404)
      expect(r.error).toBe('Tournament not found')
      expect(r.tournament).toBeNull()
    }
  })

  it('bad token beats a bad status (403, not 400 — the status never leaks)', async () => {
    const r = await assertTournamentHostWith(mockSupabase(tournament('finished')), 'abcd', 'wrong-token', {
      allowedStatuses: ['waiting'],
      statusError: 'Tournament has ended',
    })
    expect(r.status).toBe(403)
    expect(r.error).toBe('Unauthorized')
    expect(r.tournament).toBeNull()
  })

  it('the full ladder in one sweep: missing token → 404 → 403 → 400 → 200', async () => {
    const gate = { allowedStatuses: ['waiting'], statusError: 'bad status', missingTokenError: 'Missing hostToken' }
    expect((await assertTournamentHostWith(mockSupabase(null), 'abcd', '', gate)).status).toBe(400)
    expect((await assertTournamentHostWith(mockSupabase(null), 'abcd', 'x', gate)).status).toBe(404)
    expect((await assertTournamentHostWith(mockSupabase(tournament('waiting')), 'abcd', 'x', gate)).status).toBe(403)
    expect((await assertTournamentHostWith(mockSupabase(tournament('active')), 'abcd', TOKEN, gate)).status).toBe(400)
    expect((await assertTournamentHostWith(mockSupabase(tournament('waiting')), 'abcd', TOKEN, gate)).status).toBe(200)
  })
})

/**
 * The host token is compared with `secretMatches` (constant time), as `[code]/restart`
 * already does. Its one behavioural difference from `!==` is that an absent supplied token
 * no longer matches an absent stored value. `tournaments.host_token` is `text not null`
 * (migration 0097_tournaments.sql, never relaxed) and every write mints one, so that case is
 * unreachable — but "" authorizing a host would be a total bypass, so it is pinned.
 */
describe('host token comparison', () => {
  it.each([
    ['null stored', null],
    ['undefined stored', undefined],
    ['empty stored', ''],
  ])('403s an empty supplied token against a %s token', async (_label, stored) => {
    for (const supplied of ['', null, undefined]) {
      const r = await assertTournamentHostAny(
        mockSupabase({ id: 'ABCD', host_token: stored, status: 'waiting' }),
        'abcd',
        supplied
      )
      expect(r.status).toBe(403)
      expect(r.error).toBe('Unauthorized')
      expect(r.tournament).toBeNull()
    }
  })

  it('403s a real supplied token against a null stored one', async () => {
    const r = await assertTournamentHostAny(
      mockSupabase({ id: 'ABCD', host_token: null, status: 'waiting' }),
      'abcd',
      TOKEN
    )
    expect(r.status).toBe(403)
  })

  it('still authorizes an exact token match', async () => {
    const r = await assertTournamentHostAny(mockSupabase(tournament('waiting')), 'abcd', TOKEN)
    expect(r.status).toBe(200)
    expect(r.tournament).not.toBeNull()
  })

  it.each([
    ['a prefix of the stored token', TOKEN.slice(0, -1)],
    ['the stored token plus a suffix', `${TOKEN}x`],
    ['a case-flipped token', TOKEN.toUpperCase()],
    ['a whitespace-padded token', ` ${TOKEN} `],
  ])('rejects %s', async (_label, supplied) => {
    const r = await assertTournamentHostAny(mockSupabase(tournament('waiting')), 'abcd', supplied)
    expect(r.status).toBe(403)
    expect(r.error).toBe('Unauthorized')
  })
})
