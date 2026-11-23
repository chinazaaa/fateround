import { describe, expect, it, vi } from 'vitest'
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
  const deps = { read: async () => store.current, probe, write, clear }
  return { store, write, clear, probe, deps }
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
})
