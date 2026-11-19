import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { makeSupabaseStub } from '@/test-support/host-auth'
import { persistRandomizedRoles, reconcileCodewordsTeamAfterRemoval } from './codewords'

vi.mock('server-only', () => ({}))

const UNIQUE = { code: '23505', message: 'duplicate key value violates unique constraint' }

describe('reconcileCodewordsTeamAfterRemoval — lost promotion race', () => {
  const roster = [
    { player_id: 'op-1', team: 'red', role: 'operative' },
    { player_id: 'op-2', team: 'red', role: 'operative' },
  ]

  function client(promoteError: { code: string; message: string } | null) {
    return makeSupabaseStub({
      codewords_boards: () => ({ data: { id: 'b1', winner: null }, error: null }),
      codewords_player_roles: ({ op }) =>
        op === 'update' ? { data: null, error: promoteError } : { data: roster, error: null },
    }) as unknown as SupabaseClient
  }

  it('treats a unique-index rejection as a filled seat, not an error', async () => {
    const result = await reconcileCodewordsTeamAfterRemoval(client(UNIQUE), 'ABCD', 'red')
    expect(result.error).toBeNull()
    expect(result.outcome).toEqual({ ended: false })
  })

  it('still reports other promotion errors', async () => {
    const result = await reconcileCodewordsTeamAfterRemoval(client({ code: '23503', message: 'fk' }), 'ABCD', 'red')
    expect(result.error).not.toBeNull()
  })

  it('promotes an operative when the seat is really empty', async () => {
    const result = await reconcileCodewordsTeamAfterRemoval(client(null), 'ABCD', 'red')
    expect(result.error).toBeNull()
    expect(result.outcome.promotedPlayerId).toMatch(/^op-/)
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
