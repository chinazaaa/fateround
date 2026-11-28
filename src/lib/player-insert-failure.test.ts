import { describe, expect, it, vi } from 'vitest'
import { playerInsertFailure } from './player-insert-failure'

describe('playerInsertFailure', () => {
  it('the join trigger refusing a game its host ended is a 409 closed-session answer', async () => {
    const res = playerInsertFailure({
      message: 'game_finished: cannot seat a player in a game its host ended',
      code: 'P0001',
    })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'This session has ended' })
  })

  it.each([
    [{ message: 'duplicate key value violates unique constraint', code: '23505' }],
    [{ message: 'connection reset' }],
    [null],
  ])('every other failure stays an internal 500 with the generic message: %j', async (error) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const res = playerInsertFailure(error)
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: 'Something went wrong. Please try again.' })
    } finally {
      log.mockRestore()
    }
  })
})
