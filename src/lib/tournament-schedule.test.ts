import { describe, it, expect } from 'vitest'
import { buildTournamentIcs, formatCountdown, DEFAULT_ALARM_MINUTES_BEFORE } from './tournament-schedule'
import type { Tournament } from '@/types/tournament'

function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 'ABC123',
    title: 'Youth Night',
    status: 'waiting',
    scheduled_at: '2026-09-20T19:00:00.000Z',
    created_at: '2026-09-01T10:00:00.000Z',
    ...overrides,
  } as Tournament
}

const STAMP = '2026-09-01T10:00:00.000Z'
const INVITE = 'https://fateround.com/tournament/ABC123'

describe('buildTournamentIcs', () => {
  // Regression: foldIcsLine used to rewind its cursor by one on every
  // continuation, so it never advanced past the final single-character chunk
  // and hung the browser tab. Any line over 74 chars reproduced it — including
  // the real DESCRIPTION line, which is 75.
  it('terminates on lines longer than the fold limit', () => {
    const ics = buildTournamentIcs(tournament(), INVITE, 3600, STAMP)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('END:VCALENDAR')
  })

  it('terminates with a very long title', () => {
    const ics = buildTournamentIcs(tournament({ title: 'A'.repeat(500) }), INVITE, 3600, STAMP)
    expect(ics).toContain('END:VEVENT')
  })

  it('folds to lines within the 75-octet limit', () => {
    const ics = buildTournamentIcs(tournament({ title: 'B'.repeat(300) }), INVITE, 3600, STAMP)
    for (const line of ics.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(75)
    }
  })

  it('round-trips folded content without dropping or duplicating characters', () => {
    const title = 'C'.repeat(200)
    const ics = buildTournamentIcs(tournament({ title }), INVITE, 3600, STAMP)
    // Unfold per RFC 5545: a CRLF followed by a single space is a continuation.
    const unfolded = ics.replace(/\r\n /g, '')
    expect(unfolded).toContain(`SUMMARY:${title}`)
  })

  it('uses CRLF line endings and emits one alarm per configured reminder', () => {
    const ics = buildTournamentIcs(tournament(), INVITE, 3600, STAMP)
    expect(ics.endsWith('\r\n')).toBe(true)
    const alarms = ics.match(/BEGIN:VALARM/g) ?? []
    expect(alarms).toHaveLength(DEFAULT_ALARM_MINUTES_BEFORE.length)
  })

  it('throws when the tournament has no scheduled time', () => {
    expect(() => buildTournamentIcs(tournament({ scheduled_at: null }), INVITE, 3600, STAMP)).toThrow()
  })
})

describe('formatCountdown', () => {
  it('describes future and past events', () => {
    expect(formatCountdown(5 * 60_000)).toBe('in 5m')
    expect(formatCountdown(-3 * 60 * 60_000)).toBe('started 3h ago')
    expect(formatCountdown(0)).toBe('starting now')
  })
})
