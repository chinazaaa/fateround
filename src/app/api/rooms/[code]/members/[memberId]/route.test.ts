import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Authorization contract for DELETE /api/rooms/[code]/members/[memberId].
 *
 * Removing a member is a room-owner-only action, and the only thing standing between a
 * passer-by and kicking a room's members is `creator_token`. These tests pin the exact
 * ladder — 401 for a missing token, 404 for an unknown room, 403 for a wrong token (and
 * for a room whose stored token is null, which must never authorize an empty-ish match) —
 * so the shared `verifyRoomCreator` helper can be swapped in underneath without any
 * observable change to what a caller gets back.
 */

// `server-only` is a Next runtime guard, not an npm package — it isn't resolvable under Vitest.
vi.mock('server-only', () => ({}))

const ROOMS: Record<string, { creator_token: string | null }> = {
  ROOM1: { creator_token: 'creator-secret' },
  NULLTOK: { creator_token: null },
}

const deleteEq = vi.fn()
let deleteError: { message: string } | null = null

/** Minimal PostgREST-shaped stub: rooms `.select().eq().maybeSingle()` and room_members `.delete().eq().eq()`. */
function makeAdmin() {
  return {
    from: (table: string) => {
      const filters: Record<string, unknown> = {}
      const chain = {
        select: () => chain,
        delete: () => chain,
        eq: (column: string, value: unknown) => {
          filters[column] = value
          if (table === 'room_members') deleteEq(column, value)
          return chain
        },
        maybeSingle: async () => {
          if (table === 'rooms') return { data: ROOMS[String(filters.id)] ?? null, error: null }
          return { data: null, error: null }
        },
        // `await`ing the delete chain resolves it, PostgREST-style.
        then: (resolve: (v: { error: { message: string } | null }) => unknown) => resolve({ error: deleteError }),
      }
      return chain
    },
  }
}

const admin = makeAdmin()
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => admin }))

// Loaded lazily: a static import is hoisted above the stubs above.
type Delete = typeof import('./route').DELETE
let DELETE: Delete

async function remove(code: string, memberId: string, body: Record<string, unknown>) {
  return DELETE(
    new NextRequest(`https://x.test/api/rooms/${code}/members/${memberId}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ code, memberId }) }
  )
}

beforeEach(async () => {
  DELETE ??= (await import('./route')).DELETE
  deleteEq.mockClear()
  deleteError = null
})

describe('DELETE /api/rooms/[code]/members/[memberId]', () => {
  it('401s a missing or empty creator token before looking the room up', async () => {
    for (const body of [{}, { creatorToken: '' }]) {
      const res = await remove('ROOM1', 'm-1', body)
      expect(res.status).toBe(401)
      await expect(res.json()).resolves.toEqual({ error: 'Creator token required' })
    }
    expect(deleteEq).not.toHaveBeenCalled()
  })

  it('404s an unknown room', async () => {
    const res = await remove('NOPE', 'm-1', { creatorToken: 'creator-secret' })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Room not found' })
    expect(deleteEq).not.toHaveBeenCalled()
  })

  it('403s a wrong creator token', async () => {
    const res = await remove('ROOM1', 'm-1', { creatorToken: 'not-the-secret' })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(deleteEq).not.toHaveBeenCalled()
  })

  it('403s a room whose stored creator_token is null, whatever is offered', async () => {
    const res = await remove('NULLTOK', 'm-1', { creatorToken: 'anything' })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(deleteEq).not.toHaveBeenCalled()
  })

  it('deletes the member and returns ok for the room creator', async () => {
    const res = await remove('ROOM1', 'm-1', { creatorToken: 'creator-secret' })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    // Scoped to both the member and the room — never a bare id delete.
    expect(deleteEq.mock.calls).toEqual([
      ['id', 'm-1'],
      ['room_id', 'ROOM1'],
    ])
  })

  it('upper-cases the room code before authorizing', async () => {
    const res = await remove('room1', 'm-1', { creatorToken: 'creator-secret' })
    expect(res.status).toBe(200)
    expect(deleteEq).toHaveBeenCalledWith('room_id', 'ROOM1')
  })

  it('500s when the delete itself fails', async () => {
    deleteError = { message: 'boom' }
    const res = await remove('ROOM1', 'm-1', { creatorToken: 'creator-secret' })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBeTruthy()
  })
})
