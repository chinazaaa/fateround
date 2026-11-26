import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, HOST_TOKEN, codeParams, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

const deferred: Promise<unknown>[] = []
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => Promise<unknown>) => {
    deferred.push(fn())
  },
}))
vi.mock('server-only', () => ({}))

const game: Record<string, unknown> = gameRow({ status: 'active', game_type: 'scrabble' })
const supabase = makeSupabaseStub({
  games: () => ({ data: game, error: null }),
})
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => supabase }))
vi.mock('@/lib/push', () => ({ notifyGameEvent: async () => {} }))

const state = vi.hoisted(() => ({ result: {} as { error: string | null; skipped?: boolean } }))
vi.mock('@/lib/scrabble', () => ({ finishScrabbleGameEarly: async () => state.result }))

type Post = typeof import('./route').POST
let POST: Post
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  deferred.length = 0
})

const post = () => POST(jsonRequest(`/api/games/${GAME_CODE}/finish-game`, { hostToken: HOST_TOKEN }), codeParams())

describe('POST /api/games/[code]/finish-game — Word Tiles host end', () => {
  it('answers success when the round was ended', async () => {
    state.result = { error: null }
    expect((await post()).status).toBe(200)
  })

  it('answers 409 when a play won the session race and the round is still running', async () => {
    state.result = { error: null, skipped: true }
    expect((await post()).status).toBe(409)
  })

  it('answers 500 on a real failure', async () => {
    state.result = { error: 'Something went wrong. Please try again.' }
    expect((await post()).status).toBe(500)
  })
})
