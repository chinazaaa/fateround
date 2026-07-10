import { describe, expect, it } from 'vitest'
import { phaseForTurn } from './monopoly'
import type { MonopolyBoard, MonopolyPlayerState } from '@/types'

describe('monopoly jail state transitions', () => {
  it('phaseForTurn respects inJailOverride when player leaves jail on their turn', () => {
    const board = {
      game_id: 'game-1',
      phase: 'jail',
      turn_order: ['player-1'],
      current_turn_index: 0,
      property_owners: {},
      property_buildings: {},
      mortgaged_properties: {},
      houses_in_bank: 32,
      hotels_in_bank: 12,
      chance_deck: [],
      community_deck: [],
      chance_discard: [],
      community_discard: [],
      updated_at: '2026-01-01T00:00:00.000Z',
    } as unknown as MonopolyBoard

    const states = [
      {
        game_id: 'game-1',
        player_id: 'player-1',
        cash: 1500,
        position: 10,
        in_jail: true,
        jail_turns: 2,
        get_out_of_jail_free: 0,
        passed_go_once: true,
        bankrupt: false,
      } as unknown as MonopolyPlayerState,
    ]

    // Without override, it would inspect stale states and return 'jail'
    expect(phaseForTurn(board, states, 0)).toBe('jail')

    // With override indicating the player just left jail, it returns 'roll'
    expect(phaseForTurn(board, states, 0, { playerId: 'player-1', inJail: false })).toBe('roll')
  })
})
