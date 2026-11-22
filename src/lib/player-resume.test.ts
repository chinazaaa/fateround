import { beforeEach, describe, expect, it, vi } from 'vitest'

type Stored = { playerId: string; playerName: string; playerGender: 'both'; resumeToken: string | null } | null
let stored: Stored = null
const clearPlayerSession = vi.fn(() => {
  stored = null
})

vi.mock('@/lib/utils', () => ({
  clearPlayerSession: (...args: unknown[]) => clearPlayerSession(...(args as [])),
  getPlayerSession: () => stored,
  normalizeResumeToken: (t: string) => t,
  setPlayerSession: vi.fn(),
}))
vi.mock('@/lib/poll-host-mode', () => ({ setPollHostMode: vi.fn() }))

import { resolvePlayerSession } from './player-resume'

const session = (id: string) => ({
  playerId: id,
  playerName: id,
  playerGender: 'both' as const,
  resumeToken: `tok-${id}`,
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
})

describe('resolvePlayerSession — stale roster, server confirms player gone', () => {
  const roster = [{ id: 'other', name: 'x', gender: 'both' }]

  it('clears the session when it is still the checked player', async () => {
    stored = session('p1')
    mockResume(404)
    await expect(resolvePlayerSession('ABCD', roster)).resolves.toBeNull()
    expect(clearPlayerSession).toHaveBeenCalledTimes(1)
  })

  it('keeps a session saved during the check (join raced the probe) and does not clear it', async () => {
    stored = session('p1')
    mockResume(404, () => {
      stored = session('p2') // the user joined while the probe was in flight
    })
    const result = await resolvePlayerSession('ABCD', roster)
    expect(result?.playerId).toBe('p2')
    expect(clearPlayerSession).not.toHaveBeenCalled()
    expect(stored?.playerId).toBe('p2')
  })

  it('keeps the session when the server confirms or the probe is inconclusive', async () => {
    stored = session('p1')
    mockResume(200)
    expect((await resolvePlayerSession('ABCD', roster))?.playerId).toBe('p1')
    mockResume(500)
    expect((await resolvePlayerSession('ABCD', roster))?.playerId).toBe('p1')
    expect(clearPlayerSession).not.toHaveBeenCalled()
  })
})
