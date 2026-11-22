import { describe, expect, it, vi } from 'vitest'
import { createSessionCoordinator, resolveSessionAgainstRoster } from './session-coordinator'

type Session = { playerId: string }

function setup(initial: Session | null) {
  const coordinator = createSessionCoordinator()
  const store = { session: initial }
  const clear = vi.fn(async () => {
    store.session = null
  })
  const readSession = async () => store.session
  const save = (id: string) =>
    coordinator.mutate(async () => {
      store.session = { playerId: id }
    })
  return { coordinator, store, clear, readSession, save }
}

const has = (roster: string[], id: string) => roster.includes(id)

describe('resolveSessionAgainstRoster', () => {
  it('roster read starts before the session save and returns without P -> no clear, fresh roster read', async () => {
    const { coordinator, store, clear, readSession, save } = setup(null)
    const reads: Array<(r: string[]) => void> = []
    const readRoster = vi.fn(() => new Promise<string[]>((r) => reads.push(r)))
    const result = resolveSessionAgainstRoster(coordinator, { readSession, readRoster, rosterHasPlayer: has, clear })
    await vi.waitFor(() => expect(reads).toHaveLength(1)) // read #1 in flight (started before join's insert)
    await save('P') // join inserts P, then saves the session while the read is in flight
    reads[0](['other']) // the old roster arrives without P
    await vi.waitFor(() => expect(reads).toHaveLength(2)) // overtaken: a fresh roster is read
    reads[1](['other', 'P'])
    await expect(result).resolves.toEqual({ session: { playerId: 'P' }, roster: ['other', 'P'] })
    expect(clear).not.toHaveBeenCalled()
    expect(store.session).toEqual({ playerId: 'P' })
  })

  it('session replaced between the check and the delete -> no clear (saves serialize with the clear)', async () => {
    const { coordinator, store, clear, save } = setup({ playerId: 'old' })
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    // readSession inside the exclusive check is slow, so a save tries to slip in between check and delete.
    let calls = 0
    const readSession = async () => {
      calls += 1
      if (calls === 2) await gate // the re-read inside clearIfStillMissing
      return store.session
    }
    const result = resolveSessionAgainstRoster(coordinator, {
      readSession,
      readRoster: async () => ['other'],
      rosterHasPlayer: has,
      clear,
    })
    await vi.waitFor(() => expect(calls).toBe(2))
    const saving = save('new') // queued behind the exclusive check
    release()
    const out = await result
    await saving
    // The check saw 'old' still stored and cleared it BEFORE the save ran; the save then wrote 'new'.
    // Either order is safe; what must never happen is the clear removing 'new'.
    expect(store.session).toEqual({ playerId: 'new' })
    expect(out?.session === null || out?.session?.playerId === 'new').toBe(true)
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('a save that lands before the exclusive check turns the check into a no-op', async () => {
    const { coordinator, store, clear, readSession, save } = setup({ playerId: 'old' })
    const readEpoch = coordinator.epoch()
    await save('new')
    await expect(
      coordinator.clearIfStillMissing({ readEpoch, savedPlayerId: 'old', readSession, clear })
    ).resolves.toBe('stale')
    expect(clear).not.toHaveBeenCalled()
    expect(store.session).toEqual({ playerId: 'new' })
  })

  it('a different stored session at check time is replaced, not cleared', async () => {
    const { coordinator, store, clear, readSession } = setup({ playerId: 'other-session' })
    await expect(
      coordinator.clearIfStillMissing({
        readEpoch: coordinator.epoch(),
        savedPlayerId: 'old',
        readSession,
        clear,
      })
    ).resolves.toBe('replaced')
    expect(clear).not.toHaveBeenCalled()
    expect(store.session).toEqual({ playerId: 'other-session' })
  })

  it('same session absent from a roster read entirely after it was set -> cleared', async () => {
    const { coordinator, store, clear, readSession, save } = setup(null)
    await save('P') // session set before the roster read starts
    const result = await resolveSessionAgainstRoster(coordinator, {
      readSession,
      readRoster: async () => ['other'],
      rosterHasPlayer: has,
      clear,
    })
    expect(result).toEqual({ session: null, roster: ['other'] })
    expect(clear).toHaveBeenCalledTimes(1)
    expect(store.session).toBeNull()
  })

  it('keeps the session when the roster contains the player', async () => {
    const { coordinator, clear, readSession, save } = setup(null)
    await save('P')
    const result = await resolveSessionAgainstRoster(coordinator, {
      readSession,
      readRoster: async () => ['P'],
      rosterHasPlayer: has,
      clear,
    })
    expect(result?.session).toEqual({ playerId: 'P' })
    expect(clear).not.toHaveBeenCalled()
  })

  it('gives up without clearing when every attempt is overtaken by a session change', async () => {
    const { coordinator, store, clear, readSession, save } = setup({ playerId: 'P' })
    let n = 0
    const readRoster = async () => {
      n += 1
      await save('P') // a session change overlaps every read
      return ['other']
    }
    const result = await resolveSessionAgainstRoster(coordinator, {
      readSession,
      readRoster,
      rosterHasPlayer: has,
      clear,
      maxAttempts: 3,
    })
    expect(n).toBe(3)
    expect(clear).not.toHaveBeenCalled()
    expect(result?.session).toEqual({ playerId: 'P' })
    expect(store.session).toEqual({ playerId: 'P' })
  })

  it('returns null when the roster read fails', async () => {
    const { coordinator, clear, readSession } = setup({ playerId: 'P' })
    await expect(
      resolveSessionAgainstRoster(coordinator, {
        readSession,
        readRoster: async () => null,
        rosterHasPlayer: has,
        clear,
      })
    ).resolves.toBeNull()
    expect(clear).not.toHaveBeenCalled()
  })
})
