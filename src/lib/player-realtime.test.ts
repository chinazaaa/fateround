import { describe, expect, it } from 'vitest'
import { applyPlayerChange } from './player-realtime'

type P = { id: string; name: string; spectator: boolean }
const a: P = { id: 'a', name: 'A', spectator: false }
const v: P = { id: 'v', name: 'V', spectator: true }

describe('applyPlayerChange', () => {
  it('INSERT adds a row once', () => {
    expect(applyPlayerChange([a], { eventType: 'INSERT', new: v })).toEqual([a, v])
    expect(applyPlayerChange([a, v], { eventType: 'INSERT', new: v })).toEqual([a, v])
  })

  it('UPDATE merges the changed row, so a viewer readying up becomes a participant', () => {
    const next = applyPlayerChange([a, v], { eventType: 'UPDATE', new: { ...v, spectator: false } })
    expect(next).toEqual([a, { ...v, spectator: false }])
    expect(next.filter((p) => !p.spectator)).toHaveLength(2)
  })

  it('UPDATE keeps fields the partial payload omits', () => {
    const next = applyPlayerChange([a, v], { eventType: 'UPDATE', new: { id: 'v', spectator: false } as P })
    expect(next[1]).toEqual({ id: 'v', name: 'V', spectator: false })
  })

  it('UPDATE for an unseen row adds it', () => {
    expect(applyPlayerChange([a], { eventType: 'UPDATE', new: v })).toEqual([a, v])
  })

  it('DELETE removes by id', () => {
    expect(applyPlayerChange([a, v], { eventType: 'DELETE', old: { id: 'a' } })).toEqual([v])
  })
})
