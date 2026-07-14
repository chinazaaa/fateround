import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { incrementTournamentPointsBatch, applyTournamentLifeLoss } from '@/lib/tournament-scoring'

const rpc = vi.fn()
const supabase = { rpc } as unknown as SupabaseClient

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null })
})

describe('incrementTournamentPointsBatch', () => {
  it('sends every player in a single batched RPC with the {player_id, points} shape', async () => {
    await incrementTournamentPointsBatch(supabase, { a: 10, b: 7, c: 0 })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('increment_tournament_points_batch', {
      p_updates: [
        { player_id: 'a', points: 10 },
        { player_id: 'b', points: 7 },
        { player_id: 'c', points: 0 }, // zero-point placements still count a game
      ],
    })
  })

  it('is a no-op (no RPC) for an empty points map', async () => {
    await incrementTournamentPointsBatch(supabase, {})
    expect(rpc).not.toHaveBeenCalled()
  })

  it('swallows an RPC error without throwing', async () => {
    rpc.mockResolvedValue({ error: { message: 'boom' } })
    await expect(incrementTournamentPointsBatch(supabase, { a: 5 })).resolves.toBeUndefined()
  })
})

describe('applyTournamentLifeLoss', () => {
  it('sends all bottom-N ids in a single batched RPC', async () => {
    await applyTournamentLifeLoss(supabase, ['p1', 'p2'])
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('apply_tournament_life_loss', { p_player_ids: ['p1', 'p2'] })
  })

  it('is a no-op (no RPC) for an empty id list', async () => {
    await applyTournamentLifeLoss(supabase, [])
    expect(rpc).not.toHaveBeenCalled()
  })

  it('swallows an RPC error without throwing', async () => {
    rpc.mockResolvedValue({ error: { message: 'boom' } })
    await expect(applyTournamentLifeLoss(supabase, ['p1'])).resolves.toBeUndefined()
  })
})
