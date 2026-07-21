// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from './utils'

// ── Group 6: Session & Identity ─────────────────────────────────────────────

const GAME_CODE = 'ABCD'
const PLAYER_ID = 'p1'
const PLAYER_NAME = 'Alice'
const RESUME_TOKEN = 'tk_abc123'

const store: Record<string, string> = {}
const mockLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => {
    store[key] = val
  },
  removeItem: (key: string) => {
    delete store[key]
  },
  clear: () => {
    for (const k in store) delete store[k]
  },
}

beforeEach(() => {
  vi.stubGlobal('localStorage', mockLocalStorage)
  mockLocalStorage.clear()
})

afterEach(() => {
  mockLocalStorage.clear()
})

describe('getPlayerSession / setPlayerSession / clearPlayerSession', () => {
  it('returns null when no session is stored', () => {
    expect(getPlayerSession(GAME_CODE)).toBeNull()
  })

  it('returns stored session data after setPlayerSession', () => {
    setPlayerSession(GAME_CODE, PLAYER_ID, PLAYER_NAME, 'male', RESUME_TOKEN)
    const session = getPlayerSession(GAME_CODE)
    expect(session).not.toBeNull()
    expect(session!.playerId).toBe(PLAYER_ID)
    expect(session!.playerName).toBe(PLAYER_NAME)
  })

  it('clearPlayerSession removes the stored data', () => {
    setPlayerSession(GAME_CODE, PLAYER_ID, PLAYER_NAME, 'male', RESUME_TOKEN)
    clearPlayerSession(GAME_CODE)
    expect(getPlayerSession(GAME_CODE)).toBeNull()
  })

  it('getPlayerSession is read before clearPlayerSession destroys it', () => {
    // Regression test: save session, read it, then clear — read should return data
    // captured before the clear.
    setPlayerSession(GAME_CODE, PLAYER_ID, PLAYER_NAME, 'male', RESUME_TOKEN)
    const beforeClear = getPlayerSession(GAME_CODE)
    clearPlayerSession(GAME_CODE)
    expect(beforeClear).not.toBeNull()
    expect(beforeClear!.playerId).toBe(PLAYER_ID)
    expect(getPlayerSession(GAME_CODE)).toBeNull()
  })

  it('handles different game codes independently', () => {
    setPlayerSession('ABCD', 'p1', 'Alice', 'female', 'tok1')
    setPlayerSession('WXYZ', 'p2', 'Bob', 'male', 'tok2')

    const sessionA = getPlayerSession('ABCD')
    const sessionB = getPlayerSession('WXYZ')
    expect(sessionA!.playerId).toBe('p1')
    expect(sessionB!.playerId).toBe('p2')
    expect(sessionA!.playerName).toBe('Alice')
    expect(sessionB!.playerName).toBe('Bob')
  })

  it('getPlayerSession returns null for malformed JSON', () => {
    localStorage.setItem('kmk_player_ABCD', 'not-json')
    expect(getPlayerSession(GAME_CODE)).toBeNull()
  })

  it('returned resumeToken is normalized', () => {
    setPlayerSession(GAME_CODE, PLAYER_ID, PLAYER_NAME, 'male', '  TOK_ABC  ')
    const session = getPlayerSession(GAME_CODE)
    expect(session?.resumeToken).toBe('TOKABC')
  })
})
