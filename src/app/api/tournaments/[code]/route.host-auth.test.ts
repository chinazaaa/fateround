import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  HOST_TOKEN,
  WRONG_TOKEN,
  codeParams,
  jsonRequest,
  makeSupabaseStub,
  tournamentRow,
} from '@/test-support/tournament-host-auth'

/**
 * Authorization contract for PATCH /api/tournaments/[code].
 *
 * This route has NO status gate in its ladder — its status checks are CONDITIONAL, applied
 * only to the fields being edited (lives, game settings) and sitting below the 403. The
 * conditional gates and the playlist's format gate are pinned here together, including the
 * combination of a wrong format with a rejected status, so their order stays where it is.
 */

vi.mock('server-only', () => ({}))

let tournament: Record<string, unknown> | null = tournamentRow({ status: 'waiting' })

function stub() {
  return makeSupabaseStub({
    tournaments: () => ({ data: tournament, error: null }),
    tournament_players: () => ({ data: null, count: 0, error: null }),
    tournament_games: () => ({ data: null, count: 0, error: null }),
  })
}

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => stub() }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => stub() }))

// Only reached on an accepted game-settings edit, which none of these cases performs, and
// importing it for real drags in the Scrabble dictionary — seconds of load for dead code here.
vi.mock('@/lib/tournament-game-config', () => ({ buildTournamentGameConfig: vi.fn(() => ({})) }))

type Patch = typeof import('./route').PATCH
let PATCH: Patch

const LIVES = { mode: 'lives', startingLives: 3, livesLostRule: 'bottom-n', eliminateCount: 1 }

beforeEach(async () => {
  tournament = tournamentRow({ status: 'waiting' })
  ;({ PATCH } = await import('./route'))
})

async function patch(body: unknown) {
  const res = await PATCH(jsonRequest('/api/tournaments/abcd', body, 'PATCH'), codeParams())
  return { status: res.status, body: await res.json() }
}

describe('PATCH /api/tournaments/[code] host authorization', () => {
  it('rejects a body with no hostToken at the schema, before any lookup', async () => {
    const res = await patch({ title: 'New name' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid input: expected string, received undefined' })
  })

  it('rejects an empty hostToken at the schema', async () => {
    const res = await patch({ hostToken: '', title: 'New name' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'hostToken is required' })
  })

  it('404s when the tournament does not exist', async () => {
    tournament = null
    const res = await patch({ hostToken: HOST_TOKEN, title: 'New name' })
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Tournament not found' })
  })

  it('403s on a wrong host token', async () => {
    const res = await patch({ hostToken: WRONG_TOKEN, title: 'New name' })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('403s on a wrong token ahead of every conditional gate below it', async () => {
    tournament = tournamentRow({ status: 'active', format: 'head-to-head' })
    const res = await patch({ hostToken: WRONG_TOKEN, eliminationConfig: LIVES, gameQueue: [{ gameType: 'trivia' }] })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it.each(['active', 'scheduled', 'finished'])('400s on a lives edit while the tournament is %s', async (status) => {
    tournament = tournamentRow({ status })
    const res = await patch({ hostToken: HOST_TOKEN, eliminationConfig: LIVES })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Lives settings can only be changed before the first game starts' })
  })

  it('400s on a game-settings edit once the tournament has left waiting', async () => {
    tournament = tournamentRow({ status: 'active' })
    const res = await patch({ hostToken: HOST_TOKEN, gameConfig: { roundsCount: 5 } })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Game settings can only be changed before the first game starts' })
  })

  it('400s on a playlist edit for a non-round-robin tournament', async () => {
    tournament = tournamentRow({ format: 'head-to-head' })
    const res = await patch({ hostToken: HOST_TOKEN, gameQueue: [{ gameType: 'trivia' }] })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Playlists only apply to round-robin tournaments' })
  })

  it('400s on an ineligible game type inside the playlist', async () => {
    const res = await patch({ hostToken: HOST_TOKEN, gameQueue: [{ gameType: 'chess' }] })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Game "chess" isn\'t available for tournament playlists' })
  })

  it('answers the LIVES status gate, not the playlist format gate, when both would reject', async () => {
    // The precedence-pinning case: a wrong format for the playlist AND a status that blocks
    // the lives edit. The lives gate is written first, so it answers.
    tournament = tournamentRow({ status: 'active', format: 'head-to-head' })
    const res = await patch({ hostToken: HOST_TOKEN, eliminationConfig: LIVES, gameQueue: [{ gameType: 'chess' }] })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Lives settings can only be changed before the first game starts' })
  })

  it.each(['waiting', 'active', 'scheduled', 'finished'])(
    'passes authorization for a plain title edit whatever the status is (%s)',
    async (status) => {
      tournament = tournamentRow({ status })
      const res = await patch({ hostToken: HOST_TOKEN, title: 'New name' })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ success: true })
    }
  )
})
