import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSessionCoordinator,
  getSessionCoordinator,
  resetSessionCoordinatorsForTests,
  resolveSessionAgainstRoster,
} from './session-coordinator'

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

describe('per-room coordinator registry', () => {
  beforeEach(() => resetSessionCoordinatorsForTests())

  /** A tiny stand-in for secure-session: every writer goes through the room's shared coordinator. */
  function fakeStore(room: string) {
    const store: { session: Session | null } = { session: null }
    return {
      store,
      read: async () => store.session,
      // what setPlayerSession does in the app
      write: (id: string) =>
        getSessionCoordinator(room).mutate(async () => {
          store.session = { playerId: id }
        }),
      // the raw delete used inside the coordinator's own exclusive step
      rawDelete: async () => {
        store.session = null
      },
    }
  }

  it('returns one shared instance per room, case-insensitively, and distinct ones per room', () => {
    expect(getSessionCoordinator('abcd')).toBe(getSessionCoordinator('ABCD'))
    expect(getSessionCoordinator('ABCD')).not.toBe(getSessionCoordinator('WXYZ'))
  })

  it("an OLD view's pending clear cannot delete a session a NEW view/writer saved (same room entry)", async () => {
    const room = fakeStore('ABCD')
    room.store.session = { playerId: 'ghost' }
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let slowClearStarted = false
    const oldView = resolveSessionAgainstRoster(getSessionCoordinator('ABCD'), {
      readSession: room.read,
      readRoster: async () => ['other'],
      rosterHasPlayer: has,
      clear: async () => {
        slowClearStarted = true
        await gate
        await room.rawDelete()
      },
    })
    await vi.waitFor(() => expect(slowClearStarted).toBe(true))
    const save = room.write('P-new') // new view / join flow saves while the old clear is running
    release()
    await oldView
    await save
    expect(room.store.session).toEqual({ playerId: 'P-new' }) // the save ran AFTER the clear and survived
  })

  it('a clear started by an unmounted view is a no-op (proceed() false)', async () => {
    const room = fakeStore('ABCD')
    room.store.session = { playerId: 'ghost' }
    const result = await resolveSessionAgainstRoster(getSessionCoordinator('ABCD'), {
      readSession: room.read,
      readRoster: async () => ['other'],
      rosterHasPlayer: has,
      clear: room.rawDelete,
      proceed: () => false, // unmounted
    })
    expect(room.store.session).toEqual({ playerId: 'ghost' })
    expect(result?.session).toEqual({ playerId: 'ghost' })
  })

  it('different rooms do not block each other', async () => {
    const a = fakeStore('ROOMA')
    const b = fakeStore('ROOMB')
    a.store.session = { playerId: 'ghost' }
    let releaseA!: () => void
    const gateA = new Promise<void>((r) => (releaseA = r))
    let aStarted = false
    const aView = resolveSessionAgainstRoster(getSessionCoordinator('ROOMA'), {
      readSession: a.read,
      readRoster: async () => ['other'],
      rosterHasPlayer: has,
      clear: async () => {
        aStarted = true
        await gateA
        await a.rawDelete()
      },
    })
    await vi.waitFor(() => expect(aStarted).toBe(true))
    await b.write('P-b') // room B completes while room A is blocked mid-clear
    expect(b.store.session).toEqual({ playerId: 'P-b' })
    releaseA()
    await aView
  })

  it('an outside writer (autoJoin-style save) is serialized with the view clear', async () => {
    const room = fakeStore('ABCD')
    room.store.session = { playerId: 'ghost' }
    const order: string[] = []
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const view = resolveSessionAgainstRoster(getSessionCoordinator('ABCD'), {
      readSession: room.read,
      readRoster: async () => ['other'],
      rosterHasPlayer: has,
      clear: async () => {
        order.push('clear-start')
        await gate
        await room.rawDelete()
        order.push('clear-end')
      },
    })
    await vi.waitFor(() => expect(order).toEqual(['clear-start']))
    const writer = room.write('P-join').then(() => order.push('save'))
    release()
    await Promise.all([view, writer])
    expect(order).toEqual(['clear-start', 'clear-end', 'save'])
  })

  it('evicting idle rooms keeps epochs monotonic for later coordinators', async () => {
    const first = getSessionCoordinator('R0')
    await first.mutate(async () => {})
    const epochBefore = first.epoch()
    for (let i = 1; i <= 70; i++) await getSessionCoordinator(`R${i}`).mutate(async () => {})
    const again = getSessionCoordinator('R0') // evicted and recreated
    expect(again.epoch()).toBeGreaterThanOrEqual(epochBefore)
  })
})
