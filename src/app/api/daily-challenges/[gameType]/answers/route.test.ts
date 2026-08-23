import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const watToday = vi.fn(() => '2026-08-22')
vi.mock('@/lib/community-dates', () => ({ watToday: () => watToday() }))

const rows: Record<string, unknown> = {}
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: (_col: string, date: string) => ({ maybeSingle: () => Promise.resolve({ data: rows[date] ?? null }) }),
        }),
      }),
    }),
  }),
}))

import { GET } from './route'

/**
 * The date gate is the entire security model of this route.
 *
 * Answers for a LIVE puzzle would let someone fail on one device, read the solution, and enter
 * a perfect score on another. There is deliberately no "but I already submitted" bypass and no
 * signed-in exception — the only question asked is whether the date is in the past, so there is
 * exactly one thing to get right and these tests hold it.
 */
// `date === undefined` omits the param entirely (the default-to-yesterday path); an empty
// string still sends `?date=`, which is a different case and must not silently default.
const get = (gameType: string, date?: string) =>
  GET(
    new NextRequest(
      `https://fateround.test/api/daily-challenges/${gameType}/answers${
        date === undefined ? '' : `?date=${encodeURIComponent(date)}`
      }`
    ),
    { params: Promise.resolve({ gameType }) }
  )

beforeEach(() => {
  for (const key of Object.keys(rows)) delete rows[key]
  watToday.mockReturnValue('2026-08-22')
  rows['2026-08-21'] = { id: 'c1', game_type: 'wordle', challenge_date: '2026-08-21', puzzle_data: { word: 'crane' } }
  rows['2026-08-22'] = { id: 'c2', game_type: 'wordle', challenge_date: '2026-08-22', puzzle_data: { word: 'plumb' } }
})

describe('GET daily-challenge answers', () => {
  it("refuses today's answers", async () => {
    const res = await get('wordle', '2026-08-22')
    expect(res.status).toBe(403)
    expect(JSON.stringify(await res.json())).not.toContain('plumb')
  })

  it('refuses a future date', async () => {
    const res = await get('wordle', '2099-01-01')
    expect(res.status).toBe(403)
  })

  it('serves a past date', async () => {
    const res = await get('wordle', '2026-08-21')
    expect(res.status).toBe(200)
    expect(JSON.stringify(await res.json())).toContain('CRANE')
  })

  it('defaults to yesterday', async () => {
    const res = await get('wordle')
    expect(res.status).toBe(200)
    expect((await res.json()).challengeDate).toBe('2026-08-21')
  })

  it('re-reads the date on every request, so it cannot go stale across midnight', async () => {
    // Yesterday's answers must stop being yesterday's. If `today` were captured once at module
    // load, a long-lived server would keep serving the previous day's rule after WAT midnight —
    // which is the moment the puzzle that was safe to reveal becomes today's live one.
    watToday.mockReturnValue('2026-08-21')
    const res = await get('wordle', '2026-08-21')
    expect(res.status).toBe(403)
  })

  it('rejects a malformed date instead of coercing it', async () => {
    for (const bad of ['yesterday', '2026-8-1', '', '2026-08-21T00:00:00Z']) {
      expect((await get('wordle', bad)).status, bad).not.toBe(200)
    }
  })

  it('rejects an unknown game type', async () => {
    expect((await get('not_a_game', '2026-08-21')).status).toBe(400)
  })

  it('404s a date with no challenge rather than erroring', async () => {
    expect((await get('wordle', '2020-01-01')).status).toBe(404)
  })
})
