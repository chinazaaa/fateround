import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import {
  HOST_TOKEN,
  WRONG_TOKEN,
  codeParams,
  jsonRequest,
  makeSupabaseStub,
  tournamentRow,
} from '@/test-support/tournament-host-auth'

/**
 * Authorization contract for POST/DELETE /api/tournaments/[code]/branding/logo.
 *
 * The load-bearing property here is ORDER, not just outcome: POST's missing-token 400 and its
 * whole auth ladder run BEFORE `req.formData()`, so an unauthenticated caller can never make
 * the server buffer a multipart upload. Every rejecting case asserts `formData()` was not
 * called; the authorized case asserts it was.
 */

vi.mock('server-only', () => ({}))

let tournament: Record<string, unknown> | null = tournamentRow({ branding: { primaryColor: '#fff' } })
let tournamentLookups = 0
const removed: string[][] = []

function stub() {
  const base = makeSupabaseStub({
    tournaments: ({ op }) => {
      if (op === 'select') tournamentLookups += 1
      return { data: tournament, error: null }
    },
  })
  return {
    ...base,
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        remove: async (paths: string[]) => {
          removed.push(paths)
          return { error: null }
        },
        getPublicUrl: () => ({ data: { publicUrl: 'https://cdn.test/logo.png' } }),
      }),
    },
  }
}

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => stub() }))
// The flood backstop runs before authorization and is not what these tests are about.
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => null),
  RATE_LIMITS: { tournamentLogoUpload: { limit: 10, windowSeconds: 60 } },
}))

type Post = typeof import('./route').POST
type Delete = typeof import('./route').DELETE
let POST: Post
let DELETE: Delete

beforeEach(async () => {
  tournament = tournamentRow({ branding: { primaryColor: '#fff' } })
  tournamentLookups = 0
  removed.length = 0
  ;({ POST, DELETE } = await import('./route'))
})

/**
 * A multipart upload request whose `formData()` is counted. The body is a real, non-trivial
 * multipart payload so "was it buffered?" is a meaningful question.
 */
function uploadRequest(headers: Record<string, string> = {}) {
  const bytes = new Uint8Array(4096)
  // Real PNG magic bytes, so the authorized path reaches storage instead of the content check.
  bytes.set([0x89, 0x50, 0x4e, 0x47])
  const form = new FormData()
  form.set('file', new File([bytes], 'logo.png', { type: 'image/png' }))
  const req = new NextRequest('https://test.local/api/tournaments/abcd/branding/logo', {
    method: 'POST',
    headers,
    body: form,
  })
  const reads = vi.fn()
  const original = req.formData.bind(req)
  req.formData = () => {
    reads()
    return original()
  }
  return { req, reads }
}

async function upload(headers: Record<string, string> = {}) {
  const { req, reads } = uploadRequest(headers)
  const res = await POST(req, codeParams())
  return { status: res.status, body: await res.json(), formDataReads: reads.mock.calls.length }
}

async function remove(body: unknown) {
  const res = await DELETE(jsonRequest('/api/tournaments/abcd/branding/logo', body, 'DELETE'), codeParams())
  return { status: res.status, body: await res.json() }
}

describe('POST /api/tournaments/[code]/branding/logo host authorization', () => {
  it('400s "Missing hostToken" without reading the tournament OR the multipart body', async () => {
    const res = await upload()
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Missing hostToken' })
    expect(tournamentLookups).toBe(0)
    expect(res.formDataReads).toBe(0)
  })

  it('400s "Missing hostToken" on an empty x-host-token header, before any buffering', async () => {
    const res = await upload({ 'x-host-token': '' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Missing hostToken' })
    expect(tournamentLookups).toBe(0)
    expect(res.formDataReads).toBe(0)
  })

  it('404s when the tournament does not exist, without buffering the upload', async () => {
    tournament = null
    const res = await upload({ 'x-host-token': HOST_TOKEN })
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Tournament not found' })
    expect(res.formDataReads).toBe(0)
  })

  it('403s on a wrong host token, without buffering the upload', async () => {
    const res = await upload({ 'x-host-token': WRONG_TOKEN })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Unauthorized' })
    expect(res.formDataReads).toBe(0)
  })

  it.each(['waiting', 'active', 'scheduled', 'finished'])(
    'reads the body only after authorization passes, whatever the status is (%s)',
    async (status) => {
      tournament = tournamentRow({ status, branding: null })
      const res = await upload({ 'x-host-token': HOST_TOKEN })
      // No status gate on this route: an authorized host gets past the ladder in every state,
      // and only then is the multipart payload read.
      expect(res.formDataReads).toBe(1)
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ logoUrl: expect.stringContaining('https://cdn.test/logo.png?v=') })
    }
  )
})

describe('DELETE /api/tournaments/[code]/branding/logo host authorization', () => {
  it('400s "Missing hostToken" without reading the tournament', async () => {
    const res = await remove({})
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Missing hostToken' })
    expect(tournamentLookups).toBe(0)
  })

  it('400s "Missing hostToken" on an empty hostToken', async () => {
    const res = await remove({ hostToken: '' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Missing hostToken' })
    expect(tournamentLookups).toBe(0)
  })

  it('400s on an unparseable body — a client fault, decided before the auth ladder', async () => {
    const res = await remove('')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid or empty request body' })
    expect(tournamentLookups).toBe(0)
  })

  it('404s when the tournament does not exist', async () => {
    tournament = null
    const res = await remove({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Tournament not found' })
  })

  it('403s on a wrong host token', async () => {
    const res = await remove({ hostToken: WRONG_TOKEN })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it.each(['waiting', 'active', 'scheduled', 'finished'])(
    'authorizes a delete whatever the status is (%s)',
    async (status) => {
      tournament = tournamentRow({ status, branding: { logoUrl: 'https://cdn.test/logo.png' } })
      const res = await remove({ hostToken: HOST_TOKEN })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
      expect(removed.length).toBe(1)
    }
  )
})
