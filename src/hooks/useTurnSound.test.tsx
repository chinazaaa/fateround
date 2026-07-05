// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const playSpy = vi.hoisted(() => vi.fn())
vi.mock('@/lib/sounds', () => ({ playRoundStartSound: playSpy }))

import { useTurnSound } from './useTurnSound'

type Props = { turnId: string | null; myPlayerId: string | null; enabled: boolean }

beforeEach(() => playSpy.mockReset())

function renderSound(initial: Props) {
  return renderHook((p: Props) => useTurnSound(p.turnId, p.myPlayerId, p.enabled), { initialProps: initial })
}

describe('useTurnSound', () => {
  it('does not fire on first render (baseline only)', () => {
    renderSound({ turnId: 'me', myPlayerId: 'me', enabled: true })
    expect(playSpy).not.toHaveBeenCalled()
  })

  it('fires when the turn changes to my player id', () => {
    const { rerender } = renderSound({ turnId: 'opp', myPlayerId: 'me', enabled: true })
    expect(playSpy).not.toHaveBeenCalled() // baseline = 'opp'
    rerender({ turnId: 'me', myPlayerId: 'me', enabled: true })
    expect(playSpy).toHaveBeenCalledTimes(1)
  })

  it('does not fire when the turn changes to someone else', () => {
    const { rerender } = renderSound({ turnId: 'me', myPlayerId: 'me', enabled: true })
    rerender({ turnId: 'opp', myPlayerId: 'me', enabled: true })
    expect(playSpy).not.toHaveBeenCalled()
  })

  it('does not fire when the turn id is unchanged', () => {
    const { rerender } = renderSound({ turnId: 'opp', myPlayerId: 'me', enabled: true })
    rerender({ turnId: 'me', myPlayerId: 'me', enabled: true })
    playSpy.mockReset()
    rerender({ turnId: 'me', myPlayerId: 'me', enabled: true })
    expect(playSpy).not.toHaveBeenCalled()
  })

  it('does not fire when disabled', () => {
    const { rerender } = renderSound({ turnId: 'opp', myPlayerId: 'me', enabled: false })
    rerender({ turnId: 'me', myPlayerId: 'me', enabled: false })
    expect(playSpy).not.toHaveBeenCalled()
  })
})
