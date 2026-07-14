// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

type ProbeResult = { data: { id: string } | null; error: unknown }

const h = vi.hoisted(() => ({
  probe: { data: null, error: null } as ProbeResult,
  // With `deferred`, maybeSingle() hangs until the test calls resolveProbe — which lets a
  // test drive a roster rerender while a confirmation is still in flight.
  deferred: false,
  resolveProbe: null as null | ((result: ProbeResult) => void),
  probeCount: 0,
}))

vi.mock('@/lib/supabase', () => {
  const chain = () => {
    const o: Record<string, unknown> = {
      select: () => o,
      eq: () => o,
      maybeSingle: () => {
        h.probeCount++
        if (!h.deferred) return Promise.resolve(h.probe)
        return new Promise<ProbeResult>((resolve) => {
          h.resolveProbe = resolve
        })
      },
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
  h.deferred = false
  h.resolveProbe = null
  h.probeCount = 0
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

  it('keeps the host seated when the confirmation probe is unverifiable', async () => {
    const { onSelfRemoved, rendered } = setup()
    // The roster is empty and the probe can't answer (permission denied / network / 5xx).
    // Unverifiable is not proof — never demote on it.
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

  it('still reconciles a genuine removal when the roster rerenders mid-probe', async () => {
    // The probe is the only confirmation in flight. A roster rerender must not discard it:
    // with realtime connected the fallback poll is off, so there may be no later roster to
    // retrigger the check, and the host's stale "Playing as …" bar would linger forever.
    h.deferred = true
    const { onSelfRemoved, rendered } = setup()

    rendered.rerender({ players: [{ id: 'other' }] })
    await waitFor(() => expect(h.resolveProbe).not.toBeNull())

    // A fresh roster lands (still no host) while the confirmation is pending.
    rendered.rerender({ players: [{ id: 'other' }, { id: 'third' }] })

    h.resolveProbe!({ data: null, error: null })

    await waitFor(() => expect(onSelfRemoved).toHaveBeenCalledTimes(1))
  })

  it('drops a pending probe result if the host is back in the roster by the time it lands', async () => {
    h.deferred = true
    const { onSelfRemoved, rendered } = setup()

    rendered.rerender({ players: [{ id: 'other' }] })
    await waitFor(() => expect(h.resolveProbe).not.toBeNull())

    // The host reappears — the absence was stale, so the in-flight answer is now moot.
    rendered.rerender({ players: seated })
    h.resolveProbe!({ data: null, error: null })

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
