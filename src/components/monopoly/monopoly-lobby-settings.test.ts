import { describe, it, expect } from 'vitest'
import { boardGameLobbySettingsSchema } from '@/lib/validation'

describe('Monopoly Lobby Settings validation', () => {
  it('successfully parses monopoly_board_size: 48 with only gameId and hostToken', () => {
    const raw = {
      gameId: 'ALHF9K',
      hostToken: 'mock-host-token-123',
      monopoly_board_size: 48,
    }
    const result = boardGameLobbySettingsSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.monopoly_board_size).toBe(48)
    }
  })

  it('successfully parses monopoly_board_size: 40 with only gameId and hostToken', () => {
    const raw = {
      gameId: 'ALHF9K',
      hostToken: 'mock-host-token-123',
      monopoly_board_size: 40,
    }
    const result = boardGameLobbySettingsSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.monopoly_board_size).toBe(40)
    }
  })

  it('rejects invalid monopoly_board_size numbers like 32 or 50', () => {
    const raw = {
      gameId: 'ALHF9K',
      hostToken: 'mock-host-token-123',
      monopoly_board_size: 32,
    }
    const result = boardGameLobbySettingsSchema.safeParse(raw)
    expect(result.success).toBe(false)
  })
})
