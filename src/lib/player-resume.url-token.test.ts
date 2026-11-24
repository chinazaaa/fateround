// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Stored = { playerId: string; playerName: string; playerGender: 'both'; resumeToken: string | null } | null
let stored: Stored = null
const clearPlayerSession = vi.fn(() => {
  stored = null
})

vi.mock('@/lib/utils', () => ({
  clearPlayerSession: (...args: unknown[]) => clearPlayerSession(...(args as [])),
  getPlayerSession: () => stored,
  normalizeResumeToken: (t: string) => t.trim().toUpperCase(),
  setPlayerSession: vi.fn(),
}))
vi.mock('@/lib/poll-host-mode', () => ({ setPollHostMode: vi.fn() }))

import { resolvePlayerSession } from './player-resume'

const session = (id: string, token: string | null = `TOK-${id}`) => ({
  playerId: id,
  playerName: id,
  playerGender: 'both' as const,
  resumeToken: token,
})

function mockResume(status: number, during?: () => void) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      during?.()
      return { ok: status >= 200 && status < 300, status, json: async () => ({}) }
    })
  )
}

beforeEach(() => {
  stored = null
  clearPlayerSession.mockClear()
  window.history.replaceState({}, '', '/play/ABCD?player=TOK-OLD')
})

describe('resolvePlayerSession: URL token confirmed gone (404)', () => {
  it('clears the stored session that belongs to the dead link and does not fall back to it', async () => {
    stored = session('old', 'TOK-OLD')
    mockResume(404)
    await expect(resolvePlayerSession('ABCD', [])).resolves.toBeNull()
    expect(clearPlayerSession).toHaveBeenCalledTimes(1)
    expect(window.location.search).toBe('')
  })

  it('matches the stored token case-insensitively', async () => {
    stored = session('old', 'tok-old')
    mockResume(404)
    await resolvePlayerSession('ABCD', [])
    expect(clearPlayerSession).toHaveBeenCalledTimes(1)
  })

  it('does NOT clear a newer session a join saved while the probe was in flight', async () => {
    stored = session('old', 'TOK-OLD')
    mockResume(404, () => {
      stored = session('fresh', 'TOK-FRESH')
    })
    // The stale link still resolves to null (no localStorage fallback) and is stripped from the URL...
    await expect(resolvePlayerSession('ABCD', [])).resolves.toBeNull()
    expect(window.location.search).toBe('')
    // ...but the new seat survives.
    expect(clearPlayerSession).not.toHaveBeenCalled()
    expect(stored?.playerId).toBe('fresh')
  })

  it('still clears (marks kicked) when nothing is stored', async () => {
    mockResume(404)
    await expect(resolvePlayerSession('ABCD', [])).resolves.toBeNull()
    expect(clearPlayerSession).toHaveBeenCalledTimes(1)
  })
})
