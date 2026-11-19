import { describe, it, expect } from 'vitest'
import { createSerialQueue } from './serial-queue'

describe('createSerialQueue', () => {
  it('starts a task only after the previous one has finished, in enqueue order', async () => {
    const enqueue = createSerialQueue()
    const log: string[] = []
    const slowDeath = enqueue(async () => {
      log.push('death:start')
      await new Promise((r) => setTimeout(r, 20))
      log.push('death:end')
    })
    const clear = enqueue(async () => {
      log.push('clear:start')
    })
    await Promise.all([slowDeath, clear])
    expect(log).toEqual(['death:start', 'death:end', 'clear:start'])
  })

  it('keeps running later tasks after an earlier one rejects', async () => {
    const enqueue = createSerialQueue()
    const failing = enqueue(async () => {
      throw new Error('boom')
    })
    const next = enqueue(async () => 'ok')
    await expect(failing).rejects.toThrow('boom')
    await expect(next).resolves.toBe('ok')
  })
})
