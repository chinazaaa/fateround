import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dispatchDueTournamentReminders } from '@/lib/tournament-reminders'

/**
 * Captures the filters applied to each `select` chain so the tests can assert
 * on the due-window, and lets each test decide which tournaments come back and
 * whether the conditional claim wins.
 */
type Filters = Record<string, string>

const selectResults: Array<{ rows: unknown[]; filters: Filters }> = []
let claimWins = true
const claimedColumns: string[] = []

function selectChain(filters: Filters) {
  const chain = {
    neq: () => chain,
    not: () => chain,
    gt: (col: string, val: string) => {
      filters[`gt:${col}`] = val
      return chain
    },
    gte: (col: string, val: string) => {
      filters[`gte:${col}`] = val
      return chain
    },
    lte: (col: string, val: string) => {
      filters[`lte:${col}`] = val
      return chain
    },
    is: (col: string) => {
      filters[`is:${col}`] = 'null'
      return chain
    },
    limit: () => Promise.resolve({ data: selectResults.shift()?.rows ?? [], error: null }),
  }
  return chain
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => {
        const pending = selectResults[0]
        return selectChain(pending?.filters ?? {})
      },
      update: (patch: Record<string, string>) => {
        claimedColumns.push(Object.keys(patch)[0])
        const chain = {
          eq: () => chain,
          is: () => chain,
          select: () => chain,
          maybeSingle: () => Promise.resolve({ data: claimWins ? { id: 'T1' } : null, error: null }),
        }
        return chain
      },
    }),
  }),
}))

const notify = vi.fn()
vi.mock('@/lib/tournament-push', () => ({
  notifyTournamentEvent: (...args: unknown[]) => notify(...args),
}))

const NOW = new Date('2026-09-20T19:00:00.000Z')

function queue(t15: unknown[], t0: unknown[]) {
  selectResults.length = 0
  selectResults.push({ rows: t15, filters: {} }, { rows: t0, filters: {} })
}

beforeEach(() => {
  notify.mockClear()
  claimedColumns.length = 0
  claimWins = true
})

describe('dispatchDueTournamentReminders', () => {
  it('sends a T-15 reminder and marks the t15 column', async () => {
    queue([{ id: 'T1', title: 'Youth Night' }], [])
    const out = await dispatchDueTournamentReminders(NOW)

    expect(out).toEqual([{ id: 'T1', kind: 'starts_in_15' }])
    expect(claimedColumns).toEqual(['push_sent_t15_at'])
    expect(notify).toHaveBeenCalledWith('T1', 'starts_in_15', expect.objectContaining({ body: expect.any(String) }))
  })

  it('sends a T-0 reminder and marks the t0 column', async () => {
    queue([], [{ id: 'T1', title: 'Youth Night' }])
    const out = await dispatchDueTournamentReminders(NOW)

    expect(out).toEqual([{ id: 'T1', kind: 'starts_now' }])
    expect(claimedColumns).toEqual(['push_sent_t0_at'])
  })

  // The claim is what makes this safe to run in more than one container: whoever
  // flips the column from null wins, and the loser must stay silent.
  it('does not send when another instance already claimed the reminder', async () => {
    claimWins = false
    queue([{ id: 'T1', title: 'Youth Night' }], [])
    const out = await dispatchDueTournamentReminders(NOW)

    expect(out).toEqual([])
    expect(notify).not.toHaveBeenCalled()
  })

  it('sends nothing when nothing is due', async () => {
    queue([], [])
    expect(await dispatchDueTournamentReminders(NOW)).toEqual([])
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('due-window boundaries', () => {
  it('T-15 looks ahead exactly 15 minutes and excludes already-started events', async () => {
    const filters: Filters = {}
    selectResults.length = 0
    selectResults.push({ rows: [], filters }, { rows: [], filters: {} })
    await dispatchDueTournamentReminders(NOW)

    // Upper bound: now + 15 min. Lower bound: strictly after now (not started).
    expect(filters['lte:scheduled_at']).toBe(new Date(NOW.getTime() + 15 * 60_000).toISOString())
    expect(filters['gt:scheduled_at']).toBe(NOW.toISOString())
    expect(filters['is:push_sent_t15_at']).toBe('null')
  })

  it('T-0 covers a 10-minute grace window after the start time', async () => {
    const filters: Filters = {}
    selectResults.length = 0
    selectResults.push({ rows: [], filters: {} }, { rows: [], filters })
    await dispatchDueTournamentReminders(NOW)

    // Fires for events that have started, back to 10 minutes ago — so a restart
    // over the exact moment still delivers, without spamming stale events.
    expect(filters['lte:scheduled_at']).toBe(NOW.toISOString())
    expect(filters['gte:scheduled_at']).toBe(new Date(NOW.getTime() - 10 * 60_000).toISOString())
    expect(filters['is:push_sent_t0_at']).toBe('null')
  })
})
