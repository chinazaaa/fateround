import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))

import { processMonopolyTradePropose } from './monopoly'

const none = { cash: 0, properties: [] as number[], getOutCards: 0 }

describe('processMonopolyTradePropose', () => {
  it('rejects a trade proposed to yourself before reading any game state', async () => {
    // A self-trade used to be accepted and parked in the game's single pending-trade slot, which
    // blocked every other player from proposing until it expired.
    const from = vi.fn(() => {
      throw new Error('the database must not be touched for a self-trade')
    })
    const client = { from } as unknown as SupabaseClient

    const res = await processMonopolyTradePropose(
      client,
      'ABCD',
      'player-1',
      'player-1',
      { ...none, cash: 10 },
      { ...none, cash: 5 }
    )

    expect(res).toEqual({ error: 'You cannot trade with yourself' })
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects a self-trade written with an uppercase copy of your own player id', async () => {
    // The route validates toPlayerId as a UUID (case-insensitive) and forwards it unchanged, and the
    // player_id column is a uuid, so an uppercase copy resolves to the same player.
    const from = vi.fn(() => {
      throw new Error('the database must not be touched for a self-trade')
    })
    const client = { from } as unknown as SupabaseClient
    const id = '3f2b8c1e-5a4d-4e6f-9a7b-0c1d2e3f4a5b'

    const res = await processMonopolyTradePropose(
      client,
      'ABCD',
      id,
      id.toUpperCase(),
      { ...none, cash: 10 },
      { ...none, cash: 5 }
    )

    expect(res).toEqual({ error: 'You cannot trade with yourself' })
    expect(from).not.toHaveBeenCalled()
  })
})
