import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { claimGameStart, releaseGameStart, START_CLAIM_TTL_MS } from './game-start-claim'

type Call = { method: string; args: unknown[] }

function stub(result: { data: unknown; error: { message: string } | null }) {
  const calls: Call[] = []
  const chain: Record<string, unknown> = {}
  for (const method of ['from', 'update', 'eq', 'or', 'select']) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return method === 'select' || method === 'eq' ? Object.assign(Promise.resolve(result), chain) : chain
    }
  }
  return { client: chain as unknown as SupabaseClient, calls }
}

describe('claimGameStart', () => {
  it('claims only a waiting lobby with no live claim, in one conditional update', async () => {
    const { client, calls } = stub({ data: [{ id: 'ABCD' }], error: null })
    const claim = await claimGameStart(client, 'ABCD')
    expect(claim.ok).toBe(true)
    const by = (m: string) => calls.filter((c) => c.method === m).map((c) => c.args)
    expect(by('eq')).toEqual([
      ['id', 'ABCD'],
      ['status', 'waiting'],
    ])
    const [filter] = by('or')[0] as [string]
    expect(filter).toMatch(/^start_claimed_at\.is\.null,start_claimed_at\.lt\./)
    const cutoff = Date.parse(filter.split('start_claimed_at.lt.')[1])
    expect(Date.now() - cutoff).toBeGreaterThanOrEqual(START_CLAIM_TTL_MS - 1000)
  })

  it('reports a lost claim when no row came back', async () => {
    const { client } = stub({ data: [], error: null })
    await expect(claimGameStart(client, 'ABCD')).resolves.toEqual({ ok: false })
  })

  it('fails open on a database error, so a host can still start', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = stub({ data: null, error: { message: 'column "start_claimed_at" does not exist' } })
    await expect(claimGameStart(client, 'ABCD')).resolves.toEqual({ ok: true, token: null })
    err.mockRestore()
  })
})

describe('releaseGameStart', () => {
  it('clears only the claim it took', async () => {
    const { client, calls } = stub({ data: null, error: null })
    await releaseGameStart(client, 'ABCD', '2026-01-01T00:00:00.000Z')
    expect(calls.find((c) => c.method === 'update')?.args).toEqual([{ start_claimed_at: null }])
    expect(calls.filter((c) => c.method === 'eq').map((c) => c.args)).toEqual([
      ['id', 'ABCD'],
      ['start_claimed_at', '2026-01-01T00:00:00.000Z'],
    ])
  })

  it('does nothing for a claim that was never taken', async () => {
    const { client, calls } = stub({ data: null, error: null })
    await releaseGameStart(client, 'ABCD', null)
    expect(calls).toHaveLength(0)
  })
})
