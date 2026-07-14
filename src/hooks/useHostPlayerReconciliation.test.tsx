// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({ probe: { data: null as { id: string } | null, error: null as unknown } }))

vi.mock('@/lib/supabase', () => {
  const chain = () => {
    const o: Record<string, unknown> = {
      select: () => o,
      eq: () => o,
      maybeSingle: () => Promise.resolve(h.probe),
    }
    return o
  }
  return { supabase: { from: () => chain() } }
})

import { useHostPlayerReconciliation } from './useHostPlayerReconciliation'

const HOST = 'host-1'
const seated = [{ id: HOST }, { id: 'other' }]

beforeEach(() => {
  h.probe = { data: null, error: null }
})

function setup() {
  const onSelfRemoved = vi.fn()
  const rendered = renderHook(
    ({ players }: { players: { id: string }[] }) => useHostPlayerReconciliation(players, HOST, onSelfRemoved),
    { initialProps: { players: seated } }
  )
  return { onSelfRemoved, rendered }
}

describe('useHostPlayerReconciliation', () => {
  it('demotes the host once the server confirms the row is gone', async () => {
    const { onSelfRemoved, rendered } = setup()
    h.probe = { data: null, error: null }

    rendered.rerender({ players: [{ id: 'other' }] })

    await waitFor(() => expect(onSelfRemoved).toHaveBeenCalledTimes(1))
  })

  it('keeps the host seated when the roster is wiped by a failed read', async () => {
    const { onSelfRemoved, rendered } = setup()
    // A non-retriable read error (e.g. 42501) slips past supabasePollOk and the host view
    // sets players to []. The probe fails the same way — unverifiable, so never demote.
    h.probe = { data: null, error: { code: '42501', message: 'permission denied' } }

    rendered.rerender({ players: [] })

    await new Promise((r) => setTimeout(r, 20))
    expect(onSelfRemoved).not.toHaveBeenCalled()
  })

  it('keeps the host seated when a stale pre-join roster lands late', async () => {
    const { onSelfRemoved, rendered } = setup()
    // The row is still there — the roster snapshot was just captured before the host sat.
    h.probe = { data: { id: HOST }, error: null }

    rendered.rerender({ players: [{ id: 'other' }] })

    await new Promise((r) => setTimeout(r, 20))
    expect(onSelfRemoved).not.toHaveBeenCalled()
  })

  it('does not fire before the host has been seen in the roster', async () => {
    const onSelfRemoved = vi.fn()
    renderHook(() => useHostPlayerReconciliation([{ id: 'other' }], HOST, onSelfRemoved))

    await new Promise((r) => setTimeout(r, 20))
    expect(onSelfRemoved).not.toHaveBeenCalled()
  })
})
