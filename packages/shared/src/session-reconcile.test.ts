import { describe, expect, it, vi } from 'vitest'
import { createSessionCoordinator } from './session-coordinator'
import { reconcileSession, type ReconcileProbe } from './session-reconcile'

type S = { playerId: string; resumeToken: string | null }
const old: S = { playerId: 'p-old', resumeToken: 'TOK-OLD' }
const fresh: S = { playerId: 'p-new', resumeToken: 'TOK-NEW' }

function setup(initial: S | null, result: ReconcileProbe<S>, during?: (store: { current: S | null }) => void) {
  const store = { current: initial }
  const write = vi.fn(async (s: S) => {
    store.current = s
  })
  const clear = vi.fn(async () => {
    store.current = null
  })
  const probe = vi.fn(async () => {
    during?.(store)
    return result
  })
  const coordinator = createSessionCoordinator()
  const deps = { coordinator, read: async () => store.current, probe, write, clear }
  return { store, write, clear, probe, deps, coordinator }
}

describe('reconcileSession', () => {
  it('keeps a session that is in the roster without probing', async () => {
    const h = setup(old, { kind: 'gone' })
    expect(await reconcileSession([{ id: 'p-old' }], h.deps)).toEqual(old)
    expect(h.probe).not.toHaveBeenCalled()
  })

  it('clears on a confirmed gone', async () => {
    const h = setup(old, { kind: 'gone' })
    expect(await reconcileSession([], h.deps)).toBeNull()
    expect(h.clear).toHaveBeenCalledTimes(1)
  })

  it('keeps the session on an unverifiable probe', async () => {
    const h = setup(old, { kind: 'unknown' })
    expect(await reconcileSession([], h.deps)).toEqual(old)
    expect(h.clear).not.toHaveBeenCalled()
  })

  it('re-keys a drifted id', async () => {
    const h = setup(old, { kind: 'row', session: { playerId: 'p-real', resumeToken: 'TOK-OLD' } })
    expect((await reconcileSession([], h.deps))?.playerId).toBe('p-real')
    expect(h.write).toHaveBeenCalledTimes(1)
  })

  it('does not clear a newer session saved while the probe was in flight', async () => {
    const h = setup(old, { kind: 'gone' }, (s) => (s.current = fresh))
    expect(await reconcileSession([], h.deps)).toEqual(fresh)
    expect(h.clear).not.toHaveBeenCalled()
    expect(h.store.current).toEqual(fresh)
  })

  it('does not overwrite a newer session when the probe returned a re-key', async () => {
    const h = setup(
      old,
      { kind: 'row', session: { playerId: 'p-real', resumeToken: 'TOK-OLD' } },
      (s) => (s.current = fresh)
    )
    expect(await reconcileSession([], h.deps)).toEqual(fresh)
    expect(h.write).not.toHaveBeenCalled()
  })

  it('does not clear when the session was already removed elsewhere', async () => {
    const h = setup(old, { kind: 'gone' }, (s) => (s.current = null))
    expect(await reconcileSession([], h.deps)).toBeNull()
    expect(h.clear).not.toHaveBeenCalled()
  })

  it('a superseded run writes nothing even when the stored session is unchanged', async () => {
    let current = true
    const h = setup(old, { kind: 'gone' }, () => (current = false))
    await reconcileSession([], { ...h.deps, isCurrent: () => current })
    expect(h.clear).not.toHaveBeenCalled()
    expect(h.store.current).toEqual(old)
  })

  it('a run superseded while the exclusive step re-reads the session writes nothing', async () => {
    let current = true
    const h = setup(old, { kind: 'gone' })
    let reads = 0
    const read = async () => {
      reads += 1
      // 1st read = the initial one; 2nd = the re-read inside the exclusive step.
      if (reads === 2) current = false
      return h.store.current
    }
    expect(await reconcileSession([], { ...h.deps, read, isCurrent: () => current })).toEqual(old)
    expect(h.clear).not.toHaveBeenCalled()
    expect(h.store.current).toEqual(old)
  })

  describe('against a join save still in flight in the room coordinator', () => {
    /** A save through the coordinator whose storage write is held open until `finish()`. */
    function pendingJoinSave(h: ReturnType<typeof setup>) {
      let finish!: () => void
      const gate = new Promise<void>((r) => (finish = r))
      const save = h.coordinator.mutate(async () => {
        await gate
        h.store.current = fresh
      })
      return { save, finish }
    }

    it('does not clear the new seat when the join save was not yet visible in storage', async () => {
      const h = setup(old, { kind: 'gone' })
      const join = pendingJoinSave(h) // running: storage still holds `old`
      const reconciled = reconcileSession([], h.deps) // reads `old`, probes, then wants to clear
      await Promise.resolve()
      join.finish()
      await join.save
      expect(await reconciled).toEqual(fresh)
      expect(h.clear).not.toHaveBeenCalled()
      expect(h.store.current).toEqual(fresh)
    })

    it('does not overwrite the new seat with a re-key queued behind the join save', async () => {
      const h = setup(old, { kind: 'row', session: { playerId: 'p-real', resumeToken: 'TOK-OLD' } })
      const join = pendingJoinSave(h)
      const reconciled = reconcileSession([], h.deps)
      await Promise.resolve()
      join.finish()
      await join.save
      expect(await reconciled).toEqual(fresh)
      expect(h.write).not.toHaveBeenCalled()
      expect(h.store.current).toEqual(fresh)
    })

    it('a save that completed between the read and the step (even one writing identical data) invalidates the run', async () => {
      // The re-read alone would see the same id/token here; only the epoch shows a save happened.
      const h = setup(old, { kind: 'gone' }, () => void h.coordinator.mutate(async () => {}))
      expect(await reconcileSession([], h.deps)).toEqual(old)
      expect(h.clear).not.toHaveBeenCalled()
    })

    it('still clears a confirmed-gone session when nothing else touched the room', async () => {
      const h = setup(old, { kind: 'gone' })
      expect(await reconcileSession([], h.deps)).toBeNull()
      expect(h.clear).toHaveBeenCalledTimes(1)
      expect(h.coordinator.epoch() % 2).toBe(0) // the commit bumped and settled the epoch
    })

    it('runs the clear inside the exclusive step: a save queued while it runs waits and lands after', async () => {
      const order: string[] = []
      const h = setup(old, { kind: 'gone' })
      let later: Promise<void> | undefined
      const clear = vi.fn(async () => {
        order.push('clear-start')
        later = h.coordinator.mutate(async () => {
          order.push('save')
          h.store.current = fresh
        })
        await Promise.resolve()
        h.store.current = null
        order.push('clear-end')
      })
      await reconcileSession([], { ...h.deps, clear })
      await later
      expect(order).toEqual(['clear-start', 'clear-end', 'save'])
      expect(h.store.current).toEqual(fresh)
    })
  })
})
