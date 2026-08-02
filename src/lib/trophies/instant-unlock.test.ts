import { describe, expect, it, vi } from 'vitest'
import { INSTANT_TROPHY_IDS } from './system-catalog'
import { unlockNow } from './instant-unlock'

/**
 * `unlockNow` is called from gameplay handlers, so its two jobs are to be impossible to misuse
 * and impossible to break a turn with.
 */
function db() {
  const upserts: unknown[] = []
  return {
    upserts,
    client: {
      from: () => ({
        upsert: (row: unknown) => {
          upserts.push(row)
          return Promise.resolve({ error: null })
        },
      }),
    } as never,
  }
}

describe('unlockNow', () => {
  it('records a trophy declared instant-eligible', async () => {
    const id = [...INSTANT_TROPHY_IDS][0]
    expect(id, 'no trophy is marked instant — the flag is doing nothing').toBeTruthy()
    const d = db()
    await unlockNow(d.client, 'GAME01', 'player-1', id)
    expect(d.upserts).toHaveLength(1)
  })

  it('refuses a trophy that is not instant-eligible', async () => {
    // Without this a finish-derived trophy could be made to pop early, showing a toast for
    // something the counters might never grant.
    const d = db()
    await unlockNow(d.client, 'GAME01', 'player-1', 'trivia.sys.flawless_victory')
    expect(d.upserts).toHaveLength(0)
  })

  it('does nothing without a player', async () => {
    const d = db()
    await unlockNow(d.client, 'GAME01', null, [...INSTANT_TROPHY_IDS][0])
    expect(d.upserts).toHaveLength(0)
  })

  it('never throws when the write fails — a trophy must not break a turn', async () => {
    const client = { from: () => ({ upsert: () => Promise.reject(new Error('down')) }) } as never
    await expect(unlockNow(client, 'GAME01', 'player-1', [...INSTANT_TROPHY_IDS][0])).resolves.toBeUndefined()
  })

  it('only names ids that exist in the catalog', async () => {
    const { buildSystemCatalog } = await import('./system-catalog')
    const ids = new Set(buildSystemCatalog().map((t) => t.id))
    for (const id of INSTANT_TROPHY_IDS) expect(ids.has(id), `${id} is not a real trophy`).toBe(true)
  })
})
