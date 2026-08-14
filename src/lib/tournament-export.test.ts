import { describe, it, expect } from 'vitest'
import { buildParticipationCsv, resolveTournamentChampion } from './tournament-export'
import type { Tournament, TournamentGame, TournamentPlayer } from '@/types/tournament'

function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 'ABC123',
    title: 'Youth Night',
    status: 'finished',
    format: 'round-robin',
    created_at: '2026-09-01T10:00:00.000Z',
    ...overrides,
  } as Tournament
}

function player(name: string, points: number, overrides: Partial<TournamentPlayer> = {}): TournamentPlayer {
  return {
    id: `p-${name}`,
    player_name: name,
    total_points: points,
    games_played: 3,
    is_eliminated: false,
    ...overrides,
  } as TournamentPlayer
}

const NO_GAMES: TournamentGame[] = []
const EXPORTED_AT = new Date('2026-09-15T12:00:00.000Z')

describe('resolveTournamentChampion — round-robin', () => {
  it('crowns the outright points leader', () => {
    const champ = resolveTournamentChampion(tournament(), [player('Ada', 30), player('Bo', 20)], NO_GAMES)
    expect(champ?.player_name).toBe('Ada')
  })

  // The certificate is a printed artifact naming one person, and the UI promises
  // it appears "once a single champion is crowned". Previously this returned
  // whichever tied player Array.sort happened to order first.
  it('returns null when the top score is tied', () => {
    const champ = resolveTournamentChampion(tournament(), [player('Ada', 30), player('Bo', 30)], NO_GAMES)
    expect(champ).toBeNull()
  })

  it('ignores ties that are not at the top', () => {
    const champ = resolveTournamentChampion(
      tournament(),
      [player('Ada', 30), player('Bo', 20), player('Cy', 20)],
      NO_GAMES
    )
    expect(champ?.player_name).toBe('Ada')
  })

  it('returns null for an empty tournament', () => {
    expect(resolveTournamentChampion(tournament(), [], NO_GAMES)).toBeNull()
  })
})

describe('buildParticipationCsv', () => {
  // Player names are chosen by whoever joins. Excel evaluates a leading =/+/-/@
  // even inside a quoted cell, so the organiser opening the export would run it.
  it('neutralises spreadsheet formula injection in player names', () => {
    const evil = '=HYPERLINK("http://evil.com","Click")'
    const csv = buildParticipationCsv(tournament(), [player(evil, 10)], NO_GAMES, EXPORTED_AT)
    // Apostrophe-prefixed AND inner quotes doubled per RFC 4180.
    expect(csv).toContain(`"'${evil.replace(/"/g, '""')}"`)
    // The bare formula must never appear as its own cell.
    expect(csv).not.toContain(`,"${evil.replace(/"/g, '""')}"`)
  })

  it.each(['=1+1', '+1', '-1', '@SUM(A1)'])('escapes leading %s', (name) => {
    const csv = buildParticipationCsv(tournament(), [player(name, 1)], NO_GAMES, EXPORTED_AT)
    expect(csv).toContain(`"'${name}"`)
  })

  it('leaves ordinary names untouched', () => {
    const csv = buildParticipationCsv(tournament(), [player('Ada Lovelace', 10)], NO_GAMES, EXPORTED_AT)
    expect(csv).toContain('"Ada Lovelace"')
    expect(csv).not.toContain('"\'Ada')
  })

  it('still escapes embedded quotes', () => {
    const csv = buildParticipationCsv(tournament(), [player('Ad"a', 10)], NO_GAMES, EXPORTED_AT)
    expect(csv).toContain('"Ad""a"')
  })

  it('reports the export date separately from the creation date', () => {
    const csv = buildParticipationCsv(tournament(), [player('Ada', 10)], NO_GAMES, EXPORTED_AT)
    expect(csv).toContain('"Created","2026-09-01"')
    expect(csv).toContain('"Exported","2026-09-15"')
  })
})
