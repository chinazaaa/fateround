import { describe, it, expect } from 'vitest'
import { PLAYER_JOIN_LOBBY_FULL_CODE, PLAYER_JOIN_NAME_TAKEN_CODE, playerJoinRejection } from '@/lib/player-join-errors'

describe('playerJoinRejection', () => {
  it('maps the trigger SQLSTATEs', () => {
    expect(playerJoinRejection({ code: PLAYER_JOIN_LOBBY_FULL_CODE, message: 'x' })).toBe('lobby_full')
    expect(playerJoinRejection({ code: PLAYER_JOIN_NAME_TAKEN_CODE, message: 'x' })).toBe('name_taken')
    expect(PLAYER_JOIN_LOBBY_FULL_CODE).toBe('PJ001')
    expect(PLAYER_JOIN_NAME_TAKEN_CODE).toBe('PJ002')
  })

  it('falls back to the trigger message when the code is dropped', () => {
    expect(playerJoinRejection({ message: 'players_join_lobby_full' })).toBe('lobby_full')
    expect(playerJoinRejection({ message: 'players_join_name_taken' })).toBe('name_taken')
  })

  it('ignores every other failure', () => {
    expect(playerJoinRejection(null)).toBeNull()
    expect(playerJoinRejection(undefined)).toBeNull()
    expect(playerJoinRejection('PJ001')).toBeNull()
    expect(playerJoinRejection({ code: '23505', message: 'duplicate key' })).toBeNull()
    expect(playerJoinRejection({ code: '23503', message: 'players_join_lobby_full_not' })).toBeNull()
  })
})
